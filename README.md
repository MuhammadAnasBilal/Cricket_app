# 🏏 Cricket Auction Pro

Live real-time Fantasy Cricket Player Auction web application. Host live drafts and player auctions with friends across multiple devices, or test solo against intelligent AI rival teams!

---

## ⚡ Zero-Config: Works Out of the Box!

- **No external database required to start:** Works instantly in-memory!
- **Default Host PIN:** `1234` (use this in the host controls to start or reset the auction).
- **Solo Mode / Quick Test:** Click **"+ Add Demo Teams"** in the lobby to instantly add 3 rival franchises (Lahore Qalandars, Karachi Kings, Islamabad United) with autonomous bidding AI!
- **Sound Effects:** Live gavel taps and bid chimes synthesized with Web Audio API.

---

## 🚀 Running Locally

1. Open your terminal in this project folder:
   ```bash
   npm start
   ```
2. Open your browser at:
   ```
   http://localhost:3000
   ```

---

## 🌐 Deploying to Vercel

1. Push this repository to GitHub (already configured).
2. Go to [Vercel](https://vercel.com/new) and import the repository.
3. Deploy with default settings. It will work out of the box!

### Optional: Distributed Multi-Instance Sync (Upstash Redis)
If you are running large public auctions across many geographical regions and want distributed persistent Redis storage:
1. Go to your project on Vercel > **Storage** > **Connect Database** > choose **Upstash Redis** (free).
2. (Optional) In **Settings** > **Environment Variables**, set `HOST_PIN` to your private PIN (defaults to `1234` if unset).

---

## 📋 Auction Rules

* **Purse Budget:** 100.0M per franchise.
* **Squad Size:** 11 Players (1 Captain + 10 Bought Players).
* **Base Prices:** 0.5M to 2.0M based on player tier.
* **Timer:** 25s initial countdown, resets to 15s on each higher bid.
* **Player Pool:** 138 international stars with roles (Batters, Fast Bowlers, Spinners, All-Rounders, Wicketkeepers).
