/**
 * server.js - IdeaShelf (login + owner-only edit/delete + like toggle + mypage + account delete)
 * - Static: / -> product/
 * - Auth: POST /api/register, POST /api/login, POST /api/logout, GET /api/me
 * - Account:
 *    DELETE /api/account         (login required)
 * - Ideas:
 *    GET    /api/ideas
 *    GET    /api/ideas/:id
 *    GET    /api/my/ideas        (login required)  ★マイページ用
 *    POST   /api/ideas           (login required)
 *    PUT    /api/ideas/:id       (login + owner required)
 *    DELETE /api/ideas/:id       (login + owner required)
 * - Likes:
 *    POST   /api/ideas/:id/like  (login required, toggle, cannot like own idea)
 */

console.log("LOADED:", __filename);

const path = require("path");
const express = require("express");
const mysql = require("mysql2/promise");
const session = require("express-session");
const bcrypt = require("bcrypt");

const app = express();
const PORT = process.env.PORT || 3000;

// ================================
// Config (env)
// ================================
const isProd = process.env.NODE_ENV === "production";

// DB (必須)
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || ""; // 本番では必ずセット
const DB_NAME = process.env.DB_NAME || "idea_platform";

// Session secret (本番は必須)
const SESSION_SECRET = process.env.SESSION_SECRET;

if (isProd && !SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production");
}

const db = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  connectionLimit: 10,
  // 本番DBがSSL必須の時だけ使う（提供元の指示に従って設定）
  // ssl: { rejectUnauthorized: true },
});

// ================================
// Middlewares
// ================================
app.use(express.json());

// ✅ PaaS / Nginx などのリバースプロキシ配下で secure cookie を正しく扱う
if (isProd) {
  app.set("trust proxy", 1);
}

app.use(
  session({
    // dev では SESSION_SECRET が未設定でも動くように（本番は上で必須チェック済み）
    secret: SESSION_SECRET || "dev_only_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd, // ✅ 本番(HTTPS)なら true
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

// 静的配信
app.use(express.static(path.join(__dirname, "product")));

// ================================
// Helpers
// ================================
function sendErr(res, status, message) {
  return res.status(status).json({ error: message });
}

function requireLogin(req, res, next) {
  if (!req.session?.userId) return sendErr(res, 401, "login required");
  next();
}

function validateNumericId(id) {
  return /^\d+$/.test(String(id));
}

async function requireOwner(req, res, next) {
  try {
    const ideaId = req.params.id;
    if (!validateNumericId(ideaId)) return sendErr(res, 400, "invalid id");

    const [rows] = await db.query("SELECT user_id FROM ideas WHERE id = ?", [ideaId]);
    if (!rows || rows.length === 0) return sendErr(res, 404, "not found");

    const ownerId = rows[0].user_id;
    if (Number(ownerId) !== Number(req.session.userId)) return sendErr(res, 403, "forbidden");

    next();
  } catch (e) {
    console.error("requireOwner error:", e);
    return sendErr(res, 500, "server error");
  }
}

// ================================
// Auth
// ================================
app.get("/api/me", async (req, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.json({ loggedIn: false });

    // ★ここ：is_admin を SELECT に追加
    const [[u]] = await db.query(
      "SELECT id, username, is_admin FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    if (!u) return res.json({ loggedIn: false });

    // ★ここ：返すJSONにも is_admin を追加
    res.json({ loggedIn: true, userId: u.id, username: u.username, is_admin: u.is_admin });
  } catch (e) {
    console.error(e);
    res.json({ loggedIn: false });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return sendErr(res, 400, "missing fields");

    const hash = await bcrypt.hash(String(password), 10);
    const [result] = await db.query(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
      [String(username), hash]
    );

    // 登録したらログイン状態にする（現状のindex.html設計に合わせる）
    req.session.userId = result.insertId;
    res.json({ ok: true, userId: result.insertId });
  } catch (e) {
    console.error(e);
    return sendErr(res, 400, "register failed");
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return sendErr(res, 400, "missing fields");

    // 同名usernameが複数ありうるので、全部取ってパスワード一致する行を探す
    const [rows] = await db.query("SELECT id, password_hash FROM users WHERE username = ?", [
      String(username),
    ]);
    if (!rows || rows.length === 0) return sendErr(res, 401, "invalid credentials");

    let matchedUser = null;
    for (const u of rows) {
      const ok = await bcrypt.compare(String(password), u.password_hash);
      if (ok) {
        matchedUser = u;
        break;
      }
    }

    if (!matchedUser) return sendErr(res, 401, "invalid credentials");

    req.session.userId = matchedUser.id;
    res.json({ ok: true, userId: matchedUser.id });
  } catch (e) {
    console.error(e);
    return sendErr(res, 500, "login failed");
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ================================
// Account
// ================================
app.delete("/api/account", requireLogin, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const userId = Number(req.session.userId);

    await conn.beginTransaction();

    // 1) 自分の投稿IDを取得
    const [myIdeas] = await conn.query("SELECT id FROM ideas WHERE user_id = ?", [userId]);
    const ideaIds = myIdeas.map((r) => r.id);

    // 2) 自分の投稿に付いたlikesを削除（他人のいいねも含めて）
    if (ideaIds.length > 0) {
      await conn.query("DELETE FROM likes WHERE idea_id IN (?)", [ideaIds]);
    }

    // 3) 自分が押したlikesを削除
    await conn.query("DELETE FROM likes WHERE user_id = ?", [userId]);

    // 4) 自分の投稿を削除
    await conn.query("DELETE FROM ideas WHERE user_id = ?", [userId]);

    // 5) ユーザーを削除
    await conn.query("DELETE FROM users WHERE id = ?", [userId]);

    await conn.commit();

    req.session.destroy(() => res.json({ ok: true }));
  } catch (e) {
    await conn.rollback();
    console.error("DELETE /api/account error:", e);
    res.status(500).json({ error: "account delete failed" });
  } finally {
    conn.release();
  }
});

// ================================
// Ideas
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
    console.error(e);
    res.status(500).json({ error: "DB read failed" });
  }
});

app.get("/api/ideas/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!validateNumericId(id)) return sendErr(res, 400, "invalid id");

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

    if (!rows || rows.length === 0) return sendErr(res, 404, "not found");
    res.json(rows[0]);
  } catch (e) {
    console.error("GET /api/ideas/:id error:", e);
    res.status(500).json({ error: "DB read failed" });
  }
});

