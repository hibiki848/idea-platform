// ★ここだけ修正：同一オリジンで叩く（Failed to fetch 対策）
const API_BASE = ""; // 例: "/api/..." でアクセスするため空でOK

function parseTagsInput(value) {
  return String(value ?? "")
    .split(/[,、]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
}

async function fetchIdea(id) {
  const res = await fetch(
    `${API_BASE}/api/ideas/${encodeURIComponent(id)}`
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function createIdea(payload) {
  const res = await fetch(`${API_BASE}/api/ideas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // {id}
}

async function updateIdea(id, payload) {
  const res = await fetch(`${API_BASE}/api/ideas/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json(); // {ok:true}
}

window.addEventListener("DOMContentLoaded", async () => {
  const titleEl = document.querySelector("#title");
  const subtitleEl = document.querySelector("#subtitle"); // ★追加
  const descEl = document.querySelector("#desc");
  const tagsEl = document.querySelector("#tags");
  const statusEl = document.querySelector("#status"); // ★追加（公開/下書き）
  const saveBtn = document.querySelector("#saveBtn");

  const pageH1 = document.querySelector("#pageH1");
  const pageLead = document.querySelector("#pageLead");

  const id = new URLSearchParams(location.search).get("id");
  const isEdit = !!id;

  // 編集モードなら既存データを読み込んでフォームに反映
  if (isEdit) {
    if (pageH1) pageH1.textContent = "編集";
    if (pageLead) pageLead.textContent = "内容を更新して保存できます。";

    try {
      const idea = await fetchIdea(id);
      titleEl.value = idea.product_name ?? "";
      if (subtitleEl) subtitleEl.value = idea.subtitle ?? ""; // ★追加
      descEl.value = idea.description ?? "";
      tagsEl.value = idea.category ?? "";
      if (statusEl) statusEl.value = idea.status ?? "draft"; // ★追加
    } catch (e) {
      console.error(e);
      alert("読み込みに失敗: " + e.message);
      location.href = "index.html";
      return;
    }
  } else {
    // 新規の初期値（statusがあれば）
    if (statusEl && !statusEl.value) statusEl.value = "draft";
  }

  saveBtn.addEventListener("click", async () => {
    const product_name = titleEl.value.trim();
    const subtitle = subtitleEl ? subtitleEl.value.trim() : ""; // ★追加
    const idea_text = descEl.value.trim();
    const tags = parseTagsInput(tagsEl.value);

    // status（selectがvalueを持ってる前提：draft/published）
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
        description: idea_text,          // ★ここ！
        category: tags || "",            // ★ここ！（文字列でOK）
        // status は今は送らない（サーバー/DBが未対応なら無視されるだけ）
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
      alert("ログインしてください: " + e.message);
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = oldText;
    }
  });
});
