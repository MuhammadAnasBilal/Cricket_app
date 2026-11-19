// Cricket Auction Pro - Live Client App
const $ = s => document.querySelector(s);
const r1 = x => Math.round(x * 10) / 10;

let S = null;
let lastStateStr = "";
let clockOffset = 0;
let customBidVal = "";
let soundEnabled = localStorage.getItem("auction_sound") !== "false";
let pin = sessionStorage.getItem("host_pin") || "1234";
let me = JSON.parse(localStorage.getItem("cricket_auction_me") || "null");
let previousHighBid = 0;
let previousLot = -1;

// Web Audio API Synthesizer
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) audioCtx = new AudioContext();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playBidSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch(e) {}
}

function playGavelSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(140, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch(e) {}
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem("auction_sound", soundEnabled ? "true" : "false");
  updateSoundUI();
}

function updateSoundUI() {
  const icon = $("#sound-icon");
  if (icon) icon.textContent = soundEnabled ? "🔊" : "🔇";
}

// Network API helper
async function api(action, data = {}, quiet = false) {
  try {
    const res = await fetch("/api/auction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        a: action,
        ...data,
        id: me ? me.id : undefined,
        token: me ? me.token : undefined,
        pin
      })
    });
    const json = await res.json();
    if (json.err) {
      if (!quiet) alert(json.err);
      return { err: json.err };
    }
    return json;
  } catch(e) {
    if (!quiet) alert("Unable to connect to auction server.");
    return null;
  }
}

// Background polling loop
async function poll() {
  const res = await api("state", {}, true);
  if (!res) {
    if (!S) {
      $("#app").innerHTML = `
        <div class="card" style="text-align:center; padding: 40px 20px;">
          <h2 style="color:#ef4444; margin-bottom:8px;">⚠️ Connection Error</h2>
          <p class="text-muted">Could not reach the auction server. Please ensure the server is active.</p>
        </div>`;
    }
    return;
  }
  if (res.err) {
    if (!S) {
      $("#app").innerHTML = `
        <div class="card" style="text-align:center; padding: 40px 20px;">
          <h2 style="color:#f59e0b; margin-bottom:8px;">⚠️ Notice</h2>
          <p class="text-muted">${res.err}</p>
        </div>`;
    }
    return;
  }

  S = res.s;
  clockOffset = S.now - Date.now();

  // Reset local credentials if team was deleted/reset
  if (me && !S.teams[me.id]) {
    me = null;
    localStorage.removeItem("cricket_auction_me");
  }

  // Sound triggers
  if (S.phase === "live") {
    if (previousLot !== -1 && previousLot !== S.idx) {
      playGavelSound();
    }
    if (S.high > previousHighBid) {
      playBidSound();
    }
    previousLot = S.idx;
    previousHighBid = S.high;
  } else {
    previousLot = -1;
    previousHighBid = 0;
  }

  // Update navbar status
  updateNavbarStatus();

  // Re-render if state signature changed
  const stateSignature = JSON.stringify({
    phase: S.phase,
    idx: S.idx,
    high: S.high,
    by: S.by,
    skipLen: (S.skip || []).length,
    teams: S.teams,
    logLen: (S.log || []).length,
    myId: me ? me.id : null
  });

  if (stateSignature !== lastStateStr) {
    lastStateStr = stateSignature;
    render();
  }
}

function updateNavbarStatus() {
  const badge = $("#status-badge");
  const text = $("#status-text");
  if (!badge || !text || !S) return;

  if (S.phase === "live") {
    badge.className = "status-badge live";
    text.textContent = `Live: Lot ${(S.idx || 0) + 1}/${S.total}`;
  } else if (S.phase === "lobby") {
    badge.className = "status-badge lobby";
    text.textContent = "Lobby";
  } else {
    badge.className = "status-badge";
    text.textContent = "Completed";
  }
}

// Timer tick loop (runs at 100ms for smooth seconds display)
setInterval(() => {
  const timerEl = $("#timer-display");
  if (timerEl && S && S.phase === "live") {
    const remainingSec = Math.max(0, Math.ceil((S.end - (Date.now() + clockOffset)) / 1000));
    timerEl.textContent = remainingSec + "s";
    if (remainingSec <= 5) {
      timerEl.className = "timer-sec critical tabular";
    } else if (remainingSec <= 10) {
      timerEl.className = "timer-sec warning tabular";
    } else {
      timerEl.className = "timer-sec tabular";
    }
  }
}, 100);

