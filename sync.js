/**
 * Sync de sesiones → webhook de Grok Bot (routine).
 * URL + Bearer se guardan solo en localStorage de este teléfono/iPad.
 * Nunca van al repo.
 */

const PENDING_KEY = "aliento-af-pending-sync";
const CONFIG_KEY = "aliento-af-sync-config";

export function fechaNY(ts = Date.now()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

export function getSyncConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { url: "", key: "" };
    const o = JSON.parse(raw);
    return {
      url: typeof o.url === "string" ? o.url.trim() : "",
      key: typeof o.key === "string" ? o.key.trim() : "",
    };
  } catch {
    return { url: "", key: "" };
  }
}

export function setSyncConfig({ url, key }) {
  const cfg = {
    url: (url || "").trim(),
    key: (key || "").trim(),
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  return cfg;
}

export function loadPending() {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePending(arr) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(arr.slice(0, 100)));
}

export function enqueueSession(payload) {
  const pending = loadPending();
  if (pending.some((p) => p.id === payload.id)) return pending;
  pending.push(payload);
  savePending(pending);
  return pending;
}

async function postOne(cfg, payload) {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.key}`,
    "X-Automation-Key": cfg.key,
  };
  const res = await fetch(cfg.url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  return { ok: res.status === 200 || res.status === 202, status: res.status };
}

/**
 * Intenta enviar todo lo pendiente.
 * @returns {{ sent: number, failed: number, configured: boolean, lastError?: string }}
 */
export async function flushPending() {
  const cfg = getSyncConfig();
  if (!cfg.url || !cfg.key) {
    return { sent: 0, failed: loadPending().length, configured: false };
  }
  const pending = loadPending();
  if (!pending.length) return { sent: 0, failed: 0, configured: true };

  const kept = [];
  let sent = 0;
  let lastError = "";
  for (const item of pending) {
    try {
      const r = await postOne(cfg, item);
      if (r.ok) sent += 1;
      else {
        kept.push(item);
        lastError = `HTTP ${r.status}`;
      }
    } catch (e) {
      kept.push(item);
      lastError = e?.message || "network";
    }
  }
  savePending(kept);
  return { sent, failed: kept.length, configured: true, lastError: lastError || undefined };
}

/**
 * Arma el payload de una sesión terminada y lo encola + flushea.
 * cantidad = rondas/ciclos completados (1 hold = 1 respiración).
 */
export async function reportSessionComplete({ rounds, mode, longestHold }) {
  const cantidad = Math.max(0, Math.floor(Number(rounds) || 0));
  if (cantidad <= 0) {
    return { skipped: true, reason: "cantidad-0", flush: await flushPending() };
  }
  const ts = Date.now();
  const payload = {
    source: "aliento",
    event: "session_complete",
    id: `aliento-${ts}-${Math.random().toString(36).slice(2, 9)}`,
    fecha: fechaNY(ts),
    habito: "respiraciones",
    cantidad,
    mode: mode || "ronda",
    longestHold: longestHold ?? null,
    ts,
  };
  enqueueSession(payload);
  const flush = await flushPending();
  return { skipped: false, payload, flush };
}

export async function testSync() {
  const cfg = getSyncConfig();
  if (!cfg.url || !cfg.key) {
    return { ok: false, error: "Falta URL o clave en Ajustes." };
  }
  const payload = {
    source: "aliento",
    event: "sync_test",
    id: `aliento-test-${Date.now()}`,
    fecha: fechaNY(),
    habito: "respiraciones",
    cantidad: 0,
    mode: "test",
    ts: Date.now(),
  };
  try {
    const r = await postOne(cfg, payload);
    return r.ok
      ? { ok: true, status: r.status }
      : { ok: false, error: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e?.message || "network" };
  }
}
