// product/js/detail.js
console.log("detail.js loaded");

const $ = (sel) => document.querySelector(sel);

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(iso) {
  try {
    if (!iso) return "-";
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}/${m}/${day} ${hh}:${mm}`;
  } catch {
    return "-";
  }
}

function getIdeaIdFromUrl() {
  const sp = new URLSearchParams(location.search);
  return sp.get("id");
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

function setText(sel, text) {
  const el = $(sel);
  if (el) el.textContent = text ?? "";
}

function setHtml(sel, html) {
  const el = $(sel);
  if (el) el.innerHTML = html ?? "";
}

function parseTags(tags) {
  if (typeof tags === "string") {
    return tags.split(/[,、]/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(tags)) return tags;
  return [];
}

async function loadMe() {
  const { res, data } = await apiJson("/api/me");
  if (!res.ok) return { loggedIn: false };
  return data || { loggedIn: false };
}

// ★所有者 or 管理者だけ編集/削除を表示
function setOwnerOnlyUI({ canEdit }) {
  const editLink = $("#editLink");
  const editLinkTop = $("#editLinkTop");
  const deleteBtn = $("#deleteBtn");

  if (canEdit) {
    if (editLink) editLink.style.display = "";
    if (editLinkTop) editLinkTop.style.display = "";
    if (deleteBtn) deleteBtn.style.display = "";
  } else {
    // 崩さず非表示
    if (editLink) editLink.style.display = "none";
    if (editLinkTop) editLinkTop.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
  }
}

// ★UI反映（applyIdeaToUIはこれ1個だけ）
function applyIdeaToUI(idea, { isOwner, isAdmin }) {
  setText("#ideaTitle", idea.product_name ?? "（タイトル）");
  setText("#ideaSubtitle", idea.subtitle ?? "");

  const body = escapeHtml(idea.idea_text ?? "").replaceAll("\n", "<br>");
  setHtml("#ideaBody", body || `<div class="help">本文がありません</div>`);

  const tags = parseTags(idea.tags);
  const tagsHtml = tags.length
    ? tags.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("")
    : `<span class="badge muted">タグなし</span>`;
  setHtml("#ideaTags", tagsHtml);

  const status = idea.status ?? "-";
  setText(
    "#statusVal",
    status === "published" ? "公開" : status === "draft" ? "下書き" : status
  );
  setText("#createdVal", formatDate(idea.created_at));
  setText("#updatedVal", formatDate(idea.updated_at));

  // 作成者表示
  // - owner: you
  // - admin(他人): admin
  // - 他人: username
  const authorName = isOwner
    ? "you"
    : isAdmin
    ? "admin"
    : idea.author_username ?? "unknown";
  setText("#authorVal", authorName);

  // 編集リンク（new.html で編集）
  const editHref = `new.html?id=${encodeURIComponent(idea.id)}`;
  const editLink = $("#editLink");
  const editLinkTop = $("#editLinkTop");
  if (editLink) editLink.href = editHref;
  if (editLinkTop) editLinkTop.href = editHref;
}

function setLikeUI({ ideaId, likeCount, likedByMe, loggedIn, isOwner }) {
  const btn = $(".like-btn");
  if (!btn) return;

  btn.dataset.ideaId = String(ideaId);

  const countEl = btn.querySelector(".like-count");
  if (countEl) countEl.textContent = String(Number(likeCount ?? 0));

  // 自分の投稿にはいいね不可
  if (isOwner) {
    btn.disabled = true;
    btn.title = "自分の投稿にはいいねできません";
    btn.style.opacity = ".6";
    return;
  }

  btn.disabled = false;

  if (!loggedIn) {
    btn.title = "ログインしていいね";
    btn.style.opacity = "1";
    return;
  }

  btn.title = likedByMe ? "いいねを取り消す" : "いいねする";
  btn.style.opacity = likedByMe ? ".85" : "1";
}

async function main() {
  const ideaId = getIdeaIdFromUrl();
  console.log("detail url id:", ideaId);

  if (!ideaId) {
    setText("#ideaTitle", "URLにIDがありません");
    setHtml(
      "#ideaBody",
      `<div class="help">例：detail.html?id=36 のように開いてください</div>`
    );
    const likeBtn = $(".like-btn");
    if (likeBtn) likeBtn.disabled = true;

    setOwnerOnlyUI({ canEdit: false });
    return;
  }

  // ログイン状態
  const me = await loadMe();
  const loggedIn = !!me?.loggedIn;
  const isAdmin = Boolean(me?.isAdmin);

  // 詳細取得
  const { res, data: idea } = await apiJson(`/api/ideas/${encodeURIComponent(ideaId)}`);
  if (!res.ok || !idea) {
    setText("#ideaTitle", "見つかりませんでした");
    setHtml(
      "#ideaBody",
      `<div class="help">${escapeHtml(idea?.error || "読み込みに失敗しました")}</div>`
    );
    const likeBtn = $(".like-btn");
    if (likeBtn) likeBtn.disabled = true;

    setOwnerOnlyUI({ canEdit: false });
    return;
  }

  // 所有者判定 + 管理者判定
  const isOwner = Boolean(loggedIn) && Number(me.userId) === Number(idea.user_id);
  const canEdit = isOwner || isAdmin;

  // ★管理者でも編集/削除ボタンを出す
  setOwnerOnlyUI({ canEdit });

  // UI反映
  applyIdeaToUI(idea, { isOwner, isAdmin });

  // いいね情報（初期値）
  let likeCount = Number(idea.like_count ?? 0);
  let likedByMe = Boolean(Number(idea.liked_by_me ?? 0));
  setLikeUI({ ideaId, likeCount, likedByMe, loggedIn, isOwner });

  // ★いいねクリック（トグル：2回目で取り消し）
  const likeBtn = $(".like-btn");
  likeBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    if (isOwner) {
      alert("自分の投稿にはいいねできません");
      return;
    }

    const meNow = await loadMe();
    if (!meNow?.loggedIn) {
      alert("ログインしてください");
      return;
    }

    likeBtn.disabled = true;

    try {
      // likedByMe に応じて POST/DELETE を切り替える
      const method = likedByMe ? "DELETE" : "POST";

      const { res, data } = await apiJson(
        `/api/ideas/${encodeURIComponent(ideaId)}/like`,
        { method }
      );

      if (res.status === 401) {
        alert("ログインしてください");
        return;
      }
      if (res.status === 403) {
        alert("自分の投稿にはいいねできません");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "いいねに失敗しました");

      // サーバーが like_count / liked を返してくれるならそれを採用
      if (typeof data?.like_count === "number") {
        likeCount = Number(data.like_count);
      } else {
        likeCount = Math.max(0, likeCount + (likedByMe ? -1 : 1));
      }

      if (typeof data?.liked !== "undefined") {
        likedByMe = !!data.liked;
      } else {
        likedByMe = !likedByMe;
      }

      setLikeUI({ ideaId, likeCount, likedByMe, loggedIn: true, isOwner: false });
    } catch (err) {
      console.error(err);
      alert(err.message || "いいねに失敗しました");
    } finally {
      likeBtn.disabled = false;
    }
  });

  // 削除（所有者 or 管理者）
  $("#deleteBtn")?.addEventListener("click", async () => {
    const meNow = await loadMe();
    if (!meNow?.loggedIn) {
      alert("ログインしてください");
      return;
    }

    const nowIsAdmin = Boolean(meNow?.isAdmin);
    const nowIsOwner = Number(meNow.userId) === Number(idea.user_id);

    if (!nowIsOwner && !nowIsAdmin) {
      alert("削除できません（所有者または管理者のみ）");
      return;
    }

    if (!confirm("この投稿を削除しますか？")) return;

    const { res, data } = await apiJson(`/api/ideas/${encodeURIComponent(ideaId)}`, {
      method: "DELETE",
    });

    if (res.status === 403) {
      alert("削除できません（所有者または管理者のみ）");
      return;
    }
    if (!res.ok) {
      alert("削除に失敗しました: " + (data?.error || "error"));
      return;
    }

    alert("削除しました");
    location.href = "index.html";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch((e) => {
    console.error(e);
    alert("detail.js エラー: " + e.message);
  });
});
