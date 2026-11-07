/**
 * Datos locales de frases y sesiones, y la decisión de subir o bajar
 * la copia de la nube. No habla con Firebase.
 */

import { ADMIN_EMAIL } from "./firebase-config.js";

export const LIST_KEY = "aliento-af-list";
export const QUEUE_KEY = "aliento-af-queue";
export const STATE_KEY = "aliento-af-v1";
export const HABITS_KEY = "aliento-af-habits";
export const LOCAL_MS_KEY = "aliento-af-local-ms";
export const OWNER_KEY = "aliento-af-owner-uid";
export const ACCESS_KEY = "aliento-af-access";
const BACKUP_MARK = "aliento-af-legacy-backup";
const BACKUP_KEYS = [LIST_KEY, QUEUE_KEY, STATE_KEY, HABITS_KEY, LOCAL_MS_KEY];

let silent = false;

export function normalizeEmail(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (s.length > 120) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return "";
  return s;
}

export function isFirebaseConfigured(config) {
  if (!config || typeof config !== "object") return false;
  const apiKey = String(config.apiKey || "").trim();
  const authDomain = String(config.authDomain || "").trim();
  const projectId = String(config.projectId || "").trim();
  const appId = String(config.appId || "").trim();
  if (!apiKey || !authDomain || !projectId || !appId) return false;
  const placeholder = /pon_aqui|tu_api|your_api|xxx+|changeme/i;
  if (placeholder.test(apiKey) || placeholder.test(projectId)) return false;
  return true;
}

export function adminEmail() {
  return normalizeEmail(ADMIN_EMAIL);
}

export function markLocalEdit() {
  if (silent) return;
  try {
    localStorage.setItem(LOCAL_MS_KEY, String(Date.now()));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aliento-local"));
    }
  } catch {
    /* modo privado */
  }
}

export function getLocalMs() {
  const n = Number(localStorage.getItem(LOCAL_MS_KEY) || 0);
  return Number.isFinite(n) ? n : 0;
}

export function getOwnerUid() {
  return localStorage.getItem(OWNER_KEY) || "";
}

export function setOwnerUid(uid) {
  if (uid) localStorage.setItem(OWNER_KEY, uid);
}

export function rememberAccess(uid, isAdmin) {
  if (!uid) return;
  localStorage.setItem(ACCESS_KEY, `${uid}|${isAdmin ? "admin" : "member"}`);
}

export function cachedAccess(uid) {
  const raw = localStorage.getItem(ACCESS_KEY) || "";
  if (!uid || !raw.startsWith(`${uid}|`)) return null;
  return { ok: true, isAdmin: raw.endsWith("|admin") };
}

export function clearAccess() {
  localStorage.removeItem(ACCESS_KEY);
}

export function hasLocalCustom() {
  return (
    localStorage.getItem(LIST_KEY) != null ||
    localStorage.getItem(STATE_KEY) != null ||
    localStorage.getItem(HABITS_KEY) != null
  );
}

function emptyStats() {
  return {
    sessions: 0,
    rounds: 0,
    recordHold: null,
    totalHoldSeconds: 0,
    recordAt: null,
    recordRound: null,
  };
}

export function activityScore(state) {
  const a = state?.stats?.a;
  if (!a) return 0;
  return (Number(a.sessions) || 0) * 100000 + (Number(a.rounds) || 0) * 1000 + (Number(a.totalHoldSeconds) || 0);
}

export function isCloudBundleEmpty(data) {
  if (!data) return true;
  const habits = data.habits;
  const habitActivity =
    !!habits &&
    ((Array.isArray(habits.habits) && habits.habits.length > 0) ||
      (Array.isArray(habits.entries) && habits.entries.length > 0));
  return !data.phrasesCustom && activityScore(data.state) === 0 && !(data.state?.entries?.length > 0) && !habitActivity;
}

function cleanPhrases(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((s) => (typeof s === "string" ? s.trim().slice(0, 800) : ""))
    .filter((s) => s.length > 0)
    .slice(0, 400);
}

