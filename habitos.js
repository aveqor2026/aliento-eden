/**
 * Hábitos de cada persona. Semana de lunes a domingo, fecha local del teléfono.
 * Se guarda en localStorage y viaja en el mismo paquete de la cuenta.
 */

import { HABITS_KEY, markLocalEdit } from "./account-data.js";
import { SEED_HABITS, SEED_ROWS } from "./habitos-seed.js";

const TYPES = {
  count: "Veces",
  minutes: "Minutos",
  check: "Sí o no",
};

export function foldName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isBreathHabit(habit) {
  const name = foldName(habit?.name);
  return name === "respiraciones" || name === "respiracion";
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export const HABIT_COLORS = ["rose", "peach", "sand", "mint", "sky", "lilac"];

export const HABIT_EMOJIS = ["🌬️", "💪", "🦵", "📖", "💧", "🚶", "🌿", "✨", "❤️", "☀️", "🌙", "🎵"];

function emptyStore() {
  return { habits: [], entries: [], times: [], seedImported: false, share: false };
}

export function guessEmoji(name) {
  const folded = foldName(name);
  if (folded.includes("respir")) return "🌬️";
  if (folded.includes("flexion")) return "💪";
  if (folded.includes("sentad")) return "🦵";
  if (folded.includes("oraci")) return "🌿";
  if (folded.includes("lect")) return "📖";
  if (folded.includes("agua")) return "💧";
  if (folded.includes("camin") || folded.includes("paso")) return "🚶";
  return "✨";
}

function cleanGoal(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function cleanAmount(value, type) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (type === "check") return 1;
  return Math.min(100000, Math.round(n * 100) / 100);
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseISO(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoFromDate(date) {
  return todayISO(date);
}

/** Semana de lunes a domingo. El mes y el año son el calendario completo. */
export function periodRange(kind, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (kind === "semana") {
    const weekday = today.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = new Date(today);
    start.setDate(today.getDate() + mondayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end, days: 7, label: "Semana" };
  }
  if (kind === "mes") {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return { start, end, days: end.getDate(), label: "Mes" };
  }
  if (kind === "ano" || kind === "año") {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = new Date(today.getFullYear(), 11, 31);
    const days = Math.round((end - start) / 86400000) + 1;
    return { start, end, days, label: "Año" };
  }
  return { start: today, end: today, days: 1, label: "Hoy" };
}

export function loadHabits() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HABITS_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const habits = (Array.isArray(parsed.habits) ? parsed.habits : [])
      .map((habit) => {
        const type = habit?.type === "minutes" || habit?.type === "check" ? habit.type : "count";
        const name = String(habit?.name || "").trim().slice(0, 60);
        if (!name || typeof habit?.id !== "string") return null;
        const emoji = HABIT_EMOJIS.includes(habit.emoji) ? habit.emoji : guessEmoji(name);
        const color = HABIT_COLORS.includes(habit.color) ? habit.color : HABIT_COLORS[0];
        return { id: habit.id, name, type, goal: cleanGoal(habit.goal), emoji, color };
      })
      .filter(Boolean)
      .slice(0, 200);
    const ids = new Set(habits.map((habit) => habit.id));
    const entries = (Array.isArray(parsed.entries) ? parsed.entries : [])
      .map((entry) => {
        if (!entry || typeof entry.id !== "string" || !ids.has(entry.habitId)) return null;
        if (!validDate(entry.date)) return null;
        const habit = habits.find((item) => item.id === entry.habitId);
        const amount = cleanAmount(entry.amount, habit?.type);
        if (amount <= 0) return null;
        return { id: entry.id, habitId: entry.habitId, date: entry.date, amount };
      })
      .filter(Boolean)
      .slice(0, 4000);
    const times = (Array.isArray(parsed.times) ? parsed.times : [])
      .map((entry) => {
        if (!entry || typeof entry.id !== "string" || !ids.has(entry.habitId)) return null;
        if (!validDate(entry.date)) return null;
        const minutes = Math.round(Number(entry.minutes));
        if (!Number.isFinite(minutes) || minutes <= 0) return null;
        return { id: entry.id, habitId: entry.habitId, date: entry.date, minutes: Math.min(100000, minutes) };
      })
      .filter(Boolean)
      .slice(0, 4000);
    return { habits, entries, times, seedImported: parsed.seedImported === true, share: parsed.share === true };
  } catch {
    return emptyStore();
  }
}

export function saveHabits(store) {
  localStorage.setItem(HABITS_KEY, JSON.stringify(store));
  markLocalEdit();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("aliento-share"));
  }
}

