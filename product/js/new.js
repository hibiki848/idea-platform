// product/js/new.js
console.log("new.js loaded");

// 同一オリジンで叩く
const API_BASE = "";

const $ = (sel) => document.querySelector(sel);

function parseTagsInput(value) {
  return String(value ?? "")
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

async function apiJson(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
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

async function fetchIdea(id) {
  const { res, data } = await apiJson(`/api/ideas/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error(data?.error || (await res.text()));
  return data;
}

async function createIdea(payload) {
  const { res, data } = await apiJson(`/api/ideas`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(data?.error || (await res.text()));
  return data; // {ok,id}
}

async function updateIdea(id, payload) {
  const { res, data } = await apiJson(`/api/ideas/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(data?.error || (await res.text()));
  return data; // {ok:true}
}

window.addEventListener("DOMContentLoaded", async () => {
  const titleEl = $("#title");
  const subtitleEl = $("#subtitle");
  const descEl = $("#desc");
  const tagsEl = $("#tags");
  const statusEl = $("#status");
  const saveBtn = $("#saveBtn");

  const pageH1 = $("#pageH1");
  const pageLead = $("#pageLead");

  const id = new URLSearchParams(location.search).get("id");
  const isEdit = !!id;

  if (!titleEl || !descEl || !tagsEl || !saveBtn) {
    alert("フォーム要素が見つかりません（idが違うかも）");
    return;
  }

  // 編集モードなら読み込み
  if (isEdit) {
    if (pageH1) pageH1.textContent = "編集";
    if (pageLead) pageLead.textContent = "内容を更新して保存できます。";

    try {
      const idea = await fetchIdea(id);
      titleEl.value = idea.product_name ?? "";
      if (subtitleEl) subtitleEl.value = idea.subtitle ?? "";
      // ★本文は idea_text
      descEl.value = idea.idea_text ?? "";
      tagsEl.value = idea.tags ?? "";
      if (statusEl) statusEl.value = idea.status ?? "draft";
    } catch (e) {
      console.error(e);
      alert("読み込みに失敗: " + e.message);
      return; // 戻さない（原因見えるように）
    }
  } else {
    if (statusEl && !statusEl.value) statusEl.value = "draft";
  }

  saveBtn.addEventListener("click", async () => {
    const product_name = titleEl.value.trim();
    const subtitle = subtitleEl ? subtitleEl.value.trim() : "";
    const idea_text = descEl.value.trim(); // ★本文
    const tags = parseTagsInput(tagsEl.value);
    const status = statusEl ? String(statusEl.value || "draft") : "draft";

    if (!product_name) return alert("商品名を入力してね");
    if (!idea_text) return alert("商品アイデアを入力してね");

    saveBtn.disabled = true;
    const oldText = saveBtn.textContent;
    saveBtn.textContent = isEdit ? "更新中..." : "保存中...";

    try {
      const payload = {
        product_name,
        subtitle: subtitle || null,
        idea_text,          // ★サーバーはこれを必須にしてる
        tags: tags || null,
        status,             // draft/published
      };

      if (isEdit) {
        await updateIdea(id, payload);
        location.href = `detail.html?id=${encodeURIComponent(id)}`;
      } else {
        const data = await createIdea(payload);
        location.href = `detail.html?id=${encodeURIComponent(data.id)}`;
      }
    } catch (e) {
      console.error(e);
      // ★「ログインしてください」固定はやめる（400の原因が見えなくなる）
      alert("保存に失敗: " + e.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = oldText;
    }
  });
});
