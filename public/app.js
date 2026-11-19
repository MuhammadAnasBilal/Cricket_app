// Cricket Auction Pro - Live Client App
const $ = s => document.querySelector(s);
const r1 = x => Math.round(x * 10) / 10;

let S = null;
let lastStateStr = "";
let clockOffset = 0;
let customBidVal = "";
let soundEnabled = localStorage.getItem("auction_sound") !== "false";
let pin = sessionStorage.getItem("host_pin") || ""; // No default prefill
let me = JSON.parse(localStorage.getItem("cricket_auction_me") || "null");
let previousHighBid = 0;
let previousLot = -1;
let editingTeamId = null;

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
    osc.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
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
        pin: pin || data.pin
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
      const app = $("#app");
      if (app) {
        app.innerHTML = `
          <div class="card" style="text-align:center; padding: 40px 20px;">
            <h2 style="color:#ef4444; margin-bottom:8px;">⚠️ Connection Error</h2>
            <p class="text-muted">Could not reach the auction server. Please ensure the server is active.</p>
          </div>`;
      }
    }
    return;
  }
  if (res.err) {
    if (!S) {
      const app = $("#app");
      if (app) {
        app.innerHTML = `
          <div class="card" style="text-align:center; padding: 40px 20px;">
            <h2 style="color:#f59e0b; margin-bottom:8px;">⚠️ Notice</h2>
            <p class="text-muted">${res.err}</p>
          </div>`;
      }
    }
    return;
  }

  S = res.s;
  clockOffset = S.now - Date.now();

  if (me && !S.teams[me.id]) {
    me = null;
    localStorage.removeItem("cricket_auction_me");
  }

  if (S.phase === "live" && !S.paused) {
    if (previousLot !== -1 && previousLot !== S.idx) {
      playGavelSound();
    }
    if (S.high > previousHighBid) {
      playBidSound();
    }
    previousLot = S.idx;
    previousHighBid = S.high;
  } else if (S.phase !== "live") {
    previousLot = -1;
    previousHighBid = 0;
  }

  updateNavbarStatus();

  const stateSignature = JSON.stringify({
    phase: S.phase,
    idx: S.idx,
    high: S.high,
    by: S.by,
    paused: S.paused,
    skipLen: (S.skip || []).length,
    teams: S.teams,
    logLen: (S.log || []).length,
    myId: me ? me.id : null,
    editingTeamId
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
    if (S.paused) {
      badge.className = "status-badge lobby";
      text.textContent = `Paused: Lot ${(S.idx || 0) + 1}/${S.total}`;
    } else {
      badge.className = "status-badge live";
      text.textContent = `Live: Lot ${(S.idx || 0) + 1}/${S.total}`;
    }
  } else if (S.phase === "lobby") {
    badge.className = "status-badge lobby";
    text.textContent = "Lobby";
  } else {
    badge.className = "status-badge";
    text.textContent = "Completed";
  }
}