export function habitById(id) {
  return loadHabits().habits.find((habit) => habit.id === id) || null;
}

export function createHabit({ name, type, goal, emoji, color }) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return null;
  const store = loadHabits();
  const habit = {
    id: newId("h"),
    name: clean,
    type: type === "minutes" || type === "check" ? type : "count",
    goal: cleanGoal(goal),
    emoji: HABIT_EMOJIS.includes(emoji) ? emoji : guessEmoji(clean),
    color: HABIT_COLORS.includes(color) ? color : HABIT_COLORS[store.habits.length % HABIT_COLORS.length],
  };
  store.habits.push(habit);
  saveHabits(store);
  return habit;
}

export function updateHabit(id, { name, type, goal, emoji, color }) {
  const store = loadHabits();
  const habit = store.habits.find((item) => item.id === id);
  if (!habit) return null;
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) return null;
  habit.name = clean;
  habit.type = type === "minutes" || type === "check" ? type : "count";
  habit.goal = cleanGoal(goal);
  if (HABIT_EMOJIS.includes(emoji)) habit.emoji = emoji;
  if (HABIT_COLORS.includes(color)) habit.color = color;
  if (habit.type === "check") {
    for (const entry of store.entries) {
      if (entry.habitId === id) entry.amount = 1;
    }
  }
  saveHabits(store);
  return habit;
}

export function deleteHabit(id) {
  const store = loadHabits();
  store.habits = store.habits.filter((habit) => habit.id !== id);
  store.entries = store.entries.filter((entry) => entry.habitId !== id);
  store.times = (store.times || []).filter((entry) => entry.habitId !== id);
  saveHabits(store);
}

export function addEntry(habitId, date, amount) {
  const store = loadHabits();
  const habit = store.habits.find((item) => item.id === habitId);
  if (!habit || !validDate(date)) return null;
  const value = cleanAmount(amount, habit.type);
  if (value <= 0) return null;
  if (habit.type === "check") {
    const existing = store.entries.find((entry) => entry.habitId === habitId && entry.date === date);
    if (existing) {
      existing.amount = 1;
      saveHabits(store);
      return existing;
    }
  }
  const entry = { id: newId("e"), habitId, date, amount: value };
  store.entries.push(entry);
  saveHabits(store);
  return entry;
}

export function updateEntry(id, { date, amount }) {
  const store = loadHabits();
  const entry = store.entries.find((item) => item.id === id);
  if (!entry || !validDate(date)) return null;
  const habit = store.habits.find((item) => item.id === entry.habitId);
  const value = cleanAmount(amount, habit?.type);
  if (value <= 0) return null;
  entry.date = date;
  entry.amount = value;
  saveHabits(store);
  return entry;
}

export function deleteEntry(id) {
  const store = loadHabits();
  store.entries = store.entries.filter((entry) => entry.id !== id);
  saveHabits(store);
}

export function clearCheck(habitId, date) {
  const store = loadHabits();
  store.entries = store.entries.filter((entry) => !(entry.habitId === habitId && entry.date === date));
  saveHabits(store);
}

/** Minutos del cronómetro en hábitos de cantidad o sí/no. No toca el conteo. */
export function addDedicatedMinutes(habitId, date, minutes) {
  const store = loadHabits();
  const habit = store.habits.find((item) => item.id === habitId);
  if (!habit || !validDate(date)) return null;
  const value = Math.round(Number(minutes));
  if (!Number.isFinite(value) || value <= 0) return null;
  if (habit.type === "minutes") return addEntry(habitId, date, value);
  const entry = { id: newId("t"), habitId, date, minutes: Math.min(100000, value) };
  store.times = store.times || [];
  store.times.push(entry);
  saveHabits(store);
  return entry;
}

