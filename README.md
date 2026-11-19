# Deploy (about 10 minutes)
1. Install Node, then: npm i -g vercel
2. In this folder: vercel login, then vercel link
3. Vercel dashboard > your project > Storage (or Marketplace) > add **Upstash Redis** (free) and connect it to the project. It adds the KV_REST_API_URL / KV_REST_API_TOKEN env vars automatically.
4. Set your host PIN: vercel env add HOST_PIN production   (type a PIN only you know)
5. vercel --prod  and send the URL to your friends.
