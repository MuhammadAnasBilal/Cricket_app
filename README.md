# 🏏 Cricket Auction Pro

Live real-time Fantasy Cricket Player Auction web application. Host live drafts and player auctions with friends across multiple devices, or test solo against intelligent AI rival teams!

---

## 👑 Host Master Controls & PIN

* **Initial Host PIN:** `2567` (The Host enters the PIN into the Host Controls box; no pre-filled values).
* **Team Management (Lobby & Live):**
  * **✏️ Edit Any Team:** The host can update any franchise name, captain name, or adjust purse budgets on the fly.
  * **🗑️ Kick / Remove Teams:** Remove unwanted, inactive, or duplicate teams with one click.
* **Higher Authority Live Commands:**
  * **⏸️ Pause / Resume Auction Clock:** Stop or restart the countdown timer at any time.
  * **🔨 Sell Now (Hammer Down):** Instantly awards the player to the highest bidder without waiting for the clock.
  * **⏩ Pass / Mark Unsold:** Immediately marks the player unsold and brings up the next lot.
  * **↩️ Undo Last Bid:** Revert accidental bids or misclicks.
  * **🔑 Change Host PIN:** The host can change their PIN to any new PIN at any time.
  * **🔄 Reset Tournament:** Restores all team budgets to 100M and returns to the lobby.

---

## ⚡ Zero-Config: Works Out of the Box!

* **No external database required:** Operates smoothly out of the box using resilient in-memory state.
* **Solo Mode / Quick Test:** Click **"+ Add Demo Teams"** in the lobby to load 3 rival franchises (*Lahore Qalandars*, *Karachi Kings*, *Islamabad United*) equipped with autonomous bidding AI.
* **Audio Feedback:** Real-time wooden gavel taps and bid chimes synthesized with Web Audio API.

---

## 🚀 Running Locally

1. In this project folder:
   ```bash
   npm start
   ```
2. Open your browser:
   ```
   http://localhost:3000
   ```

---

## 🌐 Deploying to Vercel

1. Push this repository to GitHub (connected to `MuhammadAnasBilal/Cricket_app`).
2. Vercel automatically deploys every commit with zero extra configuration needed.

---

## 📋 Auction Rules

* **Purse Budget:** 100.0M per franchise.
* **Squad Size:** 11 Players (1 Captain + 10 Bought Players).
* **Base Prices:** 0.5M to 2.0M based on player tier.
* **Timer:** 25s initial countdown, resets to 15s on each higher bid.
* **Player Pool:** 138 international stars with roles (Batters, Fast Bowlers, Spinners, All-Rounders, Wicketkeepers).