export function sumDedicatedMinutes(habitId, kind, now = new Date()) {
  const habit = habitById(habitId);
  if (!habit) return 0;
  if (habit.type === "minutes") return sumHabit(habitId, kind, now).total;
  const range = periodRange(kind, now);
  const start = isoFromDate(range.start);
  const end = isoFromDate(range.end);
  return (loadHabits().times || [])
    .filter((entry) => entry.habitId === habitId && entry.date >= start && entry.date <= end)
    .reduce((sum, entry) => sum + entry.minutes, 0);
}

export function sumHabit(habitId, kind, now = new Date()) {
  const range = periodRange(kind, now);
  const start = isoFromDate(range.start);
  const end = isoFromDate(range.end);
  const total = loadHabits()
    .entries.filter((entry) => entry.habitId === habitId && entry.date >= start && entry.date <= end)
    .reduce((sum, entry) => sum + entry.amount, 0);
  return { ...range, total: Math.round(total * 100) / 100 };
}

export function goalForPeriod(habit, days) {
  if (!habit?.goal) return null;
  return Math.round(habit.goal * days * 100) / 100;
}

export function formatAmount(habit, amount) {
  const n = Math.round(Number(amount) * 100) / 100;
  const text = Number.isInteger(n) ? String(n) : String(n);
  if (habit?.type === "minutes") return `${text} min`;
  if (habit?.type === "check") return n === 1 ? "1 día" : `${text} días`;
  return text;
}

export function typeLabel(type) {
  return TYPES[type] || TYPES.count;
}

/**
 * Suma una sesión de respiración al hábito llamado Respiraciones, si existe.
 * La misma sesión no se anota dos veces.
 */
export function logSessionBreaths(rounds, sessionId, date = todayISO()) {
  const amount = Math.max(0, Math.floor(Number(rounds) || 0));
  if (amount <= 0 || !sessionId) return 0;
  const store = loadHabits();
  const habit = store.habits.find(isBreathHabit);
  if (!habit) return 0;
  const id = `sesion-${sessionId}`;
  if (store.entries.some((entry) => entry.id === id)) return 0;
  if (!validDate(date)) return 0;
  store.entries.push({ id, habitId: habit.id, date, amount });
  saveHabits(store);
  return amount;
}

export function importAdminSeedIfNeeded() {
  const store = loadHabits();
  if (store.seedImported) return { added: 0, already: true };
  const bySlug = new Map();
  for (const seed of SEED_HABITS) {
    let habit = store.habits.find((item) => foldName(item.name) === foldName(seed.name));
    if (!habit) {
      habit = {
        id: `seed-${seed.slug}`,
        name: seed.name,
        type: seed.type,
        goal: seed.goal,
        emoji: seed.emoji,
        color: seed.color,
      };
      store.habits.push(habit);
    }
    bySlug.set(seed.slug, habit);
  }
  let added = 0;
  for (const [date, slug, cantidad] of SEED_ROWS) {
    const habit = bySlug.get(slug);
    if (!habit || !validDate(date)) continue;
    const id = `seed-${date}-${slug}`;
    if (store.entries.some((entry) => entry.id === id)) continue;
    const amount = cleanAmount(cantidad, habit.type);
    if (amount <= 0) continue;
    store.entries.push({ id, habitId: habit.id, date, amount });
    added += 1;
  }
  store.seedImported = true;
  saveHabits(store);
  return { added, already: false };
}

export function seedAlreadyImported() {
  return loadHabits().seedImported;
}

export function setShare(on) {
  const store = loadHabits();
  store.share = !!on;
  saveHabits(store);
  return store.share;
}

