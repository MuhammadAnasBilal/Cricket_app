const http = require("http");
const fs = require("fs");
const path = require("path");
const auctionHandler = require("./api/auction.js");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  
  if (parsedUrl.pathname === "/api/auction") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        req.body = body ? JSON.parse(body) : {};
      } catch(e) {
        req.body = {};
      }
      res.json = (data) => {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      };
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      try {
        await auctionHandler(req, res);
      } catch(e) {
        console.error("Handler error:", e);
        res.statusCode = 500;
        res.end(JSON.stringify({ err: "Server error" }));
      }
    });
    return;
  }

  // Serve static files from public directory
  let requestedPath = parsedUrl.pathname === "/" ? "/index.html" : parsedUrl.pathname;
  let filePath = path.join(PUBLIC_DIR, requestedPath);
  
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME_TYPES[ext] || "text/plain");
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`🏏 Cricket Auction Server is running at: http://localhost:${PORT}`);
});
