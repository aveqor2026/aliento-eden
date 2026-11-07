import { markLocalEdit } from "./account-data.js";

/**
 * Afirmaciones de Aliento.
 * La lista de inicio está abajo. En la app se edita desde Afirmaciones
 * y se guarda en localStorage (clave aliento-af-list), también si queda vacía.
 * Sin esa clave se usan las frases de inicio.
 * La rotación usa siempre la lista actual (clave aliento-af-queue).
 */

export const DEFAULT_AFIRMACIONES = [
  "Conozco personalmente al Padre y a Su Hijo Jesucristo; me postro ante Ellos y los abrazo.",
  "La Palabra de Dios guía y corrige mi vida; Sus mandamientos marcan mi rumbo.",
  "Cada decisión que tomo refleja lo que Dios quiere para cómo vivo en esta tierra.",
  "EDÉN ya restaura vidas: cada niño tiene familia y cada adulto mayor dignidad.",
  "Los recursos que llegan tienen sentido porque sirven a EDÉN y a la voluntad de Dios.",
  "Construyo al hombre cada mañana; el hombre construye la visión.",
  "Hoy camino en obediencia, paz y fe hacia Ellos y hacia EDÉN.",
  "Mi familia está protegida y yo sirvo con amor donde Dios me puso.",
  "AVEQOR crece sin depender de mí; yo camino hacia EDÉN.",
];

const LIST_KEY = "aliento-af-list";
const QUEUE_KEY = "aliento-af-queue";

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cleanList(list) {
  return (list || [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
}

/** Lista actual. Sin clave guardada: las de inicio. Una lista vacía guardada se respeta. */
export function getAfirmaciones() {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (raw == null) return DEFAULT_AFIRMACIONES.slice();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT_AFIRMACIONES.slice();
    return cleanList(arr);
  } catch {
    return DEFAULT_AFIRMACIONES.slice();
  }
}

function writeQueue(n) {
  const fresh = { order: n ? shuffle([...Array(n).keys()]) : [], nextIndex: 0 };
  localStorage.setItem(QUEUE_KEY, JSON.stringify(fresh));
  markLocalEdit();
  return fresh;
}

/**
 * Guarda la lista editada, sin tope de cantidad.
 * Una lista vacía queda guardada como vacía (no vuelve sola a las de inicio).
 * @param {string[]} list
 * @param {{ resetQueue?: boolean }} [opts] resetQueue reinicia la rotación aunque no cambie la cantidad
 */
export function setAfirmaciones(list, opts = {}) {
  const prevCount = getAfirmaciones().length;
  const cleaned = cleanList(list);
  localStorage.setItem(LIST_KEY, JSON.stringify(cleaned));
  if (opts.resetQueue === true || cleaned.length !== prevCount) {
    writeQueue(cleaned.length);
  } else {
    markLocalEdit();
  }
  return cleaned.slice();
}

export function resetAfirmacionesToDefaults() {
  localStorage.removeItem(LIST_KEY);
  writeQueue(DEFAULT_AFIRMACIONES.length);
  return DEFAULT_AFIRMACIONES.slice();
}

function loadQueue() {
  const n = getAfirmaciones().length;
  if (n === 0) return writeQueue(0);
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) throw new Error("empty");
    const q = JSON.parse(raw);
    if (
      !Array.isArray(q.order) ||
      q.order.length !== n ||
      typeof q.nextIndex !== "number"
    ) {
      throw new Error("bad");
    }
    const set = new Set(q.order);
    if (set.size !== n || [...set].some((i) => i < 0 || i >= n)) {
      throw new Error("bad-idx");
    }
    return q;
  } catch {
    return writeQueue(n);
  }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  markLocalEdit();
}

/** Siguiente afirmación sin repetir; persiste entre sesiones. Lista vacía: cadena vacía. */
export function nextAfirmacion() {
  const list = getAfirmaciones();
  const n = list.length;
  if (n === 0) return "";
  let q = loadQueue();
  if (q.nextIndex >= n) {
    q = writeQueue(n);
  }
  const idx = q.order[q.nextIndex];
  q.nextIndex += 1;
  saveQueue(q);
  return list[idx];
}

export function restantesEnCiclo() {
  const n = getAfirmaciones().length;
  if (n === 0) return 0;
  const q = loadQueue();
  return Math.max(0, n - q.nextIndex);
}

/** Compat: array por defecto (no mutar). Preferir getAfirmaciones(). */
export const AFIRMACIONES = DEFAULT_AFIRMACIONES;
