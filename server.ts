import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());

  const cache = new Map<string, { data: any, contentType: string, timestamp: number }>();
  const CACHE_TTL = 1000 * 60 * 5; // 5 minutes cache

  // TMDB and Jikan Proxy
  app.get("/api/proxy", async (req, res) => {
    const { url } = req.query;
    console.log(`[Server] Proxy request received for: ${url}`);
    
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL is required" });
    }

    if (!url.startsWith("http")) {
      return res.status(400).json({ error: "Invalid URL protocol" });
    }

    // Check cache
    const cached = cache.get(url);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      console.log(`[Server] Cache hit for: ${url}`);
      if (cached.contentType) res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Cache", "HIT");
      return res.send(cached.data);
    }

    try {
      console.log(`[Server] Fetching from downstream: ${url}`);
      const isTmdb = url.includes("api.themoviedb.org");
      const headers: Record<string, string> = {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://api.themoviedb.org/",
      };

      if (isTmdb) {
        const token = process.env.TMDB_TOKEN || "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzNmY0N2U0NzAyZjBmZmJiMGM5Nzg4ZDA2OTk1ZWNkZSIsIm5iZiI6MTc3NjE0NDc3My4yNjgsInN1YiI6IjY5ZGRkMTg1ZTUzMmY2OTFkZWQ5NDEwOSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.dy8WanI7kFpTfCorNjBgEiHfx3nJVvBrpz9EZ6veHqo";
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });
      console.log(`[Server] Downstream status: ${response.status} for ${url}`);
      
      const contentType = response.headers.get("content-type");
      const status = response.status;
      const buffer = await response.arrayBuffer();
      const responseData = Buffer.from(buffer);

      // Cache successful responses
      if (status === 200) {
        cache.set(url, {
          data: responseData,
          contentType: contentType || "application/json",
          timestamp: Date.now()
        });
      }

      res.status(status);
      if (contentType) res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("X-Cache", "MISS");
      return res.send(responseData);
      
    } catch (error: any) {
      console.error(`[Server] Proxy Critical Error for ${url}:`, error.message);
      res.status(502).json({ error: "Bad Gateway", message: error.message });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
