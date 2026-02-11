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
    return tags
      .split(/[,、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(tags)) return tags;
  return [];
}

async function loadMe() {
  const { res, data } = await apiJson("/api/me");
  if (!res.ok) return { loggedIn: false };
  return data || { loggedIn: false };
}

// ★所有者だけ編集/削除を表示
function setOwnerOnlyUI({ isOwner }) {
  const editLink = $("#editLink");
  const editLinkTop = $("#editLinkTop");
  const deleteBtn = $("#deleteBtn");

  if (isOwner) {
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

/**
 * ★表示の互換対応
 * - 本文: idea_text がなければ description を表示
 * - タグ: tags がなければ category をタグっぽく表示（暫定）
 * - status/updated_at が無い環境でも落ちない
 */
function applyIdeaToUI(idea) {
  setText("#ideaTitle", idea.product_name ?? "（タイトル）");
  setText("#ideaSubtitle", idea.subtitle ?? "");

  // 本文（idea_text優先 → 無ければdescription）
  const bodyText = idea.idea_text ?? idea.description ?? "";
  const bodyHtml = escapeHtml(bodyText).replaceAll("\n", "<br>");
  setHtml("#ideaBody", bodyHtml || `<div class="help">本文がありません</div>`);

  // タグ（tags優先 → 無ければcategory）
  const tagsArr = parseTags(idea.tags ?? idea.category ?? "");
  const tagsHtml = tagsArr.length
    ? tagsArr.map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join("")
    : `<span class="badge muted">タグなし</span>`;
  setHtml("#ideaTags", tagsHtml);

  // ステータス
  const status = idea.status ?? "-";
  setText(
    "#statusVal",
    status === "published" ? "公開" : status === "draft" ? "下書き" : String(status)
  );

  // 日付（無いなら "-"）
  setText("#createdVal", formatDate(idea.created_at));
  setText("#updatedVal", formatDate(idea.updated_at));

  // 編集リンク（new.html で編集する想定）
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

  // ★自分の投稿にはいいね不可
  if (isOwner) {
    btn.disabled = true;
    btn.title = "自分の投稿にはいいねできません";
    btn.style.opacity = ".6";
    return;
  }

  // トグルなので固定はしない
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
    setHtml("#ideaBody", `<div class="help">例：detail.html?id=36 のように開いてください</div>`);
    const likeBtn = $(".like-btn");
    if (likeBtn) likeBtn.disabled = true;

    setOwnerOnlyUI({ isOwner: false });
    return;
  }

  // ログイン状態
  const me = await loadMe();
  const loggedIn = !!me?.loggedIn;

  // 詳細取得（server.jsが like_count/liked_by_me/author_username/user_id を返す想定）
  const { res, data: idea } = await apiJson(`/api/ideas/${ideaId}`);
  if (!res.ok || !idea) {
    setText("#ideaTitle", "見つかりませんでした");
    setHtml(
      "#ideaBody",
      `<div class="help">${escapeHtml(idea?.error || "読み込みに失敗しました")}</div>`
    );
    const likeBtn = $(".like-btn");
    if (likeBtn) likeBtn.disabled = true;

    setOwnerOnlyUI({ isOwner: false });
    return;
  }

  applyIdeaToUI(idea);

  // ★所有者判定（ログイン中 && me.userId === idea.user_id）
  const isOwner = Boolean(loggedIn) && Number(me.userId) === Number(idea.user_id);
  setOwnerOnlyUI({ isOwner });

  // ★作成者表示：自分なら you / 他人なら username
  const authorName = isOwner ? "you" : (idea.author_username ?? "unknown");
  setText("#authorVal", authorName);

  // いいね情報（無い場合も落ちない）
  let likeCount = Number(idea.like_count ?? 0);
  let likedByMe = Boolean(Number(idea.liked_by_me ?? 0));
  setLikeUI({ ideaId, likeCount, likedByMe, loggedIn, isOwner });

  // いいねクリック（トグル）
  const likeBtn = $(".like-btn");
  likeBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    // ownerは不可（UI保険）
    if (isOwner) {
      alert("自分の投稿にはいいねできません");
      return;
    }

    const meNow = await loadMe();
    if (!meNow?.loggedIn) {
      alert("ログインしてください");
      return;
    }

    const countEl = likeBtn.querySelector(".like-count");
    if (!countEl) return;

    // 通信中だけロック
    likeBtn.disabled = true;

    try {
      const { res, data } = await apiJson(`/api/ideas/${ideaId}/like`, { method: "POST" });

      if (res.status === 401) {
        alert("ログインしてください");
        return;
      }
      if (res.status === 403) {
        alert("自分の投稿にはいいねできません");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "いいねに失敗しました");

      // ★サーバーが like_count / liked を返さない場合もあるので保険
      const latest = Number(data?.like_count ?? (likeCount + (likedByMe ? -1 : 1)));
      const likedNow = data?.liked != null ? Boolean(data.liked) : !likedByMe;

      likeCount = latest;
      likedByMe = likedNow;

      countEl.textContent = String(latest);
      setLikeUI({ ideaId, likeCount, likedByMe, loggedIn: true, isOwner: false });
    } catch (err) {
      console.error(err);
      alert(err.message || "いいねに失敗しました");
    } finally {
      // トグルなので押せる状態に戻す
      likeBtn.disabled = false;
    }
  });

  // 削除（★所有者のみUIに出てるが、念のためガード）
  $("#deleteBtn")?.addEventListener("click", async () => {
    const meNow = await loadMe();
    if (!meNow?.loggedIn) {
      alert("ログインしてください");
      return;
    }

    if (Number(meNow.userId) !== Number(idea.user_id)) {
      alert("削除できません（所有者のみ）");
      return;
    }

    if (!confirm("この投稿を削除しますか？")) return;

    const { res, data } = await apiJson(`/api/ideas/${ideaId}`, { method: "DELETE" });

    if (res.status === 403) {
      alert("削除できません（所有者のみ）");
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
