import { getAfirmaciones, setAfirmaciones, resetAfirmacionesToDefaults, nextAfirmacion, restantesEnCiclo } from "./afirmaciones.js";
import { reportSessionComplete, flushPending, getSyncConfig, setSyncConfig, testSync, loadPending } from "./sync.js";
import { markLocalEdit } from "./account-data.js";
import { addDedicatedMinutes, logSessionBreaths, todayISO } from "./habitos.js";
import { bootTimer } from "./cronometro.js";
import { renderHabitScreen } from "./habitos-ui.js";
import { cheerPerson, cloudConfigured, listGroup } from "./cloud.js";
import {
  fetchAllowlist,
  grantEmail,
  revokeEmail,
  signInWithGoogle,
  signOutCloud,
  spanishAuthError,
  startCloud,
} from "./cloud.js";

const STORAGE = "aliento-af-v1";
const PACES = [
  { id: "despacio", label: "Despacio", hint: "Inhala 4, suelta 4", inhale: 4, exhale: 4 },
  { id: "mediano", label: "Mediano", hint: "Inhala 3, suelta 2", inhale: 3, exhale: 2 },
  { id: "rapido", label: "Rápido", hint: "Inhala 2, suelta 1", inhale: 2, exhale: 1 },
];
const MODES = [
  {
    id: "ronda",
    title: "Ronda",
    body: "Respiras al ritmo que elijas. Aguantas sin aire, exhalas 15 segundos y descansas 7.",
  },
  {
    id: "calma",
    title: "Calma",
    body: "Inhala 4, sostén 7, suelta 8. Más suave. Buena para bajar el ritmo antes de dormir.",
  },
  {
    id: "caja",
    title: "Caja",
    body: "Cuatro lados iguales. Para volver al centro cuando el día va rápido.",
  },
];
const EMPTY_STATS = {
  sessions: 0,
  rounds: 0,
  recordHold: null,
  totalHoldSeconds: 0,
  recordAt: null,
  recordRound: null,
};
const DEFAULT_STATE = {
  people: [
    { id: "a", name: "Ismael" },
  ],
  entries: [],
  stats: { a: { ...EMPTY_STATS }, b: { ...EMPTY_STATS } },
  breathsToday: { a: { day: "", count: 0 }, b: { day: "", count: 0 } },
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const t = JSON.parse(raw);
    if (!Array.isArray(t.people) || t.people.length < 1) return structuredClone(DEFAULT_STATE);
    return {
      people: [{
        id: "a",
        name:
          typeof t.people[0]?.name === "string" && t.people[0].name.trim()
            ? t.people[0].name.trim().slice(0, 24)
            : "Ismael",
      }],
      entries: Array.isArray(t.entries) ? t.entries : [],
      stats: {
        a: { ...EMPTY_STATS, ...(t.stats?.a || {}) },
        b: { ...EMPTY_STATS, ...(t.stats?.b || {}) },
      },
      breathsToday: {
        a: t.breathsToday?.a || { day: "", count: 0 },
        b: t.breathsToday?.b || { day: "", count: 0 },
      },
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState(s) {
  localStorage.setItem(STORAGE, JSON.stringify(s));
  markLocalEdit();
}

function lugarDatos() {
  return app.account?.configured ? "en tu cuenta" : "en este teléfono";
}

function fmtHold(sec) {
  const t = Math.max(0, Math.floor(sec));
  const m = Math.floor(t / 60);
  const r = t % 60;
  return m <= 0 ? `${r} s` : `${m}:${r.toString().padStart(2, "0")}`;
}

function fmtWhen(ts) {
  try {
    return new Date(ts).toLocaleString("es-GT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function modeLabel(m) {
  return m === "ronda" ? "Ronda" : m === "calma" ? "Calma" : "Caja";
}

function levelFor(kind, progress) {
  const n = Math.min(1, Math.max(0, progress));
  const r = n * n * (3 - 2 * n);
  if (kind === "inhale" || kind === "recover-in") return 0.16 + 0.84 * r;
  if (kind === "exhale" || kind === "release") return 0.16 + 0.84 * (1 - r);
  if (kind === "hold-full" || kind === "recover-hold") return 1;
  if (kind === "hold-empty") return 0.12;
  if (kind === "rest") return 0.4;
  if (kind === "done") return 0.55;
  return 0.42;
}

function buildPlan(plan) {
  if (plan.mode === "calma") {
    const t = [];
    for (let n = 1; n <= plan.calmaCycles; n++) {
      const meta = { breath: n, breathTotal: plan.calmaCycles, round: n, roundTotal: plan.calmaCycles };
      t.push(
        { kind: "inhale", label: "Inhala", hint: "Por la nariz, cuatro tiempos.", seconds: 4, ...meta },
        { kind: "hold-full", label: "Sostén", hint: "Quédate con el aire, sin tensión.", seconds: 7, ...meta },
        { kind: "exhale", label: "Suelta", hint: "Por la boca, lento, ocho tiempos.", seconds: 8, ...meta }
      );
    }
    t.push({ kind: "done", label: "Listo", hint: "Respira normal.", seconds: 0 });
    return t;
  }
  if (plan.mode === "caja") {
    const t = [];
    for (let n = 1; n <= plan.cajaCycles; n++) {
      const meta = { breath: n, breathTotal: plan.cajaCycles, round: n, roundTotal: plan.cajaCycles };
      t.push(
        { kind: "inhale", label: "Inhala", hint: "Cuatro tiempos.", seconds: 4, ...meta },
        { kind: "hold-full", label: "Sostén", hint: "Cuatro tiempos.", seconds: 4, ...meta },
        { kind: "exhale", label: "Suelta", hint: "Cuatro tiempos.", seconds: 4, ...meta },
        { kind: "hold-empty", label: "Espera", hint: "Pulmones vacíos, cuatro tiempos.", seconds: 4, ...meta }
      );
    }
    t.push({ kind: "done", label: "Listo", hint: "Respira normal.", seconds: 0 });
    return t;
  }
  return [];
}

function planSeconds(plan) {
  return buildPlan(plan).reduce((a, s) => a + (s.seconds || 0), 0);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// —— Audio (soft tone like original) ——
let audioCtx = null;
let osc = null;
let gain = null;

function ensureAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  osc = audioCtx.createOscillator();
  gain = audioCtx.createGain();
  osc.type = "sine";
  gain.gain.value = 1e-4;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
}

function setTone(kind, progress, soundOn) {
  if (!soundOn) {
    stopTone();
    return;
  }
  ensureAudio();
  if (!audioCtx || !osc || !gain) return;
  if (audioCtx.state === "suspended") audioCtx.resume();
  const n = Math.min(1, Math.max(0, progress));
  const i = n * n * (3 - 2 * n);
  let a = 1e-4;
  let o = 156;
  if (kind === "inhale" || kind === "recover-in") {
    a = 0.01 + i * 0.045;
    o = 148 + i * 32;
  } else if (kind === "exhale" || kind === "release") {
    a = 0.012 + (1 - i) * 0.04;
    o = 176 - i * 24;
  } else if (kind === "hold-full" || kind === "recover-hold") {
    a = 0.022;
    o = 164;
  } else if (kind === "hold-empty") {
    a = 0.006;
    o = 132;
  } else {
    a = 0.008;
    o = 150;
  }
  const t = audioCtx.currentTime;
  gain.gain.setTargetAtTime(a, t, 0.12);
  osc.frequency.setTargetAtTime(o, t, 0.15);
}

function stopTone() {
  if (!audioCtx || !gain) return;
  const t = audioCtx.currentTime;
  gain.gain.setTargetAtTime(1e-4, t, 0.08);
}

// —— App state ——
const app = {
  data: loadState(),
  personId: "a",
  plan: { mode: "ronda", pace: "mediano", recoverHold: 15, calmaCycles: 4, cajaCycles: 6 },
  screen: "home", // home | safety | session | done | settings
  soundOn: false,
  result: null,
  session: null, // runtime for active session
  account: { configured: false, email: "", name: "", isAdmin: false, error: "", reason: "" },
};

const root = document.getElementById("app");

function person() {
  return app.data.people.find((p) => p.id === app.personId) || app.data.people[0];
}

function otherPerson() {
  return app.data.people.find((p) => p.id !== app.personId) || app.data.people[1];
}

function stats() {
  return app.data.stats[app.personId] || { ...EMPTY_STATS };
}

function todayCount() {
  const bt = app.data.breathsToday[app.personId];
  const today = dayKey();
  if (!bt || bt.day !== today) return 0;
  return bt.count || 0;
}

function bumpToday(n = 1) {
  const today = dayKey();
  const bt = app.data.breathsToday[app.personId] || { day: "", count: 0 };
  if (bt.day !== today) {
    bt.day = today;
    bt.count = 0;
  }
  bt.count += n;
  app.data.breathsToday[app.personId] = bt;
}

function recordHold(seconds) {
  const s = { ...stats() };
  const beat = s.recordHold == null || seconds > s.recordHold;
  s.rounds += 1;
  s.totalHoldSeconds = (s.totalHoldSeconds || 0) + seconds;
  if (beat) {
    s.recordHold = seconds;
    s.recordAt = Date.now();
    s.recordRound = s.rounds;
  }
  app.data.stats[app.personId] = s;
  bumpToday(1);
  const entry = {
    id: `${Date.now()}-${s.rounds}`,
    personId: app.personId,
    mode: "ronda",
    at: Date.now(),
    rounds: 1,
    longestHold: seconds,
  };
  app.data.entries = [entry, ...app.data.entries].slice(0, 200);
  saveState(app.data);
  return { beat, seconds };
}

async function finishSession(result) {
  const s = { ...stats() };
  s.sessions += 1;
  if (result.mode !== "ronda") {
    s.rounds += result.rounds;
    const entry = {
      id: `${Date.now()}-s`,
      personId: app.personId,
      mode: result.mode,
      at: Date.now(),
      rounds: result.rounds,
      longestHold: result.longestHold,
    };
    app.data.entries = [entry, ...app.data.entries].slice(0, 200);
  }
  app.data.stats[app.personId] = s;
  saveState(app.data);
  stopSessionTimers();
  stopTone();

  const breathAdded = logSessionBreaths(result.rounds, `fin-${result.mode || "sesion"}-${Date.now()}`);

  let syncInfo = { status: "skip" };
  try {
    const r = await reportSessionComplete({
      rounds: result.rounds,
      mode: result.mode,
      longestHold: result.longestHold,
    });
    if (r.skipped) syncInfo = { status: "skip" };
    else if (!r.flush.configured) syncInfo = { status: "need_config", pending: r.flush.failed };
    else if (r.flush.failed === 0) syncInfo = { status: "ok", cantidad: r.payload.cantidad, fecha: r.payload.fecha };
    else syncInfo = { status: "queued", pending: r.flush.failed, error: r.flush.lastError };
  } catch (e) {
    syncInfo = { status: "queued", pending: loadPending().length, error: e?.message };
  }

  app.result = { ...result, sync: syncInfo, breathAdded };
  app.screen = "done";
  render();
}

// —— Session runtime ——
let rafId = null;
let sessionPaused = false;

function stopSessionTimers() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  sessionPaused = false;
}

function isHoldKind(kind) {
  return kind === "hold-empty" || kind === "hold-full" || kind === "recover-hold";
}

function startRondaSession() {
  const pace = PACES.find((p) => p.id === app.plan.pace) || PACES[1];
  app.session = {
    mode: "ronda",
    pace,
    phase: "inhale",
    round: 1,
    breath: 1,
    elapsed: 0,
    holdElapsed: 0,
    paused: false,
    holdSec: null,
    toast: null,
    afirmacion: null,
    bestHold: null,
    roundsDone: 0,
    beat: false,
    phases: {
      inhale: {
        label: "Inhala",
        hint: "Deja que el abdomen se abra. No fuerces.",
        seconds: pace.inhale,
        kind: "inhale",
      },
      exhale: {
        label: "Suelta",
        hint: "Relaja. El aire sale solo.",
        seconds: pace.exhale,
        kind: "exhale",
      },
      release: {
        label: "Suelta todo",
        hint: "Vacía los pulmones y quédate ahí.",
        seconds: 2.2,
        kind: "release",
      },
      "hold-empty": {
        label: "Pausa",
        hint: "Sin tope. Respiras cuando el cuerpo lo pida.",
        seconds: 0,
        open: true,
        kind: "hold-empty",
      },
      "deep-exhale": {
        label: "Exhala",
        hint: "Suelta profundo, quince segundos.",
        seconds: 15,
        kind: "release",
      },
      rest: {
        label: "Descansa",
        hint: "Siete segundos. Luego sigue solo.",
        seconds: 7,
        kind: "rest",
      },
    },
  };
  enterPhase("inhale");
  tickRonda();
}

function enterPhase(name, opts = {}) {
  const s = app.session;
  if (!s) return;
  s.phase = name;
  s.elapsed = 0;
  if (opts.round) s.round = opts.round;
  if (opts.breath) s.breath = opts.breath;
  if (name === "hold-empty" || name === "hold-full") {
    s.holdElapsed = 0;
    s.afirmacion = nextAfirmacion();
  } else if (!isHoldKind(name)) {
    s.afirmacion = null;
  }
  renderSession();
}

function advanceRonda(from) {
  const s = app.session;
  if (!s) return;
  if (from === "inhale") enterPhase("exhale");
  else if (from === "exhale") enterPhase("inhale", { breath: s.breath + 1 });
  else if (from === "release") enterPhase("hold-empty");
  else if (from === "deep-exhale") {
    const hold = s.holdSec;
    if (hold != null) {
      const rec = recordHold(hold);
      s.roundsDone += 1;
      s.bestHold = s.bestHold == null ? hold : Math.max(s.bestHold, hold);
      if (rec.beat) s.beat = true;
      s.toast = rec.beat ? `Nuevo récord. ${fmtHold(hold)}` : `Ronda ${s.round} guardada`;
      s.holdSec = null;
    }
    enterPhase("rest");
  } else if (from === "rest") {
    enterPhase("inhale", { round: s.round + 1, breath: 1 });
  }
}

function tickRonda() {
  const s = app.session;
  if (!s || app.screen !== "session") return;
  let last = performance.now();
  const loop = (now) => {
    if (!app.session || app.screen !== "session") return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!sessionPaused) {
      const ph = s.phases[s.phase];
      s.elapsed += dt;
      if (s.phase === "hold-empty") s.holdElapsed += dt;
      const progress = ph.open || ph.seconds <= 0 ? 1 : Math.min(1, s.elapsed / ph.seconds);
      setTone(ph.kind, progress, app.soundOn);
      if (!ph.open && ph.seconds > 0 && s.elapsed >= ph.seconds) {
        advanceRonda(s.phase);
      } else {
        updateSessionDom();
      }
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

function startTimedSession() {
  const steps = buildPlan(app.plan);
  app.session = {
    mode: app.plan.mode,
    steps,
    index: 0,
    elapsed: 0,
    afirmacion: null,
    toast: null,
  };
  enterTimedStep(0);
  tickTimed();
}

function enterTimedStep(i) {
  const s = app.session;
  if (!s) return;
  if (i >= s.steps.length) {
    finishSession({
      mode: s.mode,
      rounds: app.plan.mode === "calma" ? app.plan.calmaCycles : app.plan.cajaCycles,
      longestHold: null,
      recordBeat: false,
    });
    return;
  }
  s.index = i;
  s.elapsed = 0;
  const step = s.steps[i];
  if (isHoldKind(step.kind)) {
    s.afirmacion = nextAfirmacion();
  } else {
    s.afirmacion = null;
  }
  if (step.kind === "done") {
    finishSession({
      mode: s.mode,
      rounds: app.plan.mode === "calma" ? app.plan.calmaCycles : app.plan.cajaCycles,
      longestHold: null,
      recordBeat: false,
    });
    return;
  }
  renderSession();
}

function tickTimed() {
  const s = app.session;
  if (!s || app.screen !== "session") return;
  let last = performance.now();
  const loop = (now) => {
    if (!app.session || app.screen !== "session") return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!sessionPaused) {
      const step = s.steps[s.index];
      s.elapsed += dt;
      const progress = step.seconds <= 0 ? 1 : Math.min(1, s.elapsed / step.seconds);
      setTone(step.kind, progress, app.soundOn);
      if (step.seconds > 0 && s.elapsed >= step.seconds) {
        enterTimedStep(s.index + 1);
      } else {
        updateSessionDom();
      }
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

// —— Render ——
function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function icon(name) {
  const paths = {
    wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    square: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4" aria-hidden="true">${paths[name] || ""}</svg>`;
}

function render() {
  stopSessionTimers();
  updateTabbar();
  if (app.screen === "checking") return renderChecking();
  if (app.screen === "signin") return renderSignIn();
  if (app.screen === "denied") return renderDenied();
  if (app.screen === "access") return renderAccess();
  if (["habits", "habit", "habit-form", "reports", "stats", "group", "crono"].includes(app.screen)) {
    renderHabitScreen({
      root,
      app,
      el,
      escapeHtml,
      icon,
      render,
      lugarDatos,
      cloudOn: cloudConfigured(),
      listGroup,
      cheer: cheerPerson,
    });
  } else if (app.screen === "home") renderHome();
  else if (app.screen === "safety") renderSafety();
  else if (app.screen === "session") {
    if (app.plan.mode === "ronda") {
      startRondaSession();
      renderSession();
    } else {
      startTimedSession();
      renderSession();
    }
  } else if (app.screen === "done") renderDone();
  else if (app.screen === "settings") renderSettings();
}

function updateTabbar() {
  const nav = document.getElementById("tabbar");
  if (!nav) return;
  const hidden = new Set(["session", "safety", "checking", "signin", "denied", "crono"]);
  const show = !hidden.has(app.screen);
  nav.hidden = !show;
  document.body.classList.toggle("has-tabs", show);
  document.body.classList.toggle("session-dark", app.screen === "session");
  document.body.classList.toggle("timer-focus", app.screen === "crono");
  const tabs = [
    ["habits", "Hoy", "sun"],
    ["reports", "Informes", "grid"],
    ["group", "Grupo", "people"],
    ["home", "Respirar", "wind"],
    ["settings", "Ajustes", "sliders"],
  ];
  const active = ["stats", "habit", "habit-form"].includes(app.screen)
    ? "reports"
    : app.screen === "access"
      ? "settings"
      : app.screen;
  nav.innerHTML = tabs
    .map(
      ([id, label, glyph]) =>
        `<button type="button" class="${active === id ? "is-on" : ""}" data-tab="${id}">${icon(glyph)}<span>${label}</span></button>`
    )
    .join("");
  for (const button of nav.querySelectorAll("[data-tab]")) {
    button.onclick = () => {
      app.screen = button.dataset.tab;
      render();
    };
  }
}

function renderHome() {
  // Reintentar sync pendiente al abrir
  flushPending().catch(() => {});

  const st = stats();
  const p = person();
  const entries = app.data.entries.filter((e) => e.personId === app.personId).slice(0, 6);
  const hoy = app.data.entries
    .filter((e) => e.personId === app.personId && e.mode === "ronda" && dayKey(new Date(e.at)) === dayKey())
    .reduce((a, e) => a + e.rounds, 0);

  root.innerHTML = "";
  const main = el(`<main class="app-shell mx-auto w-full max-w-3xl"></main>`);
  const grid = el(`<div class="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start"></div>`);
  const left = el(`<div class="flex flex-col gap-6"></div>`);

  left.appendChild(
    el(`<header class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-3">
        <p class="flex items-center gap-2 text-sm font-medium tracking-wide text-sage uppercase">${icon("wind")}Tu práctica</p>
        <div class="flex items-center gap-3">
          ${app.account?.isAdmin ? `<button type="button" id="btn-access" class="text-sm font-medium text-sage">Personas</button>` : ""}
          <button type="button" id="btn-settings" class="text-sm font-medium text-sage">Afirmaciones</button>
        </div>
      </div>
      <h1 class="display text-5xl leading-none text-fg">Aliento</h1>
      <p class="max-w-md text-muted">${app.account?.configured ? "Tu práctica en tu cuenta." : "Tu práctica en este teléfono."} En la pausa aparece una afirmación, solo en texto. Puedes cambiarlas cuando quieras.</p>
      ${accountBar()}
    </header>`)
  );
  const habitsBtn = el(
    `<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Hábitos</button>`
  );
  habitsBtn.onclick = () => {
    app.screen = "habits";
    render();
  };
  left.appendChild(habitsBtn);

  // Mode cards
  const modes = el(`<section class="flex flex-col gap-3" aria-label="Modo"></section>`);
  for (const m of MODES) {
    const selected = app.plan.mode === m.id;
    const card = el(`<div class="card flex flex-col gap-2 p-5 text-left ${selected ? "card-selected" : ""}" data-mode="${m.id}">
      <button type="button" class="text-left mode-pick">
        <span class="display text-2xl">${m.title}</span>
        <p class="mt-1 text-sm text-muted">${m.body}</p>
      </button>
      <div class="mode-extra"></div>
    </div>`);
    card.querySelector(".mode-pick").onclick = () => {
      app.plan.mode = m.id;
      render();
    };
    const extra = card.querySelector(".mode-extra");
    if (selected && m.id === "ronda") {
      const paces = el(`<div class="mt-4 grid grid-cols-3 gap-2"></div>`);
      for (const pace of PACES) {
        const on = app.plan.pace === pace.id;
        const b = el(`<button type="button" class="rounded-xl border px-2 py-2 text-left ${on ? "border-gold bg-gold/10" : "border-line"}">
          <span class="block text-sm font-medium">${pace.label}</span>
          <span class="block text-xs text-muted">${pace.hint}</span>
        </button>`);
        b.onclick = (e) => {
          e.stopPropagation();
          app.plan.pace = pace.id;
          render();
        };
        paces.appendChild(b);
      }
      extra.appendChild(paces);
    }
    if (selected && m.id === "calma") {
      extra.appendChild(stepper("Ciclos", app.plan.calmaCycles, (d) => {
        app.plan.calmaCycles = clamp(app.plan.calmaCycles + d, 2, 8);
        render();
      }));
    }
    if (selected && m.id === "caja") {
      extra.appendChild(stepper("Ciclos", app.plan.cajaCycles, (d) => {
        app.plan.cajaCycles = clamp(app.plan.cajaCycles + d, 2, 12);
        render();
      }));
    }
    modes.appendChild(card);
  }
  left.appendChild(modes);

  const startLabel =
    app.plan.mode === "ronda"
      ? "Empezar ronda"
      : `Empezar ${modeLabel(app.plan.mode).toLowerCase()} · ${fmtHold(planSeconds(app.plan))}`;
  const startBtn = el(
    `<button type="button" class="h-14 w-full rounded-full bg-gold font-semibold text-bg">${startLabel}</button>`
  );
  startBtn.onclick = () => {
    if (app.plan.mode === "ronda") {
      app.screen = "safety";
    } else {
      app.screen = "session";
    }
    render();
  };
  left.appendChild(startBtn);
  left.appendChild(
    el(`<details class="rounded-2xl border border-line p-4">
      <summary class="cursor-pointer font-medium text-gold">Cómo funciona cada modo</summary>
      <div class="mt-3 grid gap-3 text-sm text-muted">
        <div>
          <p class="font-semibold">Ronda</p>
          <p>Ritmos: Despacio (inhala 4 y suelta 4 segundos), Mediano (inhala 3 y suelta 2) y Rápido (inhala 2 y suelta 1).</p>
          <p>Respiras al ritmo elegido todas las veces que quieras, hasta que tocas para soltar.</p>
          <p>"Suelta todo" dura 2.2 segundos para vaciar los pulmones.</p>
          <p>La pausa sin aire no tiene tope. Aquí salen tus frases, y tocas cuando el cuerpo pida aire.</p>
          <p>Luego exhalas profundo 15 segundos y descansas 7, y empieza la siguiente ronda.</p>
          <p>Se guarda tu récord de pausa y cada ronda cuenta como una respiración en tu registro.</p>
        </div>
        <div>
          <p class="font-semibold">Calma</p>
          <p>Inhala 4, sostén 7 y suelta 8. Son 4 ciclos por defecto y puedes elegir de 2 a 8.</p>
        </div>
        <div>
          <p class="font-semibold">Caja</p>
          <p>Inhala 4, sostén 4, suelta 4 y espera 4 con los pulmones vacíos. Son 6 ciclos por defecto y puedes elegir de 2 a 12.</p>
        </div>
      </div>
    </details>`)
  );
  const afCount = getAfirmaciones().length;
  const afLine =
    afCount === 0
      ? "No hay afirmaciones guardadas. En la pausa solo verás el tiempo. Puedes añadir frases en Afirmaciones."
      : `Afirmaciones: ${afCount} en ciclo · quedan ${restantesEnCiclo()}.`;
  left.appendChild(
    el(
      `<p class="text-sm text-muted">Práctica de bienestar, no es consejo médico. Si te mareas, paras y respiras normal. ${afLine}</p>`
    )
  );

  // settings button (in header)
  queueMicrotask(() => {
    const b = document.getElementById("btn-settings");
    if (b) b.onclick = () => { app.screen = "settings"; render(); };
    const access = document.getElementById("btn-access");
    if (access) access.onclick = () => { app.screen = "access"; render(); };
    const out = document.getElementById("btn-signout");
    if (out) out.onclick = () => { signOutCloud().catch(() => {}); };
  });

  // Right column — stats
  const right = el(`<aside class="flex flex-col gap-6"></aside>`);
  right.appendChild(
    el(`<div>
      <p class="text-xs tracking-wide text-muted uppercase">${escapeHtml(p.name)}</p>
      <p class="text-sm text-muted mt-1">Récord</p>
      <div class="grid grid-cols-2 gap-4 mt-2">
        <div>
          <p class="text-xs text-muted">Aguantado</p>
          <p class="display text-5xl leading-none">${st.recordHold == null ? "—" : fmtHold(st.recordHold)}</p>
          ${
            st.recordHold != null && st.recordAt != null
              ? `<p class="text-xs text-muted">${fmtWhen(st.recordAt)}${st.recordRound != null ? ` · ronda ${st.recordRound}` : ""}</p>`
              : ""
          }
        </div>
        <div>
          <p class="text-xs text-muted">Total pausas</p>
          <p class="display text-5xl leading-none">${fmtHold(st.totalHoldSeconds || 0)}</p>
        </div>
      </div>
      <p class="text-sm text-muted mt-3">${st.rounds} ${st.rounds === 1 ? "ronda" : "rondas"} · ${st.sessions} ${st.sessions === 1 ? "sesión" : "sesiones"}${hoy > 0 ? ` · hoy ${hoy}` : ""}</p>
      ${
        st.recordHold == null
          ? `<p class="text-sm text-muted">La primera pausa queda aquí, en grande.</p>`
          : `<p class="text-xs text-muted">Para superarlo, hazlo a la misma hora y pasa esa ronda.</p>`
      }
    </div>`)
  );

  const hist = el(`<div><h2 class="display text-2xl">Historial</h2></div>`);
  if (entries.length === 0) {
    hist.appendChild(
      el(
        `<p class="text-muted mt-2">Todavía no hay sesiones de ${escapeHtml(p.name)}. La primera queda guardada aquí.</p>`
      )
    );
  } else {
    const ul = el(`<ul class="mt-3 flex flex-col"></ul>`);
    for (const e of entries) {
      ul.appendChild(
        el(`<li class="flex items-baseline justify-between gap-3 border-b border-line py-3 last:border-0">
          <div>
            <p class="font-medium">${modeLabel(e.mode)}</p>
            <p class="text-sm text-muted">${e.rounds} ${e.mode === "ronda" ? (e.rounds === 1 ? "ronda" : "rondas") : "ciclos"}${e.longestHold == null ? "" : ` · pausa ${fmtHold(e.longestHold)}`}</p>
          </div>
          <span class="text-sm text-muted">${fmtWhen(e.at)}</span>
        </li>`)
      );
    }
    hist.appendChild(ul);
  }
  right.appendChild(hist);

  grid.appendChild(left);
  grid.appendChild(right);
  main.appendChild(grid);
  root.appendChild(main);
}

function stepper(label, value, onDelta) {
  const wrap = el(`<div class="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-line px-2 py-2">
    <span class="pl-4 text-sm text-muted">${label}</span>
    <div class="flex items-center gap-2">
      <button type="button" class="grid size-11 place-items-center rounded-full border border-line dec">${icon("minus")}</button>
      <span class="display w-8 text-center text-2xl val">${value}</span>
      <button type="button" class="grid size-11 place-items-center rounded-full border border-line inc">${icon("plus")}</button>
    </div>
  </div>`);
  wrap.querySelector(".dec").onclick = (e) => {
    e.stopPropagation();
    onDelta(-1);
  };
  wrap.querySelector(".inc").onclick = (e) => {
    e.stopPropagation();
    onDelta(1);
  };
  return wrap;
}

function renderSafety() {
  root.innerHTML = "";
  const main = el(`<main class="app-shell mx-auto w-full max-w-lg"></main>`);
  const box = el(`<div class="mx-auto flex max-w-lg flex-col gap-6"></div>`);
  box.appendChild(
    el(`<header class="flex flex-col gap-2">
      <p class="text-sm font-medium text-sage">${escapeHtml(person().name)}</p>
      <h1 class="display text-4xl leading-none">Antes de la ronda</h1>
      <p class="text-muted">Esta práctica es intensa. Léelo una vez y confirma.</p>
    </header>`)
  );
  const items = [
    "Siéntate o acuéstate. Nunca de pie.",
    "No lo hagas manejando, en la bañera ni dentro del agua.",
    "Si te mareas, para de inmediato y respira normal.",
    "La pausa no tiene tope. Respiras cuando el cuerpo lo pida.",
  ];
  const ul = el(`<ul class="card flex flex-col gap-4 p-5"></ul>`);
  for (const t of items) {
    ul.appendChild(
      el(`<li class="flex gap-3">
        <span class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gold text-bg">${icon("check")}</span>
        <span>${t}</span>
      </li>`)
    );
  }
  box.appendChild(ul);
  const label = el(`<label class="flex items-start gap-3 text-sm">
    <input type="checkbox" class="mt-1 size-5 accent-gold confirm"/>
    Estoy sentado o acostado, y puedo parar si lo necesito.
  </label>`);
  box.appendChild(label);
  const actions = el(`<div class="flex flex-col gap-3 sm:flex-row"></div>`);
  const back = el(`<button type="button" class="h-12 flex-1 rounded-full border border-line px-5 font-medium">Volver</button>`);
  const go = el(
    `<button type="button" class="h-12 flex-1 rounded-full bg-gold px-5 font-semibold text-bg disabled:opacity-40" disabled>Entendido, empezar</button>`
  );
  back.onclick = () => {
    app.screen = "home";
    render();
  };
  label.querySelector(".confirm").onchange = (e) => {
    go.disabled = !e.target.checked;
  };
  go.onclick = () => {
    if (go.disabled) return;
    app.screen = "session";
    render();
  };
  actions.appendChild(back);
  actions.appendChild(go);
  box.appendChild(actions);
  main.appendChild(box);
  root.appendChild(main);
}

function renderSession() {
  root.innerHTML = "";
  const main = el(`<main class="app-shell mx-auto w-full max-w-lg"></main>`);
  const wrap = el(
    `<div class="mx-auto flex min-h-[80dvh] max-w-lg flex-col items-center gap-6" id="session-root"></div>`
  );
  main.appendChild(wrap);
  root.appendChild(main);
  updateSessionDom();
}

function sessionView() {
  const s = app.session;
  if (!s) return null;
  let label, hint, kind, seconds, open, progress, roundLine, showHoldBtn, showBreatheBtn, showContinueBtn, timerText;

  if (s.mode === "ronda") {
    const ph = s.phases[s.phase];
    label = ph.label;
    hint = ph.hint;
    kind = ph.kind;
    seconds = ph.seconds;
    open = !!ph.open;
    progress = open || seconds <= 0 ? 1 : Math.min(1, s.elapsed / seconds);
    roundLine = `Ronda · ${s.round} · ${s.pace.label}`;
    showHoldBtn = s.phase === "inhale" || s.phase === "exhale";
    showBreatheBtn = s.phase === "hold-empty";
    showContinueBtn = s.phase === "rest";
    timerText =
      s.phase === "hold-empty"
        ? fmtHold(Math.floor(s.holdElapsed))
        : String(Math.max(0, Math.ceil(seconds - s.elapsed)));
  } else {
    const step = s.steps[s.index];
    if (!step) return null;
    label = step.label;
    hint = step.hint;
    kind = step.kind;
    seconds = step.seconds;
    open = false;
    progress = seconds <= 0 ? 1 : Math.min(1, s.elapsed / seconds);
    roundLine = `${modeLabel(s.mode)} · ${step.round || ""} · ${step.breath || ""}/${step.breathTotal || ""}`;
    showHoldBtn = false;
    showBreatheBtn = false;
    showContinueBtn = false;
    timerText = String(Math.max(0, Math.ceil(seconds - s.elapsed)));
  }

  const level = levelFor(kind, progress);
  const inHold = isHoldKind(kind) && !!s.afirmacion;
  const holdingEmpty = kind === "hold-empty" && s.mode === "ronda";
  const key = [
    s.mode,
    s.mode === "ronda" ? s.phase : String(s.index),
    inHold ? "1" : "0",
    s.afirmacion || "",
    roundLine,
    showHoldBtn ? "1" : "0",
    showBreatheBtn ? "1" : "0",
    showContinueBtn ? "1" : "0",
    sessionPaused ? "1" : "0",
    app.soundOn ? "1" : "0",
    s.toast || "",
    person().name,
    label,
    hint,
  ].join("\u0001");

  const html = `
    <header class="flex w-full items-center justify-between gap-3">
      <div class="text-left">
        <p class="text-sm font-medium text-sage">${escapeHtml(person().name)}</p>
        <p class="font-medium">${escapeHtml(roundLine)}</p>
      </div>
      <button type="button" class="grid size-11 place-items-center rounded-full border border-line" id="btn-sound" aria-label="Sonido">
        ${app.soundOn ? icon("volume") : icon("mute")}
      </button>
    </header>

    ${
      inHold
        ? `<div class="afirmacion-panel card flex flex-1 flex-col items-center justify-center gap-6 p-5 text-center w-full">
            <p class="hold-kicker text-xs tracking-wide uppercase">${holdingEmpty ? "Aguanta · afirma" : escapeHtml(label)}</p>
            <p class="afirmacion-texto display text-balance" aria-live="polite">${escapeHtml(s.afirmacion)}</p>
            <p class="hold-timer display text-4xl leading-none tabular-nums" data-timer>${escapeHtml(timerText)}</p>
          </div>`
        : `<div class="flex flex-1 flex-col items-center justify-center gap-6 w-full">
            <div class="breath" data-phase="${kind}" style="--level:${level}">
              <div class="breath-fill"></div>
            </div>
            <div class="flex flex-col items-center gap-1 text-center">
              <p class="display text-4xl leading-none">${escapeHtml(label)}</p>
              <p class="text-muted">${escapeHtml(hint)}</p>
              <p class="display text-5xl leading-none tabular-nums mt-2" data-timer>${escapeHtml(timerText)}</p>
            </div>
          </div>`
    }

    <div class="flex w-full flex-col gap-3">
      ${showHoldBtn ? `<button type="button" class="h-14 rounded-full bg-gold font-semibold text-bg" id="btn-hold">Aguantar sin aire</button>` : ""}
      ${showBreatheBtn ? `<button type="button" class="h-14 rounded-full bg-sage font-semibold text-bg" id="btn-breathe">Ya respiro</button>` : ""}
      ${showContinueBtn ? `<button type="button" class="h-14 rounded-full bg-gold font-semibold text-bg" id="btn-continue">Ya sigo</button>` : ""}
      ${s.toast ? `<p class="text-center text-sage">${escapeHtml(s.toast)}</p>` : ""}
      <div class="grid grid-cols-2 gap-3">
        <button type="button" class="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line" id="btn-pause">
          ${sessionPaused ? icon("play") : icon("pause")}${sessionPaused ? "Seguir" : "Pausa"}
        </button>
        <button type="button" class="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line" id="btn-stop">
          ${icon("square")}Terminar
        </button>
      </div>
    </div>
  `;

  return { key, html, timerText, level };
}

function bindSessionControls(wrap) {
  wrap.querySelector("#btn-sound").onclick = () => {
    app.soundOn = !app.soundOn;
    if (app.soundOn) ensureAudio();
    else stopTone();
    updateSessionDom();
  };
  wrap.querySelector("#btn-pause").onclick = () => {
    sessionPaused = !sessionPaused;
    if (sessionPaused) stopTone();
    updateSessionDom();
  };
  wrap.querySelector("#btn-stop").onclick = () => {
    if (!app.session) return;
    const cur = app.session;
    if (cur.mode === "ronda" && cur.phase === "hold-empty" && cur.holdElapsed >= 1) {
      cur.holdSec = Math.max(1, Math.round(cur.holdElapsed));
      recordHold(cur.holdSec);
      cur.roundsDone += 1;
      cur.bestHold = cur.bestHold == null ? cur.holdSec : Math.max(cur.bestHold, cur.holdSec);
    }
    stopTone();
    if (cur.mode === "ronda") {
      if (cur.roundsDone > 0) {
        finishSession({
          mode: "ronda",
          rounds: cur.roundsDone,
          longestHold: cur.bestHold,
          recordBeat: cur.beat,
        });
      } else {
        app.screen = "home";
        app.session = null;
        stopSessionTimers();
        render();
      }
    } else {
      finishSession({
        mode: cur.mode,
        rounds: Math.max(1, (cur.steps[cur.index]?.round || 1) - (cur.steps[cur.index]?.kind === "done" ? 0 : 0)),
        longestHold: null,
        recordBeat: false,
      });
    }
  };

  const holdBtn = wrap.querySelector("#btn-hold");
  if (holdBtn) holdBtn.onclick = () => enterPhase("release");
  const breatheBtn = wrap.querySelector("#btn-breathe");
  if (breatheBtn) {
    breatheBtn.onclick = () => {
      if (!app.session) return;
      app.session.holdSec = Math.max(1, Math.round(app.session.holdElapsed));
      enterPhase("deep-exhale");
    };
  }
  const contBtn = wrap.querySelector("#btn-continue");
  if (contBtn) {
    contBtn.onclick = () => {
      if (!app.session) return;
      enterPhase("inhale", { round: app.session.round + 1, breath: 1 });
    };
  }
}

function updateSessionDom() {
  const wrap = document.getElementById("session-root");
  if (!wrap || !app.session) return;
  const view = sessionView();
  if (!view) return;
  if (wrap._viewKey !== view.key) {
    wrap._viewKey = view.key;
    wrap.innerHTML = view.html;
    bindSessionControls(wrap);
  }
  const timer = wrap.querySelector("[data-timer]");
  if (timer && timer.textContent !== view.timerText) timer.textContent = view.timerText;
  const breath = wrap.querySelector(".breath");
  if (breath) breath.style.setProperty("--level", String(view.level));
}

function renderDone() {
  const r = app.result || { rounds: 0, mode: "ronda" };
  root.innerHTML = "";
  const main = el(`<main class="app-shell mx-auto w-full max-w-lg"></main>`);
  const box = el(`<div class="mx-auto flex max-w-lg flex-col items-center gap-6 text-center"></div>`);
  const sync = r.sync || {};
  let syncLine = "";
  if (sync.status === "ok") {
    syncLine = `<p class="text-sage">Hábitos: +${sync.cantidad} respiración${sync.cantidad === 1 ? "" : "es"} (${sync.fecha}).</p>`;
  } else if (sync.status === "need_config") {
    syncLine = `<p class="text-muted">Hábitos: falta conectar el sync en Afirmaciones (URL + clave). Quedó en cola (${sync.pending || 0}).</p>`;
  } else if (sync.status === "queued") {
    syncLine = `<p class="text-muted">Hábitos: en cola para reintentar${sync.error ? ` (${escapeHtml(sync.error)})` : ""}. Pendientes: ${sync.pending || 0}.</p>`;
  }

  box.appendChild(
    el(`<div class="flex flex-col gap-2">
      <h1 class="display text-4xl">Listo, ${escapeHtml(person().name)}</h1>
      <p class="text-muted">${r.rounds} ${r.mode === "ronda" ? (r.rounds === 1 ? "ronda" : "rondas") : "ciclos"} en esta sesión${r.longestHold == null ? "" : ` · pausa ${fmtHold(r.longestHold)}`}</p>
      ${r.recordBeat ? `<p class="text-sage">Nuevo récord.</p>` : ""}
      <p class="text-sm text-muted">Quedó guardado ${lugarDatos()}.</p>
      ${r.breathAdded ? `<p class="text-sage">Anoté ${r.breathAdded} en el hábito Respiraciones.</p>` : ""}
      ${syncLine}
    </div>`)
  );
  const actions = el(`<div class="flex w-full flex-col gap-3"></div>`);
  const again = el(
    `<button type="button" class="h-14 w-full rounded-full bg-gold font-semibold text-bg">Otra vez</button>`
  );
  const home = el(
    `<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Inicio</button>`
  );
  again.onclick = () => {
    app.result = null;
    app.screen = app.plan.mode === "ronda" ? "safety" : "session";
    render();
  };
  home.onclick = () => {
    app.result = null;
    app.screen = "home";
    render();
  };
  actions.appendChild(again);
  actions.appendChild(home);
  box.appendChild(actions);
  main.appendChild(box);
  root.appendChild(main);
}


function renderSettings() {
  const cfg = getSyncConfig();
  const pending = loadPending().length;

  root.innerHTML = "";
  const main = el(`<main class="app-shell mx-auto w-full max-w-lg"></main>`);
  const box = el(`<div class="mx-auto flex max-w-lg flex-col gap-6"></div>`);
  box.appendChild(
    el(`<header class="flex flex-col gap-2">
      <p class="text-sm font-medium text-sage">Ajustes</p>
      <h1 class="display text-4xl leading-none">Afirmaciones</h1>
      <p class="text-muted">Estas frases salen de una en una en la pausa, solo en texto. Se guardan solas ${lugarDatos()}${app.account?.configured ? " y aparecen al entrar en otro aparato" : " y siguen aquí al recargar"}. Añade, cambia o quita las que quieras. No hay límite.</p>
    </header>`)
  );

  const addBar = el(`<div class="af-add-bar"></div>`);
  const addBtn = el(
    `<button type="button" id="af-add" class="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-gold font-semibold text-bg">${icon("plus")}Añadir frase</button>`
  );
  addBar.appendChild(addBtn);
  box.appendChild(addBar);

  const status = el(`<p class="text-sm text-muted" id="af-status">Se guardan solas ${lugarDatos()}.</p>`);
  box.appendChild(status);

  const empty = el(
    `<p class="text-muted" id="af-empty">No hay frases. La pausa sigue igual: solo verás el tiempo hasta que añadas una.</p>`
  );
  box.appendChild(empty);

  const form = el(`<div class="flex flex-col gap-3" id="af-form"></div>`);
  box.appendChild(form);

  function renumber() {
    const cards = [...form.querySelectorAll(".af-card")];
    cards.forEach((card, i) => {
      const n = i + 1;
      card.querySelector(".af-label").textContent = `Frase ${n}`;
      card.querySelector(".af-remove").setAttribute("aria-label", `Quitar frase ${n}`);
    });
    empty.hidden = cards.length > 0;
  }

  function persistFromDom() {
    const next = [...form.querySelectorAll(".af-input")].map((node) => node.value);
    try {
      const saved = setAfirmaciones(next);
      if (saved.length === 0) {
        status.textContent = `Lista vacía, guardada ${lugarDatos()}. En la pausa no saldrá ninguna frase.`;
      } else {
        status.textContent = `Guardadas ${saved.length} ${saved.length === 1 ? "frase" : "frases"} ${lugarDatos()}.`;
      }
      status.className = "text-sm text-sage";
    } catch {
      status.textContent = "No se pudo guardar. Revisa el espacio del teléfono.";
      status.className = "text-sm text-muted";
    }
    renumber();
  }

  function addRow(text, focus) {
    const card = el(`<div class="af-card card flex flex-col gap-2 p-4">
      <div class="flex items-center justify-between gap-3">
        <span class="af-label text-xs tracking-wide text-muted uppercase">Frase</span>
        <button type="button" class="af-remove inline-flex items-center justify-center rounded-full border border-line text-sm font-medium">Quitar</button>
      </div>
      <textarea class="af-input display text-base text-fg outline-none leading-snug" rows="3" placeholder="Escribe la afirmación" autocapitalize="sentences" autocomplete="off" spellcheck="true" enterkeyhint="done"></textarea>
    </div>`);
    const ta = card.querySelector(".af-input");
    ta.value = text;
    const saveSoon = () => persistFromDom();
    ta.addEventListener("input", saveSoon);
    ta.addEventListener("change", saveSoon);
    ta.addEventListener("blur", saveSoon);
    card.querySelector(".af-remove").onclick = () => {
      card.remove();
      persistFromDom();
    };
    form.appendChild(card);
    renumber();
    if (focus) {
      ta.focus();
      card.scrollIntoView({ block: "center" });
    }
    return card;
  }

  for (const text of getAfirmaciones()) addRow(text, false);
  renumber();

  addBtn.onclick = () => addRow("", true);

  const reset = el(
    `<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Volver a las frases de inicio</button>`
  );
  reset.onclick = () => {
    if (!confirm("¿Volver a las frases de inicio? Las que guardaste se reemplazan.")) return;
    const d = resetAfirmacionesToDefaults();
    form.replaceChildren();
    for (const text of d) addRow(text, false);
    renumber();
    status.textContent = "Volviste a las frases de inicio.";
    status.className = "text-sm text-sage";
  };
  box.appendChild(reset);

  // —— Sync hábitos ——
  box.appendChild(
    el(`<header class="flex flex-col gap-2 mt-4">
      <h2 class="display text-2xl">Hábitos (sync)</h2>
      <p class="text-sm text-muted">Al terminar una sesión se envía el conteo a tu coach (EDÉN / hábitos). Pega aquí el <strong>POST to</strong> y la <strong>key</strong> de la routine webhook (solo en este teléfono o iPad; no se sube al repo). Pendientes: ${pending}.</p>
    </header>`)
  );
  const syncForm = el(`<div class="card flex flex-col gap-3 p-4">
    <label class="flex flex-col gap-1">
      <span class="text-xs tracking-wide text-muted uppercase">POST to (URL)</span>
      <input id="sync-url" type="url" autocomplete="off" spellcheck="false" class="rounded-xl border border-line bg-transparent px-3 py-3 text-sm text-fg outline-none" placeholder="https://api2.cursor.sh/automations/webhook/…" value="${escapeHtml(cfg.url)}"/>
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-xs tracking-wide text-muted uppercase">Sender key</span>
      <input id="sync-key" type="password" autocomplete="off" spellcheck="false" class="rounded-xl border border-line bg-transparent px-3 py-3 text-sm text-fg outline-none" placeholder="pega la key" value="${escapeHtml(cfg.key)}"/>
    </label>
    <p class="text-xs text-muted" id="sync-status"></p>
  </div>`);
  box.appendChild(syncForm);
  const syncStatus = syncForm.querySelector("#sync-status");
  const syncActions = el(`<div class="flex flex-col gap-3"></div>`);
  const saveSync = el(`<button type="button" class="h-12 w-full rounded-full bg-sage font-semibold text-bg">Guardar sync</button>`);
  const testBtn = el(`<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Probar sync</button>`);
  const flushBtn = el(`<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Reenviar pendientes</button>`);
  saveSync.onclick = () => {
    setSyncConfig({
      url: syncForm.querySelector("#sync-url").value,
      key: syncForm.querySelector("#sync-key").value,
    });
    syncStatus.textContent = "Sync guardado en este dispositivo.";
    syncStatus.className = "text-xs text-sage";
  };
  testBtn.onclick = async () => {
    syncStatus.textContent = "Probando…";
    const r = await testSync();
    syncStatus.textContent = r.ok ? `OK (HTTP ${r.status}). Revisa el chat del bot.` : `Falló: ${r.error}`;
    syncStatus.className = r.ok ? "text-xs text-sage" : "text-xs text-muted";
  };
  flushBtn.onclick = async () => {
    syncStatus.textContent = "Reenviando…";
    const r = await flushPending();
    if (!r.configured) syncStatus.textContent = "Falta URL o key.";
    else syncStatus.textContent = `Enviados ${r.sent}. Pendientes ${r.failed}.${r.lastError ? " " + r.lastError : ""}`;
    syncStatus.className = "text-xs text-sage";
  };
  syncActions.appendChild(saveSync);
  syncActions.appendChild(testBtn);
  syncActions.appendChild(flushBtn);
  box.appendChild(syncActions);

  const back = el(`<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Volver</button>`);
  back.onclick = () => {
    app.screen = "home";
    render();
  };
  box.appendChild(back);
  main.appendChild(box);
  root.appendChild(main);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function accountBar() {
  if (!app.account?.configured) {
    return `<p class="text-sm text-muted">Aún sin cuenta de Google: tus frases y sesiones siguen en este teléfono.</p>`;
  }
  return `<div class="flex items-center justify-between gap-3">
    <p class="account-email text-sm text-muted">${escapeHtml(app.account.email || "")}</p>
    <button type="button" id="btn-signout" class="h-11 shrink-0 rounded-full border border-line px-4 text-sm font-medium">Salir</button>
  </div>`;
}

function authMain() {
  root.innerHTML = "";
  const main = el(`<main class="app-shell mx-auto flex min-h-[80dvh] w-full max-w-lg flex-col justify-center gap-6"></main>`);
  root.appendChild(main);
  return main;
}

function renderChecking() {
  const main = authMain();
  main.appendChild(
    el(`<div class="flex flex-col gap-2">
      <p class="text-sm font-medium text-sage">Aliento</p>
      <h1 class="display text-4xl leading-none">Un momento…</h1>
      <p class="text-muted">Estamos abriendo tu cuenta.</p>
    </div>`)
  );
}

function renderSignIn() {
  const main = authMain();
  main.appendChild(
    el(`<div class="flex flex-col gap-2">
      <p class="text-sm font-medium text-sage">Aliento</p>
      <h1 class="display text-4xl leading-none">Entra con Google</h1>
      <p class="text-muted">Solo las personas que Ismael autoriza pueden usar esta app. Tus frases y tus sesiones quedan en tu cuenta, en el teléfono y en la computadora.</p>
    </div>`)
  );
  const button = el(
    `<button type="button" id="btn-google" class="h-14 w-full rounded-full bg-gold font-semibold text-bg">Entrar con Google</button>`
  );
  const status = el(`<p class="text-sm text-muted" id="auth-status"></p>`);
  if (app.account?.error) status.textContent = app.account.error;
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = "Abriendo Google…";
    status.className = "text-sm text-muted";
    try {
      await signInWithGoogle();
    } catch (err) {
      button.disabled = false;
      status.textContent = spanishAuthError(err);
      status.className = "text-sm text-muted";
    }
  };
  main.appendChild(button);
  main.appendChild(status);
  main.appendChild(
    el(`<p class="text-sm text-muted">Si no tienes acceso, pídeselo a Ismael. Él agrega tu correo en Personas.</p>`)
  );
}

function deniedCopy() {
  const email = app.account?.email || "";
  const reason = app.account?.reason || "unauthorized";
  if (reason === "no-email") {
    return "Google no entregó un correo para esta cuenta. Prueba con otra.";
  }
  if (reason === "rules") {
    return "No se pudo abrir la base de datos. Falta publicar las reglas de Firestore.";
  }
  if (reason === "offline-unknown") {
    return "Hace falta internet la primera vez para comprobar tu acceso.";
  }
  if (reason === "gate") {
    return app.account?.error || "No se pudo entrar. Inténtalo otra vez.";
  }
  return `La cuenta ${email} no tiene acceso. Pídele a Ismael que la autorice y vuelve a entrar.`;
}

function renderDenied() {
  const main = authMain();
  main.appendChild(
    el(`<div class="flex flex-col gap-2">
      <p class="text-sm font-medium text-sage">Aliento</p>
      <h1 class="display text-4xl leading-none">Sin acceso</h1>
      <p class="text-muted">${escapeHtml(deniedCopy())}</p>
    </div>`)
  );
  if (app.account?.email && app.account.reason === "unauthorized") {
    main.appendChild(
      el(`<p class="card account-email p-4 text-center text-fg">${escapeHtml(app.account.email)}</p>`)
    );
  }
  const out = el(`<button type="button" class="h-14 w-full rounded-full bg-gold font-semibold text-bg">Salir</button>`);
  out.onclick = () => {
    signOutCloud().catch(() => {
      app.screen = "signin";
      render();
    });
  };
  main.appendChild(out);
  const retry = el(`<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Reintentar</button>`);
  retry.onclick = () => {
    app.screen = "checking";
    render();
    window.location.reload();
  };
  main.appendChild(retry);
}

function renderAccess() {
  root.innerHTML = "";
  const main = el(`<main class="app-shell mx-auto w-full max-w-lg"></main>`);
  const box = el(`<div class="mx-auto flex max-w-lg flex-col gap-6"></div>`);
  box.appendChild(
    el(`<header class="flex flex-col gap-2">
      <p class="text-sm font-medium text-sage">Solo tú</p>
      <h1 class="display text-4xl leading-none">Personas</h1>
      <p class="text-muted">Agrega o quita correos de Google. Quien no esté aquí ve un aviso y no entra. Tu correo de administrador siempre puede entrar.</p>
    </header>`)
  );
  box.appendChild(el(`<p class="account-email text-sm text-sage">Administrador: ${escapeHtml(app.account?.email || "")}</p>`));
  const form = el(`<form class="flex flex-col gap-3" id="access-form">
    <label class="flex flex-col gap-1">
      <span class="text-xs tracking-wide text-muted uppercase">Correo de Google</span>
      <input id="access-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" class="auth-input rounded-xl border border-line bg-transparent px-3 text-fg outline-none" placeholder="persona@correo.com"/>
    </label>
    <button type="submit" class="h-14 w-full rounded-full bg-gold font-semibold text-bg">Agregar</button>
  </form>`);
  box.appendChild(form);
  const status = el(`<p class="text-sm text-muted" id="access-status">Cargando…</p>`);
  box.appendChild(status);
  const list = el(`<div class="flex flex-col gap-3" id="access-list"></div>`);
  box.appendChild(list);
  const back = el(`<button type="button" class="h-12 w-full rounded-full border border-line font-medium">Volver</button>`);
  back.onclick = () => {
    app.screen = "home";
    render();
  };
  box.appendChild(back);
  main.appendChild(box);
  root.appendChild(main);

  const paint = (emails) => {
    list.innerHTML = "";
    const others = emails.filter((item) => item !== (app.account?.email || "").toLowerCase());
    if (!others.length) {
      list.appendChild(el(`<p class="text-muted">Todavía no autorizas a nadie más.</p>`));
      return;
    }
    for (const email of others) {
      const row = el(`<div class="card flex items-center justify-between gap-3 p-4">
        <p class="account-email text-sm">${escapeHtml(email)}</p>
        <button type="button" class="af-remove inline-flex items-center justify-center rounded-full border border-line text-sm font-medium">Quitar</button>
      </div>`);
      row.querySelector("button").onclick = async () => {
        if (!confirm(`¿Quitar el acceso de ${email}?`)) return;
        status.textContent = "Quitando…";
        try {
          await revokeEmail(email);
          paint(emails.filter((item) => item !== email));
          status.textContent = "Listo. Esa cuenta ya no entra.";
          status.className = "text-sm text-sage";
        } catch (err) {
          status.textContent = spanishAuthError(err);
          status.className = "text-sm text-muted";
        }
      };
      list.appendChild(row);
    }
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    const input = form.querySelector("#access-email");
    status.textContent = "Guardando…";
    status.className = "text-sm text-muted";
    try {
      const email = await grantEmail(input.value);
      input.value = "";
      const emails = await fetchAllowlist();
      paint(emails);
      status.textContent = email === (app.account?.email || "").toLowerCase()
        ? "Ese correo ya es el administrador."
        : "Listo. Ese correo ya puede entrar con Google.";
      status.className = "text-sm text-sage";
    } catch (err) {
      status.textContent = err?.code === "invalid-email"
        ? "Escribe un correo válido."
        : spanishAuthError(err);
      status.className = "text-sm text-muted";
    }
  };

  fetchAllowlist()
    .then((emails) => {
      paint(emails);
      status.textContent = "Se guarda en la nube. No hace falta cambiar código.";
      status.className = "text-sm text-muted";
    })
    .catch((err) => {
      status.textContent = spanishAuthError(err);
      status.className = "text-sm text-muted";
    });
}

function reloadAccountData() {
  app.data = loadState();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

bootTimer((habitId, minutes) => {
  if (minutes > 0) addDedicatedMinutes(habitId, todayISO(), minutes);
  if (app.screen === "crono" || app.screen === "habits" || app.screen === "stats") render();
});

startCloud({
  onChecking() {
    app.screen = "checking";
    render();
  },
  onLocal() {
    app.account = { configured: false, email: "", name: "", isAdmin: false, error: "", reason: "" };
    app.screen = "habits";
    render();
  },
  onSignIn({ error }) {
    app.account = {
      configured: true,
      email: "",
      name: "",
      isAdmin: false,
      error: error || "",
      reason: "",
    };
    app.screen = "signin";
    render();
  },
  onDenied(info) {
    app.account = {
      configured: true,
      email: info?.email || "",
      name: "",
      isAdmin: false,
      error: info?.reason === "gate" ? info.error || "" : "",
      reason: info?.reason || "unauthorized",
    };
    app.screen = "denied";
    render();
  },
  onGate({ message }) {
    app.account = {
      configured: true,
      email: "",
      name: "",
      isAdmin: false,
      error: message || "",
      reason: "gate",
    };
    app.screen = "denied";
    render();
  },
  onReady(info) {
    const enter = app.screen === "checking" || app.screen === "signin" || app.screen === "denied";
    app.account = {
      configured: true,
      email: info.email,
      name: info.name || "",
      uid: info.uid || "",
      isAdmin: !!info.isAdmin,
      error: "",
      reason: "",
    };
    reloadAccountData();
    if (enter) {
      app.screen = "habits";
      render();
    }
  },
  onRemote() {
    reloadAccountData();
    if (["home", "settings", "done", "habits", "reports", "stats", "group", "habit"].includes(app.screen)) render();
  },
});
