/**
 * Historial de Ismael (fecha, habito, cantidad).
 * Se importa una sola vez en la cuenta administradora.
 */
export const SEED_HABITS = [
  { slug: "respiraciones", name: "Respiraciones", type: "count", goal: null, emoji: "🌬️", color: "sky" },
  { slug: "oracion_manana", name: "Oración de la mañana", type: "check", goal: 1, emoji: "🌿", color: "mint" },
  { slug: "flexiones", name: "Flexiones", type: "count", goal: null, emoji: "💪", color: "peach" },
  { slug: "sentadillas", name: "Sentadillas", type: "count", goal: null, emoji: "🦵", color: "lilac" },
];

export const SEED_ROWS = [
  ["2026-10-15", "respiraciones", 4],
  ["2026-10-15", "oracion_manana", 1],
  ["2026-10-15", "flexiones", 10],
  ["2026-10-15", "sentadillas", 10],
  ["2026-10-17", "respiraciones", 7],
  ["2026-10-20", "flexiones", 20],
  ["2026-10-20", "sentadillas", 20],
  ["2026-10-21", "flexiones", 20],
  ["2026-10-21", "sentadillas", 20],
  ["2026-10-22", "flexiones", 20],
  ["2026-10-22", "sentadillas", 20],
  ["2026-10-22", "respiraciones", 3],
  ["2026-10-21", "respiraciones", 2],
  ["2026-10-25", "respiraciones", 5],
  ["2026-10-25", "flexiones", 25],
  ["2026-10-25", "sentadillas", 25],
  ["2026-10-30", "respiraciones", 3],
  ["2026-11-02", "respiraciones", 3],
];
