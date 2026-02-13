// product/js/index.js（一覧：検索 + いいね表示 + いいね順 + クリックいいね（トグル））
const API_BASE = "";
const $ = (sel) => document.querySelector(sel);

function formatDate(iso) {
  try {
    if (!iso) return "";
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}/${m}/${day}`;
  } catch {
    return "";
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(s) {
  return String(s ?? "").toLowerCase();
}

function parseTags(tags) {
  if (typeof tags === "string") {
    return tags.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(tags)) return tags;
  return [];
}

function getLikeCount(row) {
  return Number(row.like_count ?? row.likes ?? 0);
}

function getLikedByMe(row) {
  return Boolean(Number(row.liked_by_me ?? 0));
}

async function apiJson(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { res, data };
}

async function fetchMe() {
  const { res, data } = await apiJson("/api/me");
  if (!res.ok) return { loggedIn: false };
  return data || { loggedIn: false };
}

async function fetchIdeas() {
  const res = await fetch(`${API_BASE}/api/ideas?status=all&t=${Date.now()}`, {
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function toggleLike(id, liked) {
  const method = liked ? "DELETE" : "POST"; // ★ここが肝
  const { res, data } = await apiJson(`${API_BASE}/api/ideas/${id}/like`, { method });
  return { ok: res.ok, status: res.status, data };
}

let allRows = [];
let meState = { loggedIn: false, userId: null, username: null };

/* ================================
   Auth UI (header)
   - loggedIn: ログインボタン隠す
   - loggedIn: ログアウト/マイページ表示
   ================================ */
function applyAuthUI(state) {
  const loggedIn = Boolean(state?.loggedIn);

  const navActions = document.querySelector(".nav-actions.auth") || document.querySelector(".nav-actions");
  const authStatus = $("#authStatus");

    const registerBtn = $("#registerBtn");
  if (registerBtn) registerBtn.style.display = loggedIn ? "none" : "";

  const logoutBtn = $("#logoutBtn");
  const mypageLink = $("#mypageLink");

  // ログインボタン（idがある場合）
  const loginBtn = $("#loginBtn");

  // idが無い場合もあるので、form内の submit も探す
  const loginForm = $("#loginForm");
  const loginSubmitInForm =
    loginForm?.querySelector?.('button[type="submit"], input[type="submit"]') || null;

  // class（CSSで制御したいとき用）
  if (navActions?.classList) {
    navActions.classList.toggle("is-logged-in", loggedIn);
  }

  // ステータス表示
  if (authStatus) {
    authStatus.textContent = loggedIn ? `ログイン中：${state?.username ?? ""}`.trim() : "未ログイン";
  }

  // 表示切替
  if (logoutBtn) logoutBtn.style.display = loggedIn ? "" : "none";
  if (mypageLink) mypageLink.style.display = loggedIn ? "" : "none";

  // ログイン中はログインボタン不要
  if (loginBtn) loginBtn.style.display = loggedIn ? "none" : "";
  if (loginSubmitInForm && loginSubmitInForm !== loginBtn) {
    loginSubmitInForm.style.display = loggedIn ? "none" : "";
  }

  // （任意）ログイン中は入力を無効化して誤操作防止
  const userEl = $("#loginUser");
  const passEl = $("#loginPass");
  if (userEl) userEl.disabled = loggedIn;
  if (passEl) passEl.disabled = loggedIn;

    // 新規投稿ボタン（未ログイン時は消す）
  const newPostBtn = $("#newPostBtn");
  if (newPostBtn) newPostBtn.style.display = loggedIn ? "" : "none";

}

function renderIdeaCard(row) {
  const id = row.id;
  const title = escapeHtml(row.product_name ?? "");
  const desc = String(row.idea_text ?? "");
  const snippet = escapeHtml(desc).slice(0, 80) + (desc.length > 80 ? "…" : "");
  const created = formatDate(row.created_at);

  // status 表示
  const isPub = row.status === "published";
  const statusText = isPub ? "公開" : "下書き";
  const statusClass = isPub ? "pub" : "draft";

  // tags
  const tags = parseTags(row.tags);
  const tagsHtml = tags.length
    ? tags.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("")
    : `<span class="badge muted">タグなし</span>`;

  // いいね情報
  const likes = getLikeCount(row);
  const liked = getLikedByMe(row);
  const heart = liked ? "♥" : "♡";

  const href = `detail.html?id=${encodeURIComponent(id)}`;

  // ★所有者判定
  const isOwner = Boolean(meState?.loggedIn) && Number(meState.userId) === Number(row.user_id);

  // ★作成者表示：自分なら you / 他人なら username
  const author = isOwner ? "you" : escapeHtml(row.author_username ?? "unknown");

  // ★いいね可能：ログイン中＆自分の投稿じゃない
  const canLike = Boolean(meState?.loggedIn) && !isOwner;

  const titleLike = !meState?.loggedIn
    ? "ログインしていいね"
    : isOwner
    ? "自分の投稿にはいいねできません"
    : liked
    ? "いいねを取り消す"
    : "いいねする";

  // ★見た目を崩さない：spanをクリック可能に
  return `
    <a class="idea" href="${href}">
      <div class="title">
        <span>${title}</span>
        <span class="badge ${statusClass}">${statusText}</span>
      </div>

      <div class="meta">
        <span>${created}</span>
        <span>作成者：${author}</span>
      </div>

      <div class="badges">${tagsHtml}</div>
      <p class="snippet">${snippet}</p>

      <div class="footer" style="display:flex; justify-content:space-between; align-items:center;">
        <span
          class="small like-btn"
          role="button"
          tabindex="0"
          data-idea-id="${escapeHtml(id)}"
          data-owner="${isOwner ? "1" : "0"}"
          aria-label="いいね"
          aria-disabled="${canLike ? "false" : "true"}"
          title="${escapeHtml(titleLike)}"
          style="display:inline-flex; align-items:center; gap:6px; cursor:${canLike ? "pointer" : "default"}; background:transparent; color:inherit; border:0; padding:0; opacity:${canLike ? (liked ? ".85" : "1") : ".6"};"
        >
          <span class="like-heart">${heart}</span>
          <span class="badge like-count">${Number.isFinite(likes) ? likes : 0}</span>
        </span>

        <span class="btn">詳細を見る →</span>
      </div>
    </a>
  `;
}

function renderList(grid, rows) {
  if (!rows || rows.length === 0) {
    grid.innerHTML = `
      <div class="panel" style="grid-column: 1 / -1;">
        <h3 style="margin:0 0 8px;">該当する投稿がありません</h3>
        <div class="help">検索語を変えるか、条件を空にしてみてください。</div>
      </div>
    `;
    return;
  }
  grid.innerHTML = rows.map(renderIdeaCard).join("");
}

function applyFilters({ grid, searchInput, sortSelect, categorySelect }) {
  // ① キーワード検索
  const q = normalizeText(searchInput?.value).trim();
  let rows = allRows.filter((row) => {
    if (!q) return true;
    const text = [row.product_name, row.idea_text, row.tags, row.status]
      .map(normalizeText)
      .join(" ");
    return text.includes(q);
  });

  // ② カテゴリ
  const cat = categorySelect?.value ?? "";
  if (cat) rows = rows.filter((row) => String(row.tags ?? "").includes(cat));

  // ③ 並び替え
  const sort = sortSelect?.value ?? "new";
  rows = rows.slice();

  if (sort === "new") rows.sort((a, b) => Number(b.id) - Number(a.id));
  if (sort === "old") rows.sort((a, b) => Number(a.id) - Number(b.id));

  if (sort === "likes") {
    rows.sort((a, b) => {
      const d = getLikeCount(b) - getLikeCount(a);
      if (d !== 0) return d;
      return Number(b.id) - Number(a.id);
    });
  }

  if (sort === "tag") {
    rows.sort((a, b) => String(a.tags ?? "").localeCompare(String(b.tags ?? "")));
  }

  renderList(grid, rows);
}

/* ================================
   Auth handlers (login/register/logout)
   ================================ */
function setupAuthHandlers(refreshAll) {
  const loginForm = $("#loginForm");
  const userEl = $("#loginUser");
  const passEl = $("#loginPass");
  const registerBtn = $("#registerBtn");
  const logoutBtn = $("#logoutBtn");
  const loginBtn = $("#loginBtn");

  let loginSubmitting = false;

  // ログイン（★二重送信防止つき）
  loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loginSubmitting) return;
    loginSubmitting = true;
    if (loginBtn) loginBtn.disabled = true;

    try {
      if (!userEl?.value || !passEl?.value) {
        alert("username と password を入力してください");
        return;
      }

      const { res, data } = await apiJson("/api/login", {
        method: "POST",
        body: JSON.stringify({ username: userEl.value, password: passEl.value }),
      });

      if (!res.ok) {
        alert(data?.error || "ログインに失敗しました");
        return;
      }

      userEl.value = "";
      passEl.value = "";

      await refreshAll();
    } finally {
      loginSubmitting = false;
      if (loginBtn) loginBtn.disabled = false;
    }
  });

   // 登録
  registerBtn?.addEventListener("click", async () => {
    if (!userEl?.value || !passEl?.value) {
      alert("username と password を入力してください");
      return;
    }

    const { res, data } = await apiJson("/api/register", {
      method: "POST",
      body: JSON.stringify({ username: userEl.value, password: passEl.value }),
    });

    if (res.status === 409) {
      alert(data?.error || "そのユーザー名は既に使われています");
      return;
    }
    if (!res.ok) {
      alert(data?.error || "登録に失敗しました");
      return;
    }

    alert("登録しました。続けてログインしてください。");
  });

  // ログアウト
  logoutBtn?.addEventListener("click", async () => {
    const { res, data } = await apiJson("/api/logout", { method: "POST" });
    if (!res.ok) {
      alert(data?.error || "ログアウトに失敗しました");
      return;
    }
    await refreshAll();
  });
}

async function setup() {
  const grid = $("#ideaGrid");
  if (!grid) return;

  const searchInput = $("#searchInput");
  const sortSelect = $("#sortSelect");
  const categorySelect = $("#categorySelect");

  async function refreshAll() {
    meState = await fetchMe();
    applyAuthUI(meState); // ★ヘッダー表示を更新

    allRows = await fetchIdeas();
    applyFilters({ grid, searchInput, sortSelect, categorySelect });
  }

  // 認証UI（ログイン/登録/ログアウト）
  setupAuthHandlers(refreshAll);

  try {
    await refreshAll();
  } catch (e) {
    console.error(e);
    grid.innerHTML = `
      <div class="panel" style="grid-column: 1 / -1;">
        <h3 style="margin:0 0 8px;">読み込みに失敗しました</h3>
        <div class="help">${escapeHtml(e.message)}</div>
      </div>
    `;
    return;
  }

  const apply = () => applyFilters({ grid, searchInput, sortSelect, categorySelect });
  searchInput?.addEventListener("input", apply);
  sortSelect?.addEventListener("change", apply);
  categorySelect?.addEventListener("change", apply);

  // ★いいねクリック（トグル）
  document.addEventListener("click", async (e) => {
    const el = e.target.closest(".like-btn");
    if (!el) return;

    // カード遷移を止める
    e.preventDefault();
    e.stopPropagation();

    if (el.getAttribute("aria-disabled") === "true") {
      if (!meState?.loggedIn) alert("ログインしてください（右上のログインフォーム）");
      else if (el.dataset.owner === "1") alert("自分の投稿にはいいねできません");
      return;
    }

    const ideaId = el.dataset.ideaId;
    const countEl = el.querySelector(".like-count");
    const heartEl = el.querySelector(".like-heart");
    if (!ideaId || !countEl || !heartEl) return;

    // 通信中ロック
    el.setAttribute("aria-disabled", "true");
    el.style.cursor = "default";
    el.style.opacity = ".7";

    try {
      // ★今の状態（♥なら いいね済み）
      const likedBefore = heartEl.textContent === "♥";

      const r = await toggleLike(ideaId, likedBefore);

      if (r.status === 401) {
        alert("ログインしてください（右上のログインフォーム）");
        return;
      }
      if (r.status === 403) {
        alert("自分の投稿にはいいねできません");
        return;
      }
      if (!r.ok) throw new Error(r.data?.error || "いいねに失敗しました");

      const latest = Number(r.data?.like_count ?? 0);
      const likedNow = Boolean(r.data?.liked);

      countEl.textContent = String(latest);
      heartEl.textContent = likedNow ? "♥" : "♡";
      el.title = likedNow ? "いいねを取り消す" : "いいねする";
      el.style.opacity = likedNow ? ".85" : "1";

      // allRows更新（並び替え即反映）
      const target = allRows.find((x) => String(x.id) === String(ideaId));
      if (target) {
        target.like_count = latest;
        target.liked_by_me = likedNow ? 1 : 0;
      }

      // いいね順の画面なら見た目も更新したいので再描画
      if (($("#sortSelect")?.value ?? "new") === "likes") {
        apply();
      }
    } catch (err) {
      console.error(err);
      alert(err.message || "いいねに失敗しました");
    } finally {
      // ★押せる状態に戻す（ただし押せない状態なら戻さない）
      const isOwner = el.dataset.owner === "1";
      const canLike = Boolean(meState?.loggedIn) && !isOwner;

      el.setAttribute("aria-disabled", canLike ? "false" : "true");
      el.style.cursor = canLike ? "pointer" : "default";
      // opacity は title更新で変えてるので、ここでは触らなくてもOK
    }
  });

  // Enter/Spaceでいいね
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = e.target?.closest?.(".like-btn");
    if (!el) return;
    e.preventDefault();
    el.click();
  });

  // 戻る/復元対策：戻ってきたら最新化
  window.addEventListener("pageshow", () => {
    refreshAll().catch(console.error);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setup().catch(console.error);
});