// Timer tick
setInterval(() => {
  const timerEl = $("#timer-display");
  if (timerEl && S && S.phase === "live") {
    if (S.paused) {
      timerEl.textContent = "PAUSED";
      timerEl.className = "timer-sec warning tabular";
      return;
    }
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

function render() {
  const app = $("#app");
  if (!S || !app) return;

  if (S.phase === "lobby") {
    renderLobby(app);
  } else if (S.phase === "live") {
    renderLive(app);
  } else {
    renderDone(app);
  }

  // Render Edit Modal if active
  if (editingTeamId && S.teams[editingTeamId]) {
    renderEditModal(app, editingTeamId, S.teams[editingTeamId]);
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
        <span class="text-muted" style="font-size:13px;">Testing alone? Add 3 rival teams with autonomous bidding AI to start the auction right away!</span>
      </div>
      <button class="btn btn-secondary" data-action="add_bots">+ Add Demo Teams</button>
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
            <input type="text" id="join-team" placeholder="e.g. Lahore Leopards" maxlength="24">
          </div>
          <div class="form-group">
            <label class="form-label">Captain Name (Your Name)</label>
            <input type="text" id="join-cap" placeholder="e.g. Bilal" maxlength="24">
          </div>
          <button class="btn btn-primary btn-lg" style="width:100%" data-action="join">Join Auction Room</button>
        ` : `
          <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:16px; margin-bottom:16px;">
            <div style="font-size:18px; font-weight:800; color:#fff;">${userTeam.team}</div>
            <div class="text-muted">Captain: <b>${userTeam.cap}</b> (You)</div>
            <div style="margin-top:10px; display:inline-block; font-size:12px; font-weight:700; color:#34d399; background:rgba(52,211,153,0.1); border:1px solid rgba(52,211,153,0.3); padding:3px 10px; border-radius:999px;">
              ✓ Ready in Lobby
            </div>
          </div>
          <p class="text-muted" style="font-size:13px;">You are registered in the room. Waiting for host to start the auction.</p>
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

    <!-- Registered Teams List with Host Management -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">
          👥 Teams in Lobby (${teamIds.length})
          ${pin ? '<span class="host-badge-pill">👑 Host Mode Enabled</span>' : ''}
        </div>
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
                ${pin ? '<th style="text-align:right;">Host Actions</th>' : ''}
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
                    ${pin ? `
                      <td style="text-align:right;">
                        <button class="btn btn-secondary btn-xs" data-action="open_edit_team" data-arg="${id}">✏️ Edit</button>
                        <button class="btn btn-danger btn-xs" data-action="remove_team" data-arg="${id}" style="margin-left:4px;">🗑️ Kick</button>
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Host Master Control Box -->
    <div class="card" style="border-color: rgba(245,158,11,0.35);">
      <div class="card-header">
        <div class="card-title text-gold">👑 Host Master Controls</div>
        <span class="text-dim">Host authorizes all major controls</span>
      </div>
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
        <input type="password" id="host-pin" placeholder="Enter Host PIN" value="${pin}" style="max-width:220px; margin:0;" oninput="onPinChange(this.value)">
        <button class="btn btn-gold btn-lg" data-action="start" ${teamIds.length < 2 ? "disabled" : ""}>
          ▶ Start Auction Now
        </button>
        <button class="btn btn-secondary" data-action="change_pin_dialog">
          🔑 Change Host PIN
        </button>
      </div>
      ${!pin ? `
        <p class="text-dim" style="margin-top:8px;">Enter your Host PIN above to unlock team editing, kicking, and starting permissions.</p>
      ` : `
        <p class="text-muted" style="margin-top:8px; font-size:13px; color:#34d399;">✓ Host authenticated. You can now edit/remove teams from the table or start the auction.</p>
      `}
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
  const canBid = userTeam && open(userTeam) && !isLeader && !hasSkipped && minNextBid <= userMax && !S.paused;

  app.innerHTML = `
    <!-- Paused Notice Banner -->
    ${S.paused ? `
      <div class="pause-banner">
        <span>⏸️ AUCTION IS PAUSED BY HOST</span>
        ${pin ? `
          <button class="btn btn-gold btn-xs" data-action="host_pause">▶ Resume Auction</button>
        ` : `
          <span style="font-size:12px; font-weight:normal;">Waiting for host to resume...</span>
        `}
      </div>
    ` : ''}

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
              <div class="timer-label">${S.paused ? "Status" : "Timer"}</div>
              <div id="timer-display" class="timer-sec tabular">${S.paused ? "PAUSED" : "--s"}</div>
            </div>
          </div>

          <!-- Bidding Paddles -->
          <div class="paddles">
            ${userTeam ? `
              <div class="quick-bids">
                <button class="btn btn-primary btn-lg" data-action="bid" data-arg="${minNextBid}" ${!canBid || minNextBid > userMax ? "disabled" : ""}>
                  Bid ${minNextBid}M
                </button>
                <button class="btn btn-primary btn-lg" data-action="bid" data-arg="${r1(minNextBid + 0.5)}" ${!canBid || r1(minNextBid + 0.5) > userMax ? "disabled" : ""}>
                  +0.5M (${r1(minNextBid + 0.5)}M)
                </button>
                <button class="btn btn-primary btn-lg" data-action="bid" data-arg="${r1(minNextBid + 1.0)}" ${!canBid || r1(minNextBid + 1.0) > userMax ? "disabled" : ""}>
                  +1.0M (${r1(minNextBid + 1.0)}M)
                </button>
              </div>

              <div class="custom-bid-row">
                <input type="number" step="0.1" id="custom-bid-input" placeholder="Custom M" value="${customBidVal}" style="margin:0; width:130px;">
                <button class="btn btn-secondary" style="flex:1" data-action="custom_bid" ${!canBid ? "disabled" : ""}>
                  Submit Bid
                </button>
                <button class="btn btn-danger" data-action="skip" ${isLeader || hasSkipped || S.paused ? "disabled" : ""}>
                  ${hasSkipped ? "Skipped" : "Pass / Skip"}
                </button>
              </div>

              <div style="font-size:13px; margin-top:8px;" class="text-muted">
                ${S.paused ? `
                  <span style="color:#fbbf24;">Auction paused by host. Bidding temporarily suspended.</span>
                ` : isLeader ? `
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

        <!-- Host Live Master Control Bar -->
        <div class="card" style="margin-top:20px; border-color:rgba(245,158,11,0.35);">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:8px;">
            <div>
              <strong style="font-size:14px; color:#fbbf24;">👑 Host Master Commands</strong>
              <div class="text-dim">Higher authority over the live auction</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <input type="password" id="live-host-pin" placeholder="Enter Host PIN" value="${pin}" style="width:130px; margin:0;" oninput="onPinChange(this.value)">
              <button class="btn btn-secondary btn-xs" data-action="change_pin_dialog">🔑 PIN</button>
            </div>
          </div>

          <div class="host-controls-grid">
            <button class="btn ${S.paused ? 'btn-gold' : 'btn-secondary'} btn-xs" data-action="host_pause">
              ${S.paused ? '▶ Resume' : '⏸️ Pause Clock'}
            </button>
            <button class="btn btn-gold btn-xs" data-action="host_force_sell">
              🔨 Sell Now (Hammer)
            </button>
            <button class="btn btn-secondary btn-xs" data-action="host_force_unsold">
              ⏩ Pass Unsold
            </button>
            <button class="btn btn-secondary btn-xs" data-action="host_undo_bid">
              ↩️ Undo Last Bid
            </button>
            <button class="btn btn-danger btn-xs" data-action="reset">
              🔄 Reset to Lobby
            </button>
          </div>
        </div>
      </div>

      <!-- Right Column: Live Standings & Activity Log -->
      <div>
        <!-- Teams Leaderboard with Host Edit / Kick Controls -->
        <div class="card">
          <div class="card-header">
            <div class="card-title">
              📊 Live Standings
              ${pin ? '<span class="host-badge-pill">👑 Host</span>' : ''}
            </div>
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
                  ${pin ? '<th style="text-align:right;">Host</th>' : ''}
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
                      ${pin ? `
                        <td style="text-align:right;">
                          <button class="btn btn-secondary btn-xs" data-action="open_edit_team" data-arg="${id}">✏️</button>
                          <button class="btn btn-danger btn-xs" data-action="remove_team" data-arg="${id}">🗑️</button>
                        </td>
                      ` : ''}
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
        <input type="password" placeholder="Enter Host PIN" value="${pin}" style="max-width:160px; margin:0;" oninput="onPinChange(this.value)">
        <button class="btn btn-gold btn-lg" data-action="reset">Start New Auction</button>
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

/* =========================================================
   HOST MODAL: EDIT TEAM
   ========================================================= */
function renderEditModal(app, teamId, team) {
  const modalEl = document.createElement("div");
  modalEl.className = "modal-backdrop";
  modalEl.id = "edit-modal-backdrop";
  modalEl.innerHTML = `
    <div class="modal">
      <div class="card-header" style="margin-bottom:16px;">
        <div class="card-title text-gold">✏️ Edit Franchise Team</div>
        <button class="btn btn-secondary btn-xs" data-action="close_edit_modal">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">Franchise Name</label>
        <input type="text" id="edit-team-name" value="${team.team}" maxlength="24">
      </div>
      <div class="form-group">
        <label class="form-label">Captain Name</label>
        <input type="text" id="edit-team-cap" value="${team.cap}" maxlength="24">
      </div>
      <div class="form-group">
        <label class="form-label">Purse Budget (M)</label>
        <input type="number" step="0.5" id="edit-team-budget" value="${team.budget}">
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
        <button class="btn btn-secondary" data-action="close_edit_modal">Cancel</button>
        <button class="btn btn-gold" data-action="save_edit_team" data-arg="${teamId}">Save Changes</button>
      </div>
    </div>
  `;
  app.appendChild(modalEl);
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
  if (!pin) {
    alert("Please enter the Host PIN to start the auction.");
    return;
  }
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
  const input = $("#custom-bid-input");
  const val = parseFloat(input ? input.value : customBidVal);
  if (!val || isNaN(val)) {
    alert("Please enter a valid bid amount.");
    return;
  }
  await bidAmt(val);
  customBidVal = "";
  if (input) input.value = "";
}

async function skipLot() {
  if (!S || S.idx === undefined) return;
  await act("skip", { lot: S.idx });
}

async function resetAuction() {
  if (!pin) {
    alert("Please enter the Host PIN to reset the auction.");
    return;
  }
  if (confirm("Reset auction back to lobby? All current squad purchases will be cleared.")) {
    await act("reset");
  }
}

function onPinChange(val) {
  pin = val;
  sessionStorage.setItem("host_pin", pin);
  // Re-render to update host controls availability
  render();
}

async function hostChangePinDialog() {
  if (!pin) {
    alert("Please enter the current Host PIN first.");
    return;
  }
  const newPin = prompt("Enter new Host PIN (minimum 3 digits):");
  if (!newPin) return;
  const res = await api("host_update_pin", { newPin: newPin.trim() });
  if (res && res.ok) {
    pin = newPin.trim();
    sessionStorage.setItem("host_pin", pin);
    alert("Host PIN has been successfully updated!");
    render();
  }
}

async function hostRemoveTeam(teamId) {
  if (!pin) {
    alert("Please enter Host PIN to remove teams.");
    return;
  }
  const team = S.teams[teamId];
  const name = team ? team.team : "this team";
  if (confirm(`Are you sure you want to kick "${name}" from the auction?`)) {
    const res = await api("host_remove_team", { targetId: teamId });
    if (res && res.ok) {
      poll();
    }
  }
}

function hostOpenEditTeam(teamId) {
  if (!pin) {
    alert("Please enter Host PIN to edit teams.");
    return;
  }
  editingTeamId = teamId;
  render();
}

function hostCloseEditModal() {
  editingTeamId = null;
  const modal = $("#edit-modal-backdrop");
  if (modal) modal.remove();
}

async function hostSaveEditTeam(teamId) {
  const nameInput = $("#edit-team-name");
  const capInput = $("#edit-team-cap");
  const budgetInput = $("#edit-team-budget");
  if (!nameInput || !capInput || !budgetInput) return;

  const team = nameInput.value.trim();
  const cap = capInput.value.trim();
  const budget = parseFloat(budgetInput.value);

  if (!team || !cap) {
    alert("Franchise name and Captain name cannot be empty.");
    return;
  }

  const res = await api("host_edit_team", { targetId: teamId, team, cap, budget });
  if (res && res.ok) {
    hostCloseEditModal();
    poll();
  }
}

// Delegated Event Listeners (Bypasses all CSP inline-event restrictions)
document.addEventListener("click", e => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  if (btn.disabled) return;

  const action = btn.getAttribute("data-action");
  const arg = btn.getAttribute("data-arg");

  if (action === "join") joinAuction();
  else if (action === "add_bots") addDemoTeams();
  else if (action === "start") startAuction();
  else if (action === "bid") bidAmt(parseFloat(arg));
  else if (action === "custom_bid") submitCustomBid();
  else if (action === "skip") skipLot();
  else if (action === "reset") resetAuction();
  else if (action === "toggle_sound") toggleSound();
  else if (action === "change_pin_dialog") hostChangePinDialog();
  else if (action === "remove_team") hostRemoveTeam(arg);
  else if (action === "open_edit_team") hostOpenEditTeam(arg);
  else if (action === "close_edit_modal") hostCloseEditModal();
  else if (action === "save_edit_team") hostSaveEditTeam(arg);
  else if (action === "host_pause") act("host_pause");
  else if (action === "host_force_sell") act("host_force_sell");
  else if (action === "host_force_unsold") act("host_force_unsold");
  else if (action === "host_undo_bid") act("host_undo_bid");
});

document.addEventListener("input", e => {
  if (e.target.id === "host-pin" || e.target.id === "live-host-pin") {
    onPinChange(e.target.value);
  } else if (e.target.id === "custom-bid-input") {
    customBidVal = e.target.value;
  }
});

document.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    if (e.target.id === "join-team" || e.target.id === "join-cap") {
      joinAuction();
    } else if (e.target.id === "custom-bid-input") {
      submitCustomBid();
    }
  }
});

// Explicit window bindings
window.joinAuction = joinAuction;
window.addDemoTeams = addDemoTeams;
window.startAuction = startAuction;
window.bidAmt = bidAmt;
window.submitCustomBid = submitCustomBid;
window.skipLot = skipLot;
window.resetAuction = resetAuction;
window.onPinChange = onPinChange;
window.toggleSound = toggleSound;
