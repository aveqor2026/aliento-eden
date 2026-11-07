/**
 * Cronómetro de un hábito. El tiempo sale de la hora real (Date.now()),
 * así sigue aunque se apague la pantalla o se recargue.
 */

const KEY = "aliento-af-timer";

export function minutesFromMs(ms) {
  const sec = Math.max(0, Number(ms) || 0) / 1000;
  if (sec < 30) return 0;
  return Math.max(1, Math.round(sec / 60));
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function emptyTimer(habitId) {
  return {
    habitId,
    mode: "libre",
    running: false,
    startedAt: null,
    accumulatedMs: 0,
    phase: "focus",
    focusMin: 25,
    breakMin: 5,
    blocks: 0,
  };
}

export function loadTimers() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw.timers !== "object" || !raw.timers) return { timers: {} };
    return { timers: raw.timers };
  } catch {
    return { timers: {} };
  }
}

export function saveTimers(data) {
  localStorage.setItem(KEY, JSON.stringify({ timers: data.timers || {} }));
}

export function getTimer(habitId) {
  return loadTimers().timers[habitId] || emptyTimer(habitId);
}

export function elapsedMs(state, now = Date.now()) {
  if (!state) return 0;
  const base = Math.max(0, Number(state.accumulatedMs) || 0);
  if (state.running && state.startedAt) return base + Math.max(0, now - Number(state.startedAt));
  return base;
}

export function displayMs(state, now = Date.now()) {
  if (!state || state.mode !== "pomodoro") return elapsedMs(state, now);
  const mins = state.phase === "break" ? state.breakMin : state.focusMin;
  const target = Math.max(1, Number(mins) || 1) * 60000;
  return Math.max(0, target - elapsedMs(state, now));
}

function clampMin(value, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(180, Math.max(1, n));
}

function writeTimer(habitId, timer) {
  const all = loadTimers();
  all.timers[habitId] = timer;
  saveTimers(all);
  return timer;
}

export function anyRunning() {
  return Object.values(loadTimers().timers).some((timer) => timer.running);
}

/**
 * Si un bloque de enfoque se cumplió mientras la pantalla estaba apagada,
 * lo convierte en minutos y pasa al descanso. El descanso, al terminar, deja
 * el siguiente bloque listo para reanudar.
 */
export function reconcile(timer, now = Date.now()) {
  const saved = [];
  if (!timer || !timer.running || timer.mode !== "pomodoro") {
    return { timer, saved, chime: false, changed: false };
  }
  let leftover = elapsedMs(timer, now);
  let chime = false;
  let changed = false;
  let guard = 0;
  while (guard++ < 48) {
    const mins = timer.phase === "break" ? timer.breakMin : timer.focusMin;
    const target = Math.max(1, Number(mins) || 1) * 60000;
    if (leftover < target) break;
    leftover -= target;
    changed = true;
    if (timer.phase === "focus") {
      const block = minutesFromMs(target);
      if (block > 0) saved.push(block);
      timer.blocks = (Number(timer.blocks) || 0) + 1;
      timer.phase = "break";
      chime = true;
    } else {
      timer.phase = "focus";
      timer.running = false;
      leftover = 0;
      chime = true;
      break;
    }
  }
  if (changed) {
    timer.accumulatedMs = leftover;
    timer.startedAt = timer.running ? now : null;
  }
  return { timer, saved, chime, changed };
}

export function startTimer(habitId) {
  const now = Date.now();
  const all = loadTimers();
  for (const [id, timer] of Object.entries(all.timers)) {
    if (id !== habitId && timer.running) {
      timer.accumulatedMs = elapsedMs(timer, now);
      timer.startedAt = null;
      timer.running = false;
    }
  }
  const timer = all.timers[habitId] || emptyTimer(habitId);
  if (timer.running) {
    saveTimers(all);
    holdWake();
    return timer;
  }
  timer.habitId = habitId;
  timer.running = true;
  timer.startedAt = now;
  all.timers[habitId] = timer;
  saveTimers(all);
  holdWake();
  return timer;
}

