const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load players resiliently
let P = [];
try {
  P = require("./players.json");
} catch(e) {
  try {
    P = require("../players.json");
  } catch(e2) {
    const raw = fs.readFileSync(path.join(__dirname, "players.json"), "utf8");
    P = JSON.parse(raw);
  }
}

const U = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const T = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const hasRedis = !!(U && T);

const DEFAULT_PIN = "1234";
const HOST_PIN = process.env.HOST_PIN || DEFAULT_PIN;

const BASE = 0.5, SQUAD = 11, BUYS = SQUAD - 1, BUDGET = 100, TURN = 15000, FIRST = 25000, MAXTEAMS = 40;
const r1 = x => Math.round(x * 10) / 10;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const maxBid = t => r1(t.budget - (BUYS - 1 - t.pl.length) * BASE);
const open = t => t.pl.length < BUYS && maxBid(t) >= BASE;
const clean = s => String(s || "").replace(/[<>&"'`\\]/g, "").trim().slice(0, 24);
const h = x => crypto.createHash("sha256").update(String(x)).digest();
const same = (a, b) => {
  try { return crypto.timingSafeEqual(h(a), h(b)); }
  catch(e) { return false; }
};

// Global in-memory + temp file fallback for zero-config operation
const TMP_PATH = path.join(process.platform === "win32" ? (process.env.TEMP || ".") : "/tmp", "cricket_auction_state.json");

function readFallback() {
  if (global.__AUCTION_MEM_STATE__) return global.__AUCTION_MEM_STATE__;
  try {
    if (fs.existsSync(TMP_PATH)) {
      global.__AUCTION_MEM_STATE__ = JSON.parse(fs.readFileSync(TMP_PATH, "utf8"));
      return global.__AUCTION_MEM_STATE__;
    }
  } catch(e) {}
  global.__AUCTION_MEM_STATE__ = { phase: "lobby", teams: {}, log: [], order: [], idx: 0, high: 0, by: null, skip: [], end: 0 };
  return global.__AUCTION_MEM_STATE__;
}

function writeFallback(s) {
  global.__AUCTION_MEM_STATE__ = s;
  try {
    fs.writeFileSync(TMP_PATH, JSON.stringify(s), "utf8");
  } catch(e) {}
}

async function kv(cmd) {
  if (!hasRedis) return null;
  const x = await fetch(U, {
    method: "POST",
    headers: { Authorization: "Bearer " + T, "Content-Type": "application/json" },
    body: JSON.stringify(cmd)
  });
  return (await x.json()).result;
}

async function load() {
  if (hasRedis) {
    try {
      const res = await kv(["GET", "st"]);
      if (res) return typeof res === "string" ? JSON.parse(res) : res;
    } catch(e) {
      console.warn("Redis GET failed, using fallback:", e.message);
    }
  }
  return readFallback();
}

async function locked(fn) {
  if (hasRedis) {
    for (let i = 0; i < 20; i++) {
      try {
        if (await kv(["SET", "lock", "1", "NX", "PX", "4000"]) === "OK") {
          try {
            const s = await load();
            const out = await fn(s);
            if (out !== false) {
              await kv(["SET", "st", JSON.stringify(s)]);
              writeFallback(s);
            }
            return out;
          } finally {
            await kv(["DEL", "lock"]);
          }
        }
      } catch(e) {
        break;
      }
      await sleep(100);
    }
  }
  // In-memory fallback lock
  const s = await load();
  const out = await fn(s);
  if (out !== false) {
    writeFallback(s);
    if (hasRedis) {
      try { await kv(["SET", "st", JSON.stringify(s)]); } catch(e) {}
    }
  }
  return out;
}

function getPlayer(idx) {
  const item = P[idx];
  if (!item) return null;
  if (typeof item === "string") {
    return { n: item, r: "Player", c: "International", b: BASE };
  }
  return item;
}

function next(s, now) {
  s.idx++;
  s.high = 0;
  s.by = null;
  s.skip = [];
  s.lastBidTime = now;
  if (s.idx >= s.order.length || !Object.values(s.teams).some(open)) {
    s.phase = "done";
  } else {
    const curP = getPlayer(s.order[s.idx]);
    s.base = curP ? (curP.b || BASE) : BASE;
    s.end = now + FIRST;
  }
}

function botBidAI(s, now) {
  if (s.phase !== "live" || !s.order || s.idx >= s.order.length) return false;
  const curP = getPlayer(s.order[s.idx]);
  if (!curP) return false;

  const botIds = Object.keys(s.teams).filter(id => s.teams[id].isBot && open(s.teams[id]));
  if (!botIds.length) return false;

  const elapsed = now - (s.lastBidTime || (s.end - FIRST));
  if (elapsed < 2000) return false; // Realistic thinking pause

  for (const botId of botIds) {
    if (s.by === botId) continue;
    if (s.skip.includes(botId)) continue;

    const bot = s.teams[botId];
    const seed = (curP.n.charCodeAt(0) + botId.charCodeAt(0) + s.idx) % 10;
    const factor = 1.3 + (seed * 0.22);
    const maxValuation = r1(Math.min(bot.budget * 0.35, (curP.b || BASE) * factor + 1.5));
    const nextBid = s.high === 0 ? (curP.b || BASE) : r1(s.high + 0.5);

    if (nextBid <= maxBid(bot) && nextBid <= maxValuation) {
      s.high = nextBid;
      s.by = botId;
      s.end = now + TURN;
      s.lastBidTime = now;
      s.skip = s.skip.filter(x => x !== botId);
      return true;
    } else {
      if (!s.skip.includes(botId)) {
        s.skip.push(botId);
      }
    }
  }
  return false;
}

function advance(s, now) {
  if (s.phase !== "live") return false;
  let changed = botBidAI(s, now);

  const el = Object.keys(s.teams).filter(u => open(s.teams[u]));
  if (!el.length) {
    s.phase = "done";
    return true;
  }
  const allSkipped = el.filter(u => u !== s.by).every(u => s.skip.includes(u));
  if (now > s.end || allSkipped) {
    const curP = getPlayer(s.order[s.idx]);
    const pName = curP ? curP.n : "Player";
    if (s.by) {
      const t = s.teams[s.by];
      t.pl.push({ n: pName, p: s.high, r: curP ? curP.r : "Player", c: curP ? curP.c : "ICC" });
      t.budget = r1(t.budget - s.high);
      s.log.unshift(`${pName} → ${t.team} (${s.high}M)`);
    } else {
      s.log.unshift(`${pName} unsold`);
    }
    s.log = s.log.slice(0, 20);
    next(s, now);
    return true;
  }
  return changed;
}

function view(s, now) {
  const teams = {};
  for (const [u, t] of Object.entries(s.teams)) {
    teams[u] = {
      team: t.team,
      cap: t.cap,
      budget: t.budget,
      pl: t.pl || [],
      isBot: !!t.isBot
    };
  }
  const curP = (s.phase === "live" && s.order && s.order.length > 0) ? getPlayer(s.order[s.idx]) : null;
  return {
    phase: s.phase,
    teams,
    idx: s.idx || 0,
    total: (s.order && s.order.length > 0) ? s.order.length : P.length,
    cur: curP,
    high: s.high || 0,
    by: s.by,
    skip: s.skip || [],
    end: s.end || 0,
    log: s.log || [],
    now,
    base: curP ? (curP.b || BASE) : BASE,
    buys: BUYS,
    hasRedis
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ err: "POST only" });

  try {
    const b = req.body || {}, now = Date.now(), a = b.a;
    const auth = s => s.teams[b.id] && typeof b.token === "string" && same(s.teams[b.id].token, b.token);
    const hostOk = () => same(b.pin || "", HOST_PIN);

    if (a === "state") {
      let s = await load();
      const c = JSON.parse(JSON.stringify(s));
      if (advance(c, now)) {
        await locked(async x => advance(x, Date.now()) ? undefined : false);
        s = await load();
      }
      return res.json({ s: view(s, now) });
    }

    if (a === "join") {
      const team = clean(b.team), cap = clean(b.cap);
      if (!team || !cap) return res.json({ err: "Enter team and captain name" });
      const out = await locked(async s => {
        if (s.phase !== "lobby") return false;
        if (Object.keys(s.teams).length >= MAXTEAMS) return false;
        const id = crypto.randomBytes(4).toString("hex"), token = crypto.randomBytes(16).toString("hex");
        s.teams[id] = { team, cap, budget: BUDGET, pl: [], token, isBot: false };
        return { id, token };
      });
      return res.json(out ? out : { err: "Auction already started or full" });
    }

    if (a === "add_bots") {
      const demoTeams = [
        { team: "Lahore Qalandars", cap: "Shaheen Afridi" },
        { team: "Karachi Kings", cap: "Babar Azam" },
        { team: "Islamabad United", cap: "Shadab Khan" }
      ];
      await locked(async s => {
        if (s.phase !== "lobby") return false;
        for (const dt of demoTeams) {
          const exists = Object.values(s.teams).some(t => t.team === dt.team);
          if (!exists && Object.keys(s.teams).length < MAXTEAMS) {
            const id = "bot_" + crypto.randomBytes(3).toString("hex");
            s.teams[id] = { team: dt.team, cap: dt.cap, budget: BUDGET, pl: [], token: "bot", isBot: true };
          }
        }
        return true;
      });
      return res.json({ ok: 1 });
    }

    if (a === "start" || a === "reset") {
      if (!hostOk()) return res.json({ err: "Wrong host PIN (default is 1234)" });
      const out = await locked(async s => {
        if (a === "reset") {
          for (const t of Object.values(s.teams)) {
            t.budget = BUDGET;
            t.pl = [];
          }
          s.phase = "lobby";
          s.log = [];
          s.high = 0;
          s.by = null;
          s.skip = [];
          return true;
        }
        if (Object.keys(s.teams).length < 2 || s.phase !== "lobby") return false;
        const o = P.map((_, i) => i);
        for (let i = o.length - 1; i > 0; i--) {
          const j = crypto.randomInt(i + 1);
          [o[i], o[j]] = [o[j], o[i]];
        }
        const curP = getPlayer(o[0]);
        Object.assign(s, {
          phase: "live",
          order: o,
          idx: 0,
          high: 0,
          by: null,
          skip: [],
          end: now + FIRST,
          lastBidTime: now,
          base: curP ? (curP.b || BASE) : BASE,
          log: []
        });
        return true;
      });
      return res.json(out ? { ok: 1 } : { err: "Need 2+ teams in the lobby to start" });
    }

    if (a === "bid" || a === "skip") {
      let err = null;
      await locked(async s => {
        advance(s, Date.now());
        if (!auth(s)) { err = "Not a player in this auction"; return; }
        if (s.phase !== "live" || b.lot !== s.idx) { err = "Player is already sold or skipped"; return; }
        const t = s.teams[b.id];
        if (a === "skip") {
          if (s.by !== b.id && !s.skip.includes(b.id)) s.skip.push(b.id);
          advance(s, Date.now());
          return;
        }
        const curP = getPlayer(s.order[s.idx]);
        const minP = s.high === 0 ? (curP.b || BASE) : r1(s.high + BASE);
        const m = Number(b.amt);
        if (!isFinite(m) || m !== r1(m) || m < minP || s.by === b.id || !open(t) || m > maxBid(t)) {
          err = `Invalid bid (min: ${minP}M, your max: ${maxBid(t)}M)`;
          return;
        }
        s.high = m;
        s.by = b.id;
        s.end = Date.now() + TURN;
        s.lastBidTime = Date.now();
        s.skip = s.skip.filter(x => x !== b.id);
      });
      return res.json(err ? { err } : { ok: 1 });
    }

    return res.status(400).json({ err: "Bad request" });
  } catch(e) {
    console.error("Auction API error:", e);
    return res.status(500).json({ err: "Server error, please try again" });
  }
};
