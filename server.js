console.log("LOADED:", __filename);

const express = require("express");
const path = require("path");
const mysql = require("mysql2/promise");
const session = require("express-session");
const bcrypt = require("bcrypt");

const app = express();

// ================================
// Middleware
// ================================
app.use(express.json());
app.use(express.static(path.join(__dirname, "product")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// ================================
// DB (Railway MySQL)
// ================================
const baseUrl = process.env.MYSQL_URL;          // RailwayのMySQL参照
const dbName = process.env.MYSQL_DATABASE;     // idea_platform など

if (!baseUrl) throw new Error("MYSQL_URL is missing");
if (!dbName) throw new Error("MYSQL_DATABASE is missing");

// mysql://user:pass@host:port  ← /dbName を足す
const url = baseUrl.includes("/") ? baseUrl : `${baseUrl}/${dbName}`;

// もし mysql://.../something の形ならDB名を強制的に上書き
const finalUrl = url.replace(/\/[^/?#]+(\?|#|$)/, `/${dbName}$1`);

const db = require("./db");

// 起動時に接続テスト（ログで原因がすぐ分かる）
(async () => {
  try {
    const [r] = await db.query("SELECT 1 AS ok");
    console.log("DB connected:", r?.[0]?.ok === 1 ? "OK" : r);
    const [d] = await db.query("SELECT DATABASE() AS db");
    console.log("DB name:", d?.[0]?.db);
  } catch (e) {
    console.error("DB connect test failed:", e);
  }
})();

// ================================
// Helpers
// ================================
function requireLogin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: "login required" });
  next();
}

async function requireOwner(req, res, next) {
  try {
    const id = req.params.id;
    const userId = req.session?.userId;

    const [[row]] = await db.query("SELECT user_id FROM ideas WHERE id=? LIMIT 1", [id]);
    if (!row) return res.status(404).json({ error: "idea not found" });
    if (row.user_id !== userId) return res.status(403).json({ error: "forbidden" });

    next();
  } catch (e) {
    console.error("requireOwner error:", e);
    res.status(500).json({ error: "server error" });
  }
}

// ================================
// Auth
// ================================
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username/password required" });

    const password_hash = await bcrypt.hash(password, 10);
    await db.query("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, password_hash]);

    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/register error:", e);
    // username重複など
    res.status(400).json({ error: "register failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username/password required" });

    const [[u]] = await db.query("SELECT id, username, password_hash FROM users WHERE username=? LIMIT 1", [username]);
    if (!u) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    req.session.userId = u.id;
    res.json({ ok: true, userId: u.id, username: u.username });
  } catch (e) {
    console.error("POST /api/login error:", e);
    res.status(500).json({ error: "login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.json({ loggedIn: false });

    const [[u]] = await db.query("SELECT id, username FROM users WHERE id=? LIMIT 1", [userId]);
    if (!u) return res.json({ loggedIn: false });

    res.json({ loggedIn: true, userId: u.id, username: u.username });
  } catch (e) {
    console.error("GET /api/me error:", e);
    res.json({ loggedIn: false });
  }
});

// ================================
// Ideas (一覧)
// ================================
app.get("/api/ideas", async (req, res) => {
  try {
    const userId = req.session?.userId ?? null;

    const [rows] = await db.query(
      `
      SELECT
        i.*,
        u.username AS author_username,
        COALESCE(lc.like_count, 0) AS like_count,
        CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
      FROM ideas i
      LEFT JOIN users u ON u.id = i.user_id
      LEFT JOIN (
        SELECT idea_id, COUNT(*) AS like_count
        FROM likes
        GROUP BY idea_id
      ) lc ON lc.idea_id = i.id
      LEFT JOIN likes ul
        ON ul.idea_id = i.id AND ul.user_id = ?
      ORDER BY i.created_at DESC
      `,
      [userId]
    );

    res.json(rows);
  } catch (e) {
    console.error("GET /api/ideas error:", e);
    res.status(500).json({ error: "DB read failed" });
  }
});

// ================================
// Ideas: detail (GET /api/ideas/:id)
// ================================
app.get("/api/ideas/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

    const userId = req.session?.userId ?? null;

    const [rows] = await db.query(
      `
      SELECT
        i.*,
        u.username AS author_username,
        COALESCE(lc.like_count, 0) AS like_count,
        CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
      FROM ideas i
      LEFT JOIN users u ON u.id = i.user_id
      LEFT JOIN (
        SELECT idea_id, COUNT(*) AS like_count
        FROM likes
        GROUP BY idea_id
      ) lc ON lc.idea_id = i.id
      LEFT JOIN likes ul
        ON ul.idea_id = i.id AND ul.user_id = ?
      WHERE i.id = ?
      LIMIT 1
      `,
      [userId, id]
    );

    if (rows.length === 0) return res.status(404).json({ error: "not found" });

    res.json(rows[0]);
  } catch (e) {
    console.error("GET /api/ideas/:id error:", e);
    res.status(500).json({ error: "DB read failed" });
  }
});