export function pauseTimer(habitId, now = Date.now()) {
  const timer = getTimer(habitId);
  if (timer.running) {
    timer.accumulatedMs = elapsedMs(timer, now);
    timer.startedAt = null;
    timer.running = false;
    writeTimer(habitId, timer);
  }
  if (!anyRunning()) releaseWake();
  return getTimer(habitId);
}

export function resetTimer(habitId) {
  const prev = getTimer(habitId);
  const timer = emptyTimer(habitId);
  timer.mode = prev.mode;
  timer.focusMin = prev.focusMin;
  timer.breakMin = prev.breakMin;
  writeTimer(habitId, timer);
  if (!anyRunning()) releaseWake();
  return timer;
}

export function setTimerMode(habitId, mode) {
  const timer = pauseTimer(habitId);
  timer.mode = mode === "pomodoro" ? "pomodoro" : "libre";
  timer.accumulatedMs = 0;
  timer.startedAt = null;
  timer.running = false;
  timer.phase = "focus";
  return writeTimer(habitId, timer);
}

export function setTimerPresets(habitId, focusMin, breakMin) {
  const timer = getTimer(habitId);
  if (focusMin != null) timer.focusMin = clampMin(focusMin, timer.focusMin || 25);
  if (breakMin != null) timer.breakMin = clampMin(breakMin, timer.breakMin || 5);
  return writeTimer(habitId, timer);
}

/** Minutos todavía no guardados. Reinicia el reloj y conserva el modo. */
export function takeMinutes(habitId, now = Date.now()) {
  const current = getTimer(habitId);
  const caught = reconcile({ ...current, blocks: current.blocks }, now);
  const timer = caught.timer;
  const leftover = timer.mode === "pomodoro" && timer.phase === "break"
    ? 0
    : minutesFromMs(elapsedMs(timer, now));
  const blocks = caught.saved.reduce((sum, n) => sum + n, 0);
  const minutes = blocks + leftover;
  const fresh = emptyTimer(habitId);
  fresh.mode = current.mode;
  fresh.focusMin = current.focusMin;
  fresh.breakMin = current.breakMin;
  fresh.blocks = timer.blocks || 0;
  writeTimer(habitId, fresh);
  if (!anyRunning()) releaseWake();
  return { minutes, chime: caught.chime };
}

let wake = null;

export function holdWake() {
  if (typeof navigator === "undefined" || !navigator.wakeLock || wake) return;
  navigator.wakeLock.request("screen").then((lock) => {
    wake = lock;
    lock.addEventListener?.("release", () => {
      wake = null;
    });
  }).catch(() => {
    wake = null;
  });
}

export function releaseWake() {
  if (!wake) return;
  wake.release?.().catch(() => {});
  wake = null;
}

export function chimeAndVibrate() {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([180, 80, 180]);
  } catch {
    /* sin vibración */
  }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 528;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.72);
    osc.onended = () => ctx.close?.();
  } catch {
    /* sin sonido */
  }
}

export function bootTimer(onMinutes) {
  if (typeof window === "undefined" || window.__alientoTimerBoot) return;
  window.__alientoTimerBoot = true;
  const tick = () => {
    const all = loadTimers();
    let changed = false;
    let chime = false;
    for (const [id, timer] of Object.entries(all.timers)) {
      const result = reconcile(timer, Date.now());
      if (!result.changed) continue;
      all.timers[id] = result.timer;
      changed = true;
      const total = result.saved.reduce((sum, n) => sum + n, 0);
      if (total > 0 && onMinutes) onMinutes(id, total);
      if (result.chime) chime = true;
    }
    if (changed) saveTimers(all);
    if (chime) chimeAndVibrate();
    if (anyRunning()) holdWake();
  };
  setInterval(tick, 400);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && anyRunning()) holdWake();
    tick();
  });
}