export function dayTotal(habitId, date, entries) {
  return entries
    .filter((entry) => entry.habitId === habitId && entry.date === date)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function dayDone(habit, total) {
  if (total <= 0) return false;
  if (!habit?.goal) return true;
  return total + 0.0001 >= habit.goal;
}

function shiftISO(iso, days) {
  const date = parseISO(iso);
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

export function eachDate(start, end) {
  const dates = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= last && dates.length < 400) {
    dates.push(todayISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function currentStreak(habit, entries, now = new Date()) {
  let cursor = todayISO(now);
  if (!dayDone(habit, dayTotal(habit.id, cursor, entries))) cursor = shiftISO(cursor, -1);
  let count = 0;
  while (count < 5000 && dayDone(habit, dayTotal(habit.id, cursor, entries))) {
    count += 1;
    cursor = shiftISO(cursor, -1);
  }
  return count;
}

export function bestStreak(habit, entries) {
  const dates = [...new Set(entries.filter((entry) => entry.habitId === habit.id).map((entry) => entry.date))]
    .filter((date) => dayDone(habit, dayTotal(habit.id, date, entries)))
    .sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const date of dates) {
    run = prev && shiftISO(prev, 1) === date ? run + 1 : 1;
    prev = date;
    if (run > best) best = run;
  }
  return best;
}

export function buildReport(kind, now = new Date()) {
  const range = periodRange(kind, now);
  const dates = eachDate(range.start, range.end);
  const store = loadHabits();
  let possible = 0;
  let done = 0;
  let bestScore = -1;
  let bestDay = dates[0] || todayISO(now);
  const rows = store.habits.map((habit) => {
    const cells = dates.map((date) => {
      const total = dayTotal(habit.id, date, store.entries);
      const ok = dayDone(habit, total);
      return { date, total, ok };
    });
    return { habit, cells };
  });
  for (const date of dates) {
    let score = 0;
    for (const row of rows) {
      possible += 1;
      const cell = row.cells.find((item) => item.date === date);
      if (cell?.ok) {
        done += 1;
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDay = date;
    }
  }
  const bestRun = store.habits.reduce((max, habit) => Math.max(max, bestStreak(habit, store.entries)), 0);
  return {
    ...range,
    dates,
    rows,
    pct: possible ? Math.round((done / possible) * 100) : 0,
    bestDay,
    done,
    bestRun,
  };
}

export function monthGrid(habit, year, month, entries) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let day = 1; day <= days; day++) {
    const date = todayISO(new Date(year, month, day));
    const total = dayTotal(habit.id, date, entries);
    const goal = habit.goal || 0;
    const ratio = goal ? Math.min(1, total / goal) : total > 0 ? 1 : 0;
    cells.push({ day, date, total, ratio, ok: dayDone(habit, total) });
  }
  return cells;
}

export function yearHeat(habit, year, entries) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const lead = (start.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  const cursor = new Date(start);
  while (cursor <= end) {
    const date = todayISO(cursor);
    const total = dayTotal(habit.id, date, entries);
    const goal = habit.goal || 0;
    const ratio = goal ? Math.min(1, total / goal) : total > 0 ? 1 : 0;
    cells.push({ date, ratio, ok: dayDone(habit, total) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return cells;
}

function readLocalName() {
  try {
    const state = JSON.parse(localStorage.getItem("aliento-af-v1") || "null");
    const name = state?.people?.[0]?.name;
    if (typeof name === "string" && name.trim()) return name.trim().slice(0, 40);
  } catch {
    /* vacío */
  }
  return "Yo";
}

export function shareCard(displayName) {
  const store = loadHabits();
  return {
    optedIn: store.share === true,
    name: String(displayName || readLocalName()).trim().slice(0, 40) || "Yo",
    habits: store.habits.slice(0, 40).map((habit) => {
      const amount = dayTotal(habit.id, todayISO(), store.entries);
      const goal = habit.goal || 0;
      const pct = goal ? Math.min(100, Math.round((amount / goal) * 100)) : amount > 0 ? 100 : 0;
      return {
        id: habit.id,
        name: habit.name,
        emoji: habit.emoji,
        color: habit.color,
        amount,
        goal: habit.goal,
        pct,
        streak: currentStreak(habit, store.entries),
      };
    }),
  };
}