export function exportBundle(email) {
  let phrasesCustom = false;
  let phrases = [];
  const listRaw = localStorage.getItem(LIST_KEY);
  if (listRaw != null) {
    phrasesCustom = true;
    try {
      phrases = cleanPhrases(JSON.parse(listRaw));
    } catch {
      phrases = [];
    }
  }
  let queue = null;
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || "null");
    if (q && Array.isArray(q.order) && typeof q.nextIndex === "number") {
      queue = {
        order: q.order.filter((n) => Number.isInteger(n)).slice(0, 400),
        nextIndex: q.nextIndex,
      };
    }
  } catch {
    queue = null;
  }
  let state = null;
  try {
    const parsed = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    if (parsed && typeof parsed === "object") state = parsed;
  } catch {
    state = null;
  }
  let habits = { habits: [], entries: [], seedImported: false };
  try {
    const parsed = JSON.parse(localStorage.getItem(HABITS_KEY) || "null");
    if (parsed && typeof parsed === "object") habits = parsed;
  } catch {
    habits = { habits: [], entries: [], seedImported: false };
  }
  return {
    email: normalizeEmail(email),
    phrasesCustom,
    phrases,
    queue,
    state,
    habits,
  };
}

export function applyBundle(data, cloudMs) {
  silent = true;
  try {
    if (data?.phrasesCustom) {
      localStorage.setItem(LIST_KEY, JSON.stringify(cleanPhrases(data.phrases)));
    } else {
      localStorage.removeItem(LIST_KEY);
    }
    if (data?.queue && Array.isArray(data.queue.order)) {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify({
          order: data.queue.order,
          nextIndex: Number(data.queue.nextIndex) || 0,
        })
      );
    } else {
      localStorage.removeItem(QUEUE_KEY);
    }
    if (data?.state && typeof data.state === "object") {
      localStorage.setItem(STATE_KEY, JSON.stringify(data.state));
    } else {
      localStorage.removeItem(STATE_KEY);
    }
    if (data?.habits && typeof data.habits === "object") {
      localStorage.setItem(HABITS_KEY, JSON.stringify(data.habits));
    }
    if (cloudMs) localStorage.setItem(LOCAL_MS_KEY, String(cloudMs));
  } finally {
    silent = false;
  }
}

export function seedFreshState(displayName) {
  if (localStorage.getItem(STATE_KEY) != null) return;
  const name = String(displayName || "Yo").trim().slice(0, 24) || "Yo";
  const state = {
    people: [{ id: "a", name }],
    entries: [],
    stats: { a: emptyStats(), b: emptyStats() },
    breathsToday: { a: { day: "", count: 0 }, b: { day: "", count: 0 } },
  };
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function backupKey(key) {
  return `${BACKUP_MARK}:${key}`;
}

function stashLegacy() {
  if (localStorage.getItem(BACKUP_MARK) === "1") return false;
  let any = false;
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null) {
      localStorage.setItem(backupKey(key), value);
      any = true;
    }
    localStorage.removeItem(key);
  }
  if (any) localStorage.setItem(BACKUP_MARK, "1");
  return any;
}

function restoreLegacy() {
  if (localStorage.getItem(BACKUP_MARK) !== "1") return;
  if (localStorage.getItem(LIST_KEY) != null || localStorage.getItem(STATE_KEY) != null) return;
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(backupKey(key));
    if (value != null) localStorage.setItem(key, value);
  }
}

function clearLiveData() {
  for (const key of BACKUP_KEYS) localStorage.removeItem(key);
}

/**
 * El teléfono de Ismael conserva sus frases para subirlas a su cuenta.
 * Otra cuenta en ese navegador no se las lleva: quedan apartadas
 * hasta que vuelva a entrar el administrador.
 */
export function prepareLocalForUser(user) {
  const email = normalizeEmail(user?.email);
  const isAdmin = !!email && email === adminEmail();
  const owner = getOwnerUid();

  if (owner && owner !== user?.uid) {
    if (isAdmin) {
      clearLiveData();
      localStorage.removeItem(OWNER_KEY);
      restoreLegacy();
      return;
    }
    if (!stashLegacy()) clearLiveData();
    localStorage.removeItem(OWNER_KEY);
    return;
  }

  if (!owner && !isAdmin) stashLegacy();
  if (!owner && isAdmin) restoreLegacy();
}

export function decideHydration({ cloudExists, cloudMs, cloudEmpty, localCustom, localMs, sameOwner, localScore, cloudScore }) {
  if (!cloudExists) return "push";
  if (sameOwner) return localMs > cloudMs ? "push" : "pull";
  if (localCustom && (cloudEmpty || localScore >= cloudScore)) return "push";
  return "pull";
}

export function localActivityScore() {
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
    return activityScore(state);
  } catch {
    return 0;
  }
}