// ✅ マイページ用：自分の投稿一覧（いいね数つき）
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

app.post("/api/ideas", requireLogin, async (req, res) => {
  try {
    const { product_name, subtitle, idea_text, tags, status } = req.body || {};
    if (!product_name || !idea_text) return sendErr(res, 400, "missing fields");

    const [result] = await db.query(
      "INSERT INTO ideas (user_id, product_name, subtitle, idea_text, tags, status) VALUES (?, ?, ?, ?, ?, ?)",
      [
        req.session.userId,
        String(product_name),
        subtitle ?? null,
        String(idea_text),
        tags ?? null,
        status ?? "draft",
      ]
    );

    res.json({ id: result.insertId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB insert failed" });
  }
});

// ✅ いいね（トグル）※自分の投稿には不可
app.post("/api/ideas/:id/like", requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;

    const ideaIdStr = req.params.id;
    if (!validateNumericId(ideaIdStr)) return res.status(400).json({ error: "bad id" });
    const ideaId = Number(ideaIdStr);

    // ★自分の投稿か確認（自分の投稿には いいね不可）
    const [[idea]] = await db.query("SELECT user_id FROM ideas WHERE id = ? LIMIT 1", [ideaId]);
    if (!idea) return res.status(404).json({ error: "not found" });

    if (Number(idea.user_id) === Number(userId)) {
      return res.status(403).json({ error: "cannot like your own idea" });
    }

    // ---- トグル ----
    const [exists] = await db.query(
      "SELECT 1 FROM likes WHERE user_id = ? AND idea_id = ? LIMIT 1",
      [userId, ideaId]
    );

    let liked;
    if (exists.length > 0) {
      await db.query("DELETE FROM likes WHERE user_id = ? AND idea_id = ?", [userId, ideaId]);
      liked = false;
    } else {
      await db.query("INSERT INTO likes (user_id, idea_id) VALUES (?, ?)", [userId, ideaId]);
      liked = true;
    }

    const [[row]] = await db.query("SELECT COUNT(*) AS like_count FROM likes WHERE idea_id = ?", [
      ideaId,
    ]);

    res.json({ ok: true, liked, like_count: row.like_count });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "like toggle failed" });
  }
});

app.put("/api/ideas/:id", requireLogin, requireOwner, async (req, res) => {
  try {
    const id = req.params.id;
    const { product_name, subtitle, idea_text, tags, status } = req.body || {};
    if (!product_name || !idea_text) return sendErr(res, 400, "missing fields");

    const [result] = await db.query(
      `UPDATE ideas
       SET product_name=?, subtitle=?, idea_text=?, tags=?, status=?
       WHERE id=?`,
      [String(product_name), subtitle ?? null, String(idea_text), tags ?? null, status ?? "draft", id]
    );

    res.json({ ok: true, affectedRows: result.affectedRows });
  } catch (e) {
    console.error("PUT /api/ideas/:id error:", e);
    res.status(500).json({ error: "DB update failed" });
  }
});

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
// Listen
// ================================
app.listen(PORT, () => {
  console.log(`Server running: http://localhost:${PORT}`);
});