// 自分の投稿
app.get("/api/my/ideas", requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;

    const [rows] = await db.query(
      `
      SELECT
        i.*,
        u.username AS author_username,
        COALESCE(lc.like_count, 0) AS like_count,
        CASE WHEN ul.user_id IS NULL THEN 0 ELSE 1 END AS liked_by_me
      FROM ideas i
      LEFT JOIN users u ON u.id = i.user_id
      LEFT JOIN (
        SELECT idea_id, COUNT(*) AS like_count
        FROM likes
        GROUP BY idea_id
      ) lc ON lc.idea_id = i.id
      LEFT JOIN likes ul
        ON ul.idea_id = i.id AND ul.user_id = ?
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC
      `,
      [userId, userId]
    );

    res.json(rows);
  } catch (e) {
    console.error("GET /api/my/ideas error:", e);
    res.status(500).json({ error: "DB read failed" });
  }
});

// 新規投稿
app.post("/api/ideas", requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const { product_name, subtitle, description, category } = req.body || {};

    if (!product_name) return res.status(400).json({ error: "product_name required" });

    const [result] = await db.query(
    "INSERT INTO ideas (user_id, product_name, subtitle, description, category) VALUES (?, ?, ?, ?, ?)",
    [userId, product_name, subtitle ?? "", description ?? "", category ?? ""]

    );

    res.json({ ok: true, id: result.insertId });
  } catch (e) {
    console.error("POST /api/ideas error:", e);
    res.status(500).json({ error: "DB insert failed" });
  }
});

// 削除（ログイン + 所有者のみ）
app.delete("/api/ideas/:id", requireLogin, requireOwner, async (req, res) => {
  try {
    const id = req.params.id;
    const [result] = await db.query("DELETE FROM ideas WHERE id=?", [id]);
    res.json({ ok: true, affectedRows: result.affectedRows });
  } catch (e) {
    console.error("DELETE /api/ideas/:id error:", e);
    res.status(500).json({ error: "DB delete failed" });
  }
});

// ================================
// Likes
// ================================
app.post("/api/ideas/:id/like", requireLogin, async (req, res) => {
  try {
    const ideaId = req.params.id;
    const userId = req.session.userId;

    await db.query("INSERT IGNORE INTO likes (user_id, idea_id) VALUES (?, ?)", [userId, ideaId]);
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/ideas/:id/like error:", e);
    res.status(500).json({ error: "like failed" });
  }
});

app.delete("/api/ideas/:id/like", requireLogin, async (req, res) => {
  try {
    const ideaId = req.params.id;
    const userId = req.session.userId;

    const [r] = await db.query("DELETE FROM likes WHERE user_id=? AND idea_id=?", [userId, ideaId]);
    res.json({ ok: true, affectedRows: r.affectedRows });
  } catch (e) {
    console.error("DELETE /api/ideas/:id/like error:", e);
    res.status(500).json({ error: "unlike failed" });
  }
});

// ================================
// Listen (Railway対応)
// ================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running:", PORT);
});
