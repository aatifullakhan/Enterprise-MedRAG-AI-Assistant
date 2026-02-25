import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isVercel = process.env.VERCEL === "1";
const dbPath = isVercel ? path.join("/tmp", "medical_kb.db") : "medical_kb.db";
const db = new Database(dbPath);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    source TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const app = express();
app.use(express.json({ limit: '10mb' }));

// API Routes
app.get("/api/documents", (req, res) => {
  const docs = db.prepare("SELECT id, title, source, created_at FROM documents ORDER BY created_at DESC").all();
  res.json(docs);
});

app.post("/api/documents", (req, res) => {
  const { title, content, source } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }
  const info = db.prepare("INSERT INTO documents (title, content, source) VALUES (?, ?, ?)").run(title, content, source || 'Uploaded File');
  res.json({ id: info.lastInsertRowid, title });
});

app.delete("/api/documents/:id", (req, res) => {
  db.prepare("DELETE FROM documents WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// RAG Search Endpoint
app.post("/api/search", (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query is required" });

  const keywords = query.split(/\s+/).filter((k: string) => k.length > 3);
  let results: any[] = [];
  
  if (keywords.length > 0) {
    const searchClauses = keywords.map(() => "content LIKE ?").join(" OR ");
    const params = keywords.map((k: string) => `%${k}%`);
    results = db.prepare(`SELECT * FROM documents WHERE ${searchClauses} LIMIT 5`).all(...params);
  } else {
    results = db.prepare("SELECT * FROM documents ORDER BY created_at DESC LIMIT 3").all();
  }

  res.json(results);
});

async function startServer() {
  const PORT = 3000;

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production" && !isVercel) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
  }

  if (!isVercel) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
