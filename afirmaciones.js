/**
 * Afirmaciones de Aliento.
 * Defaults abajo; en la app se editan desde Ajustes y se guardan
 * en localStorage (clave aliento-af-list). La rotación usa siempre
 * la lista actual (clave aliento-af-queue).
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

/**
 * Fondo de la pausa, solo si el texto coincide exactamente.
 * La primera frase (Padre e Hijo) no tiene imagen: ni rostros sagrados ni cruces.
 * Frases editadas que no estén aquí se muestran solo en texto.
 * Reservadas en images/ (sin mapa todavía): 04b-eden-playa.jpg,
 * 10-casa-oracion-pulpito.jpg, 11-hospital-ambulancia.jpg.
 */
const IMAGE_FILE_BY_DEFAULT_INDEX = {
  1: "02-palabra-biblia.jpg",
  2: "03-decisiones.jpg",
  3: "04-eden-montanas.jpg",
  4: "05-recursos-eden.jpg",
  5: "06-construyo-leyendo.jpg",
  6: "07-camino-paz.jpg",
  7: "08-familia-esposa.jpg",
  8: "09-aveqor-crece.jpg",
};

export const AFIRMACION_IMAGES = Object.fromEntries(
  Object.entries(IMAGE_FILE_BY_DEFAULT_INDEX).map(([index, file]) => [
    DEFAULT_AFIRMACIONES[Number(index)],
    `images/${file}`,
  ])
);

/** @param {string} text @returns {string | null} ruta relativa o null (solo texto) */
export function imageForAfirmacion(text) {
  if (typeof text !== "string") return null;
  const src = AFIRMACION_IMAGES[text.trim()];
  return src || null;
}

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

/** Lista actual (editada o defaults). Siempre 1–12 frases no vacías. */
export function getAfirmaciones() {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return DEFAULT_AFIRMACIONES.slice();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT_AFIRMACIONES.slice();
    const cleaned = arr
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0)
      .slice(0, 12);
    return cleaned.length ? cleaned : DEFAULT_AFIRMACIONES.slice();
  } catch {
    return DEFAULT_AFIRMACIONES.slice();
  }
}

/**
 * Guarda la lista editada.
 * @param {string[]} list
 * @param {{ resetQueue?: boolean }} [opts] si resetQueue, reinicia la rotación
 */
export function setAfirmaciones(list, opts = {}) {
  const cleaned = (list || [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .slice(0, 12);
  if (cleaned.length === 0) {
    localStorage.removeItem(LIST_KEY);
  } else {
    localStorage.setItem(LIST_KEY, JSON.stringify(cleaned));
  }
  const reset = opts.resetQueue !== false; // por defecto reinicia cola al guardar
  if (reset) {
    const n = getAfirmaciones().length;
    const fresh = { order: shuffle([...Array(n).keys()]), nextIndex: 0 };
    localStorage.setItem(QUEUE_KEY, JSON.stringify(fresh));
  }
  return getAfirmaciones();
}

export function resetAfirmacionesToDefaults() {
  localStorage.removeItem(LIST_KEY);
  const n = DEFAULT_AFIRMACIONES.length;
  localStorage.setItem(
    QUEUE_KEY,
    JSON.stringify({ order: shuffle([...Array(n).keys()]), nextIndex: 0 })
  );
  return DEFAULT_AFIRMACIONES.slice();
}

function loadQueue() {
  const n = getAfirmaciones().length;
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
    const fresh = { order: shuffle([...Array(n).keys()]), nextIndex: 0 };
    localStorage.setItem(QUEUE_KEY, JSON.stringify(fresh));
    return fresh;
  }
}

function saveQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

/** Siguiente afirmación sin repetir; persiste entre sesiones. */
export function nextAfirmacion() {
  const list = getAfirmaciones();
  const n = list.length;
  if (n === 0) return "";
  let q = loadQueue();
  if (q.nextIndex >= n) {
    q = { order: shuffle([...Array(n).keys()]), nextIndex: 0 };
  }
  const idx = q.order[q.nextIndex];
  q.nextIndex += 1;
  saveQueue(q);
  return list[idx];
}

export function restantesEnCiclo() {
  const q = loadQueue();
  return Math.max(0, getAfirmaciones().length - q.nextIndex);
}

/** Compat: array por defecto (no mutar). Preferir getAfirmaciones(). */
export const AFIRMACIONES = DEFAULT_AFIRMACIONES;