setInterval(poll, 2000);
poll();
updateSoundUI();

const act = async (action, data = {}) => {
  await api(action, data);
  poll();
};

const maxBid = t => r1(t.budget - (S.buys - 1 - t.pl.length) * (S.base || 0.5));
const open = t => t.pl.length < S.buys && maxBid(t) >= (S.base || 0.5);

function getCountryFlag(country) {
  const map = {
    "Pakistan": "🇵🇰",
    "India": "🇮🇳",
    "Australia": "🇦🇺",
    "England": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    "South Africa": "🇿🇦",
    "West Indies": "🌴",
    "New Zealand": "🇳🇿",
    "Sri Lanka": "🇱🇰",
    "Afghanistan": "🇦🇫",
    "Bangladesh": "🇧🇩",
    "Zimbabwe": "🇿🇼"
  };
  return map[country] || "🏏";
}

function getRoleIcon(role) {
  if (!role) return "🏏";
  if (role.includes("Fast Bowler")) return "⚡";
  if (role.includes("Spin Bowler")) return "🎯";
  if (role.includes("Bowler")) return "🎯";
  if (role.includes("All-Rounder")) return "⭐";
  if (role.includes("Wicketkeeper")) return "🧤";
  return "🏏";
}

// Main Render Router
function render() {
  const app = $("#app");
  if (!S) return;

  if (S.phase === "lobby") {
    renderLobby(app);
  } else if (S.phase === "live") {
    renderLive(app);
  } else {
    renderDone(app);
  }
}

/* =========================================================
   LOBBY VIEW
   ========================================================= */
