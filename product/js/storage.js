// js/storage.js（LocalStorage版）
const STORAGE_KEY = "ideashelf:ideas";

function nowIso() {
  return new Date().toISOString();
}

function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

export function loadIdeas() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const arr = safeParse(raw ?? "[]", []);
  return Array.isArray(arr) ? arr : [];
}

export function saveIdeas(ideas) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideas));
}

export function createIdea(data) {
  const ideas = loadIdeas();
  const id = `idea_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const idea = {
    id,
    title: data.title ?? "",
    description: data.description ?? "",
    tags: Array.isArray(data.tags) ? data.tags : [],
    status: data.status ?? "下書き",
    author: data.author ?? "you",
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  ideas.unshift(idea);
  saveIdeas(ideas);
  return idea;
}

export function updateIdeaById(id, patch) {
  const ideas = loadIdeas();
  const idx = ideas.findIndex((x) => x.id === id);
  if (idx === -1) return null;

  ideas[idx] = { ...ideas[idx], ...patch, updated_at: nowIso() };
  saveIdeas(ideas);
  return ideas[idx];
}

export function getIdeaById(id) {
  return loadIdeas().find((x) => x.id === id) ?? null;
}

export function deleteIdeaById(id) {
  const ideas = loadIdeas().filter((x) => x.id !== id);
  saveIdeas(ideas);
}