function renderLobby(app) {
  const teamIds = Object.keys(S.teams || {});
  const userTeam = me ? S.teams[me.id] : null;

  app.innerHTML = `
    <!-- Demo Mode Banner -->
    <div class="demo-banner">
      <div>
        <strong style="color:#fbbf24; display:block; margin-bottom:2px;">⚡ Solo Mode / Quick Test</strong>
        <span class="text-muted" style="font-size:13px;">Testing alone? Add 3 simulated rival teams with one click to start the auction right away!</span>
      </div>
      <button class="btn btn-secondary" onclick="addDemoTeams()">+ Add Demo Teams</button>
    </div>

    <div class="grid-2">
      <!-- Team Registration Card -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">🏏 ${userTeam ? "Your Team Roster" : "Join the Auction"}</div>
        </div>

        ${!userTeam ? `
          <div class="form-group">
            <label class="form-label">Team Franchise Name</label>
            <input type="text" id="join-team" placeholder="e.g. Lahore Leopards, Karachi Titans" maxlength="24">
          </div>
          <div class="form-group">
            <label class="form-label">Captain Name (Your Name)</label>
            <input type="text" id="join-cap" placeholder="e.g. Alex, Bilal" maxlength="24">
          </div>
          <button class="btn btn-primary btn-lg" style="width:100%" onclick="joinAuction()">Join Auction Room</button>
        ` : `
          <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:16px; margin-bottom:16px;">
            <div style="font-size:18px; font-weight:800; color:#fff;">${userTeam.team}</div>
            <div class="text-muted">Captain: <b>${userTeam.cap}</b> (You)</div>
            <div style="margin-top:10px; display:inline-block; font-size:12px; font-weight:700; color:#34d399; background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.3); padding:3px 10px; border-radius:999px;">
              ✓ Ready in Lobby
            </div>
          </div>
          <p class="text-muted" style="font-size:13px;">You are registered in the room. Waiting for host to click "Start Auction".</p>
        `}
      </div>

      <!-- Auction Info Card -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📋 Auction Specifications</div>
        </div>
        <ul style="list-style:none; display:flex; flex-direction:column; gap:10px; font-size:14px;">
          <li style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(35,62,49,0.5); padding-bottom:6px;">
            <span class="text-muted">Total Available Players</span>
            <strong class="tabular">${S.total || 138} Stars</strong>
          </li>
          <li style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(35,62,49,0.5); padding-bottom:6px;">
            <span class="text-muted">Purse Budget Per Team</span>
            <strong class="tabular text-gold">100.0M</strong>
          </li>
          <li style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(35,62,49,0.5); padding-bottom:6px;">
            <span class="text-muted">Required Squad Size</span>
            <strong>11 (1 Cap + 10 Buys)</strong>
          </li>
          <li style="display:flex; justify-content:space-between;">
            <span class="text-muted">Storage Sync Mode</span>
            <span style="font-size:12px; font-weight:700; color:${S.hasRedis ? "#34d399" : "#fbbf24"}">
              ${S.hasRedis ? "⚡ Upstash Redis" : "🛡️ In-Memory (Zero Config)"}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- Registered Teams List -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">👥 Teams in Lobby (${teamIds.length})</div>
        <span class="text-muted" style="font-size:13px;">Minimum 2 teams required to start</span>
      </div>

      ${teamIds.length === 0 ? `
        <p class="text-muted" style="padding:16px 0; text-align:center;">No teams joined yet. Register your team above or click "+ Add Demo Teams"!</p>
      ` : `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Franchise Team</th>
                <th>Captain</th>
                <th>Purse</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              ${teamIds.map(id => {
                const t = S.teams[id];
                const isMe = me && me.id === id;
                return `
                  <tr class="${isMe ? "is-me" : ""}">
                    <td><strong>${t.team}</strong> ${isMe ? '<span style="color:#34d399; font-weight:700; font-size:12px;">(You)</span>' : ''}</td>
                    <td>${t.cap}</td>
                    <td class="tabular text-gold">${t.budget}M</td>
                    <td>${t.isBot ? '<span class="badge-bot">AI BOT</span>' : '<span style="font-size:12px; color:#86a394;">Player</span>'}</td>
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Host Control Box -->
    <div class="card" style="border-color: rgba(245,158,11,0.3);">
      <div class="card-header">
        <div class="card-title text-gold">👑 Host Controls</div>
        <span class="text-dim">Default PIN: 1234</span>
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
        <input type="password" id="host-pin" placeholder="Host PIN (default: 1234)" value="${pin}" style="max-width:240px; margin:0;" oninput="onPinChange(this.value)">
        <button class="btn btn-gold btn-lg" ${teamIds.length < 2 ? "disabled" : ""} onclick="startAuction()">
          ▶ Start Auction Now
        </button>
      </div>
    </div>
  `;
}

/* =========================================================
   LIVE AUCTION VIEW
   ========================================================= */
function renderLive(app) {
  const curP = S.cur || { n: "Player", r: "Player", c: "International", b: S.base || 0.5 };
  const curPlayerName = curP.n || curP;
  const curPlayerRole = curP.r || "All-Rounder";
  const curPlayerCountry = curP.c || "International";
  const curPlayerBase = curP.b || S.base || 0.5;

  const teamIds = Object.keys(S.teams || {});
  const userTeam = me ? S.teams[me.id] : null;
  const leadTeam = S.by ? S.teams[S.by] : null;
  const isLeader = me && S.by === me.id;
  const hasSkipped = me && (S.skip || []).includes(me.id);

  const minNextBid = S.high === 0 ? curPlayerBase : r1(S.high + 0.5);
  const userMax = userTeam ? maxBid(userTeam) : 0;
  const canBid = userTeam && open(userTeam) && !isLeader && !hasSkipped && minNextBid <= userMax;

  app.innerHTML = `
    <div class="grid-auction">
      <!-- Left Column: The Hammer Block & Bidding Console -->
      <div>
        <div class="player-card">
          <div class="player-lot">
            <span class="lot-badge tabular">LOT ${(S.idx || 0) + 1} OF ${S.total}</span>
            <span class="text-muted tabular" style="font-size:13px;">Base Price: <b class="text-gold">${curPlayerBase}M</b></span>
          </div>

          <h2 class="player-name">${curPlayerName}</h2>

          <div class="player-badges">
            <span class="player-tag">${getRoleIcon(curPlayerRole)} ${curPlayerRole}</span>
            <span class="player-tag">${getCountryFlag(curPlayerCountry)} ${curPlayerCountry}</span>
          </div>

          <!-- Spotlight Bid Display -->
          <div class="bid-showcase">
            <div>
              <div class="bid-amt-label">Current Highest Bid</div>
              <div class="bid-amt-val tabular text-gold">${S.high === 0 ? "No Bids" : S.high + "M"}</div>
              ${leadTeam ? `
                <div class="bid-leader-badge">
                  👑 ${leadTeam.team} ${isLeader ? '(You)' : ''}
                </div>
              ` : `
                <div class="text-dim" style="font-size:12px; margin-top:4px;">Waiting for first paddle...</div>
              `}
            </div>

            <div class="timer-box">
              <div class="timer-label">Timer</div>
              <div id="timer-display" class="timer-sec tabular">--s</div>
            </div>
          </div>

          <!-- Bidding Paddles -->
          <div class="paddles">
            ${userTeam ? `
              <div class="quick-bids">
                <button class="btn btn-primary btn-lg" ${!canBid || minNextBid > userMax ? "disabled" : ""} onclick="bidAmt(${minNextBid})">
                  Bid ${minNextBid}M
                </button>
                <button class="btn btn-primary btn-lg" ${!canBid || r1(minNextBid + 0.5) > userMax ? "disabled" : ""} onclick="bidAmt(${r1(minNextBid + 0.5)})">
                  +0.5M (${r1(minNextBid + 0.5)}M)
                </button>
                <button class="btn btn-primary btn-lg" ${!canBid || r1(minNextBid + 1.0) > userMax ? "disabled" : ""} onclick="bidAmt(${r1(minNextBid + 1.0)})">
                  +1.0M (${r1(minNextBid + 1.0)}M)
                </button>
              </div>

              <div class="custom-bid-row">
                <input type="number" step="0.1" id="custom-bid-input" placeholder="Custom M" value="${customBidVal}" oninput="customBidVal=this.value" style="margin:0; width:130px;">
                <button class="btn btn-secondary" style="flex:1" ${!canBid ? "disabled" : ""} onclick="submitCustomBid()">
                  Submit Bid
                </button>
                <button class="btn btn-danger" ${isLeader || hasSkipped ? "disabled" : ""} onclick="skipLot()">
                  ${hasSkipped ? "Skipped" : "Pass / Skip"}
                </button>
              </div>

              <div style="font-size:13px; margin-top:8px;" class="text-muted">
                ${isLeader ? `
                  <span style="color:#34d399; font-weight:700;">★ You are currently the highest bidder!</span>
                ` : hasSkipped ? `
                  <span style="color:#f87171;">You passed on this player.</span>
                ` : `
                  Your remaining purse: <b class="tabular text-gold">${userTeam.budget}M</b> · Max legal bid: <b class="tabular">${userMax}M</b>
                `}
              </div>
            ` : `
              <div style="text-align:center; padding:12px; background:var(--surface); border-radius:var(--radius-sm);" class="text-muted">
                Spectating Mode. (You did not join a team in the lobby).
              </div>
            `}
          </div>
        </div>

        <!-- Host Quick Reset Card -->
        <div class="card" style="margin-top:20px; border-color:rgba(239,68,68,0.25);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
              <strong style="font-size:13px; color:#fca5a5;">Host Controls</strong>
              <div class="text-dim">Reset room back to lobby</div>
            </div>
            <div style="display:flex; gap:8px;">
              <input type="password" placeholder="PIN" value="${pin}" style="width:90px; margin:0;" oninput="onPinChange(this.value)">
              <button class="btn btn-danger" onclick="resetAuction()">Reset Auction</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Live Standings & Activity Log -->
      <div>
        <!-- Teams Leaderboard -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📊 Live Standings</div>
            <span class="text-muted tabular" style="font-size:12px;">Cap: 10 Buys</span>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Squad</th>
                  <th>Purse</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${teamIds.map(id => {
                  const t = S.teams[id];
                  const isCurLeader = S.by === id;
                  const isSkipped = (S.skip || []).includes(id);
                  const isMe = me && me.id === id;
                  return `
                    <tr class="${isMe ? "is-me" : ""}">
                      <td>
                        <strong>${t.team}</strong>
                        ${isMe ? '<span style="color:#34d399; font-size:11px; font-weight:700;">(You)</span>' : ''}
                        ${t.isBot ? '<span class="badge-bot">AI</span>' : ''}
                      </td>
                      <td class="tabular">${t.pl.length}/${S.buys}</td>
                      <td class="tabular text-gold">${t.budget}M</td>
                      <td>
                        ${isCurLeader ? '<span style="color:#fbbf24; font-weight:700;">👑 Top</span>' : isSkipped ? '<span style="color:#64748b; font-size:12px;">Pass</span>' : '<span style="color:#34d399; font-size:12px;">Active</span>'}
                      </td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Recent Bidding Log -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">📜 Auction Activity</div>
          </div>
          <div class="log-list">
            ${(S.log || []).length === 0 ? `
              <div class="text-dim" style="text-align:center; padding:12px;">No activity yet in this auction.</div>
            ` : (S.log || []).slice(0, 15).map(item => `
              <div class="log-item">
                <span>${item}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   DONE VIEW (Post-Auction Summary)
   ========================================================= */
function renderDone(app) {
  const teamIds = Object.keys(S.teams || {});

  app.innerHTML = `
    <div class="card" style="text-align:center; padding:36px 20px; background:linear-gradient(145deg, #162b22, #0d1a14);">
      <div style="font-size:42px; margin-bottom:8px;">🏆</div>
      <h1 style="color:#fff; margin-bottom:6px;">Auction Completed!</h1>
      <p class="text-muted" style="max-width:540px; margin:0 auto 20px;">
        All available player lots have concluded. Below are the final 11-player squads and remaining purses for every franchise.
      </p>
      <div style="display:flex; justify-content:center; gap:10px; align-items:center;">
        <input type="password" placeholder="Host PIN" value="${pin}" style="max-width:140px; margin:0;" oninput="onPinChange(this.value)">
        <button class="btn btn-gold btn-lg" onclick="resetAuction()">Start New Auction</button>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">🏏 Final Squad Rosters</div>
      </div>

      ${teamIds.map(id => {
        const t = S.teams[id];
        const isMe = me && me.id === id;
        return `
          <div class="squad-card">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <strong style="font-size:17px; color:#fff;">${t.team}</strong>
                ${isMe ? '<span style="color:#34d399; font-weight:700; font-size:12px; margin-left:6px;">(Your Team)</span>' : ''}
                ${t.isBot ? '<span class="badge-bot" style="margin-left:6px;">AI</span>' : ''}
                <div class="text-muted" style="font-size:13px;">Captain: <b>${t.cap}</b></div>
              </div>
              <div style="text-align:right;">
                <div class="text-gold tabular" style="font-size:16px; font-weight:800;">${t.budget}M Remaining</div>
                <div class="text-muted" style="font-size:12px;">Bought: ${t.pl.length}/${S.buys} Players</div>
              </div>
            </div>

            <div class="squad-roster">
              <span class="squad-player-pill" style="border-color:#34d399; color:#34d399;">
                ⭐ ${t.cap} (Captain)
              </span>
              ${(t.pl || []).map(p => `
                <span class="squad-player-pill">
                  ${p.n} · <b class="text-gold">${p.p}M</b>
                </span>
              `).join("")}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

// User Actions
async function joinAuction() {
  const teamInput = $("#join-team");
  const capInput = $("#join-cap");
  if (!teamInput || !capInput) return;

  const team = teamInput.value.trim();
  const cap = capInput.value.trim();
  if (!team || !cap) {
    alert("Please enter both a Team Franchise name and Captain name.");
    return;
  }

  const res = await api("join", { team, cap });
  if (res && res.id) {
    me = res;
    localStorage.setItem("cricket_auction_me", JSON.stringify(res));
    poll();
  }
}

async function addDemoTeams() {
  const res = await api("add_bots");
  if (res && res.ok) {
    poll();
  }
}

async function startAuction() {
  const res = await api("start");
  if (res && res.ok) {
    poll();
  }
}

async function bidAmt(amt) {
  if (!S || S.idx === undefined) return;
  await act("bid", { amt: r1(amt), lot: S.idx });
}

async function submitCustomBid() {
  const val = parseFloat(customBidVal);
  if (!val || isNaN(val)) {
    alert("Please enter a valid bid amount.");
    return;
  }
  await bidAmt(val);
  customBidVal = "";
}

async function skipLot() {
  if (!S || S.idx === undefined) return;
  await act("skip", { lot: S.idx });
}

async function resetAuction() {
  if (confirm("Reset auction back to lobby? All current squad purchases will be cleared.")) {
    await act("reset");
  }
}

function onPinChange(val) {
  pin = val;
  sessionStorage.setItem("host_pin", pin);
}
