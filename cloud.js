/**
 * Cuenta de Google y copia en Firestore.
 * Si firebase-config.js está vacío, no hace nada: sigue el teléfono.
 * La lista de correos la exige firestore.rules, no solo esta pantalla.
 */

import { ADMIN_EMAIL, firebaseConfig } from "./firebase-config.js";
import {
  adminEmail,
  applyBundle,
  cachedAccess,
  clearAccess,
  activityScore,
  decideHydration,
  exportBundle,
  getLocalMs,
  getOwnerUid,
  hasLocalCustom,
  isCloudBundleEmpty,
  isFirebaseConfigured,
  localActivityScore,
  normalizeEmail,
  prepareLocalForUser,
  rememberAccess,
  seedFreshState,
  setOwnerUid,
} from "./account-data.js";

const FB = "https://www.gstatic.com/firebasejs/13.2.0";

let services = null;
let initPromise = null;
let unsub = null;
let lastWriteId = "";
let pushTimer = null;
let pushChain = null;
let pushAgain = false;
let activeUid = "";
let listening = false;

export function cloudConfigured() {
  return isFirebaseConfigured(firebaseConfig);
}

export function spanishAuthError(err) {
  const code = err?.code || "";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Se cerró la ventana de Google. Inténtalo otra vez.";
  }
  if (code === "auth/popup-blocked") {
    return "El navegador bloqueó la ventana de Google. Inténtalo otra vez.";
  }
  if (code === "auth/unauthorized-domain") {
    return "Este sitio todavía no está autorizado en Firebase.";
  }
  if (code === "auth/network-request-failed" || code === "unavailable") {
    return "Sin conexión. Inténtalo cuando tengas internet.";
  }
  if (code === "permission-denied") {
    return "La base de datos rechazó el acceso. Publica las reglas de Firestore.";
  }
  return "No se pudo completar. Inténtalo otra vez.";
}

function isOffline(err) {
  const code = err?.code || "";
  return code === "unavailable" || code === "auth/network-request-failed" || code === "failed-precondition";
}

function useRedirect() {
  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const standalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return ios || standalone;
}

function newWriteId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `w-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function ensure() {
  if (services) return services;
  if (!initPromise) initPromise = initServices();
  services = await initPromise;
  return services;
}

async function initServices() {
  const { initializeApp } = await import(`${FB}/firebase-app.js`);
  const { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } = await import(
    `${FB}/firebase-auth.js`
  );
  const fs = await import(`${FB}/firebase-firestore.js`);
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() });
  } catch {
    db = fs.getFirestore(app);
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  provider.addScope("email");
  return { auth, db, provider, fs };
}

function userEmailOf(user) {
  return normalizeEmail(user?.email || user?.providerData?.[0]?.email || "");
}

async function checkAccess(db, fs, user) {
  const email = userEmailOf(user);
  if (!email) return { ok: false, reason: "no-email", email: "", isAdmin: false };
  const isAdmin = email === adminEmail();
  if (isAdmin) {
    try {
      await fs.getDocs(fs.collection(db, "allowlist"));
      rememberAccess(user.uid, true);
      return { ok: true, reason: "", email, isAdmin: true };
    } catch (err) {
      if (isOffline(err)) {
        const cached = cachedAccess(user.uid);
        if (cached?.ok) return { ok: true, reason: "", email, isAdmin: true, offline: true };
        return { ok: false, reason: "offline-unknown", email, isAdmin: true };
      }
      if (err?.code === "permission-denied") {
        return { ok: false, reason: "rules", email, isAdmin: true };
      }
      throw err;
    }
  }
  try {
    const snap = await fs.getDoc(fs.doc(db, "allowlist", email));
    if (snap.exists()) {
      rememberAccess(user.uid, false);
      return { ok: true, reason: "", email, isAdmin: false };
    }
    clearAccess();
    return { ok: false, reason: "unauthorized", email, isAdmin: false };
  } catch (err) {
    if (isOffline(err)) {
      const cached = cachedAccess(user.uid);
      if (cached?.ok) return { ok: true, reason: "", email, isAdmin: cached.isAdmin, offline: true };
      return { ok: false, reason: "offline-unknown", email, isAdmin: false };
    }
    if (err?.code === "permission-denied") {
      return { ok: false, reason: "rules", email, isAdmin: false };
    }
    throw err;
  }
}

async function readCloud(db, fs, uid) {
  const ref = fs.doc(db, "users", uid, "data", "app");
  const snap = await fs.getDoc(ref);
  return { ref, snap };
}

async function hydrate(user, email) {
  const { db, fs } = await ensure();
  prepareLocalForUser({ email, uid: user.uid });
  let snap;
  let ref;
  try {
    const read = await readCloud(db, fs, user.uid);
    snap = read.snap;
    ref = read.ref;
  } catch (err) {
    if (isOffline(err) && getOwnerUid() === user.uid) return;
    throw err;
  }
  const cloud = snap.exists() ? snap.data() : null;
  const cloudMs = cloud?.updatedAt?.toMillis?.() || 0;
  const decision = decideHydration({
    cloudExists: !!cloud,
    cloudMs,
    cloudEmpty: isCloudBundleEmpty(cloud),
    localCustom: hasLocalCustom(),
    localMs: getLocalMs(),
    sameOwner: getOwnerUid() === user.uid,
    localScore: localActivityScore(),
    cloudScore: cloud ? activityScore(cloud.state) : 0,
  });
  if (decision === "pull" && cloud) {
    applyBundle(cloud, cloudMs || Date.now());
    setOwnerUid(user.uid);
    lastWriteId = cloud.writeId || "";
    if (await maybeImportAdminSeed(email)) await pushNow(user, email, ref);
    return;
  }
  if (!hasLocalCustom()) {
    const name = String(user.displayName || email.split("@")[0] || "Yo").trim();
    seedFreshState(name);
  }
  await maybeImportAdminSeed(email);
  await pushNow(user, email, ref);
  setOwnerUid(user.uid);
}

async function maybeImportAdminSeed(email) {
  if (email !== adminEmail()) return false;
  const { importAdminSeedIfNeeded } = await import("./habitos.js");
  const result = importAdminSeedIfNeeded();
  return !result.already;
}

async function pushNow(user, email, ref) {
  const { db, fs } = await ensure();
  const current = user || services?.auth?.currentUser;
  if (!current) return;
  const addr = email || userEmailOf(current);
  if (!addr) return;
  const bundle = exportBundle(addr);
  const writeId = newWriteId();
  lastWriteId = writeId;
  const target = ref || fs.doc(db, "users", current.uid, "data", "app");
  await fs.setDoc(target, {
    ...bundle,
    email: addr,
    writeId,
    updatedAt: fs.serverTimestamp(),
  });
  await publishShareFromLocal();
}

async function publishShareFromLocal() {
  if (!activeUid) return;
  const { db, fs } = await ensure();
  const { shareCard } = await import("./habitos.js");
  const card = shareCard();
  const ref = fs.doc(db, "group", activeUid);
  if (!card.optedIn) {
    await fs.deleteDoc(ref).catch(() => {});
    return;
  }
  await fs.setDoc(ref, {
    optedIn: true,
    name: card.name,
    habits: card.habits,
    updatedAt: fs.serverTimestamp(),
  });
}

export async function listGroup() {
  const { db, fs } = await ensure();
  const q = fs.query(fs.collection(db, "group"), fs.where("optedIn", "==", true));
  const snap = await fs.getDocs(q);
  return snap.docs.map((item) => ({ uid: item.id, ...item.data() }));
}

export async function cheerPerson(targetUid, habitId) {
  const { db, fs, auth } = await ensure();
  const fromUid = auth.currentUser?.uid;
  if (!fromUid || !targetUid || !habitId) return;
  const date = new Date();
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  await fs.setDoc(fs.doc(db, "group", targetUid, "cheers", `${fromUid}_${habitId}_${iso}`), {
    fromUid,
    habitId,
    date: iso,
  });
}

export function pushSoon() {
  if (!cloudConfigured() || !activeUid) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    enqueuePush();
  }, 700);
}

function enqueuePush() {
  if (pushChain) {
    pushAgain = true;
    return;
  }
  pushChain = pushNow()
    .catch(() => {})
    .finally(() => {
      pushChain = null;
      if (pushAgain) {
        pushAgain = false;
        enqueuePush();
      }
    });
}

function listen(user, handlers) {
  if (listening && activeUid === user.uid) return;
  if (unsub) unsub();
  listening = true;
  activeUid = user.uid;
  ensure().then(({ db, fs }) => {
    const ref = fs.doc(db, "users", user.uid, "data", "app");
    unsub = fs.onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) return;
        const data = snap.data();
        if (!data || data.writeId === lastWriteId) return;
        const cloudMs = data.updatedAt?.toMillis?.() || Date.now();
        applyBundle(data, cloudMs);
        setOwnerUid(user.uid);
        lastWriteId = data.writeId || "";
        handlers.onRemote();
      },
      (err) => {
        if (err?.code === "permission-denied") {
          activeUid = "";
          clearAccess();
          handlers.onDenied({
            ok: false,
            reason: "unauthorized",
            email: userEmailOf(user),
            isAdmin: false,
          });
        }
      }
    );
  });
}

let generation = 0;
let bootedUid = "";

async function handleUser(user, redirectError, handlers) {
  const gen = ++generation;
  if (!user) {
    activeUid = "";
    bootedUid = "";
    if (unsub) unsub();
    unsub = null;
    listening = false;
    handlers.onSignIn({ error: redirectError ? spanishAuthError(redirectError) : "" });
    return;
  }
  if (bootedUid === user.uid && listening) return;
  try {
    const { db, fs } = await ensure();
    const access = await checkAccess(db, fs, user);
    if (gen !== generation) return;
    if (!access.ok) {
      activeUid = "";
      handlers.onDenied(access);
      return;
    }
    try {
      await hydrate(user, access.email);
    } catch (err) {
      if (!(access.offline || isOffline(err))) {
        if (gen !== generation) return;
        handlers.onGate({ message: spanishAuthError(err) });
        return;
      }
    }
    if (gen !== generation) return;
    activeUid = user.uid;
    bootedUid = user.uid;
    listen(user, handlers);
    publishShareFromLocal().catch(() => {});
    handlers.onReady({
      email: access.email,
      name: user.displayName || "",
      isAdmin: access.isAdmin,
      uid: user.uid,
    });
  } catch (err) {
    if (gen !== generation) return;
    handlers.onGate({ message: spanishAuthError(err) });
  }
}

export function startCloud(handlers) {
  if (!cloudConfigured()) {
    handlers.onLocal();
    return;
  }
  handlers.onChecking();
  if (typeof window !== "undefined" && !window.__alientoCloudBound) {
    window.__alientoCloudBound = true;
    window.addEventListener("aliento-local", () => pushSoon());
    window.addEventListener("aliento-share", () => {
      publishShareFromLocal().catch(() => {});
    });
    window.addEventListener("pagehide", () => {
      clearTimeout(pushTimer);
      enqueuePush();
    });
  }
  ensure()
    .then(async ({ auth }) => {
      const { getRedirectResult, onAuthStateChanged } = await import(`${FB}/firebase-auth.js`);
      let redirectError = null;
      try {
        await getRedirectResult(auth);
      } catch (err) {
        redirectError = err;
      }
      onAuthStateChanged(auth, (user) => {
        handleUser(user, redirectError, handlers);
        redirectError = null;
      });
    })
    .catch((err) => {
      handlers.onGate({
        message: "No se pudo cargar el acceso de Google. Revisa tu conexión e inténtalo otra vez.",
        detail: spanishAuthError(err),
      });
    });
}

export async function signInWithGoogle() {
  const { auth, provider } = await ensure();
  if (useRedirect()) {
    const { signInWithRedirect } = await import(`${FB}/firebase-auth.js`);
    await signInWithRedirect(auth, provider);
    return;
  }
  const { signInWithPopup, signInWithRedirect } = await import(`${FB}/firebase-auth.js`);
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = err?.code || "";
    if (
      code === "auth/popup-blocked" ||
      code === "auth/operation-not-supported-in-this-environment" ||
      code === "auth/cancelled-popup-request"
    ) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export async function signOutCloud() {
  clearTimeout(pushTimer);
  activeUid = "";
  clearAccess();
  if (unsub) unsub();
  unsub = null;
  listening = false;
  const { auth } = await ensure();
  const { signOut } = await import(`${FB}/firebase-auth.js`);
  await signOut(auth);
}

export async function fetchAllowlist() {
  const { db, fs } = await ensure();
  const snap = await fs.getDocs(fs.collection(db, "allowlist"));
  return snap.docs.map((item) => item.id).sort();
}

export async function grantEmail(raw) {
  const email = normalizeEmail(raw);
  if (!email) {
    const error = new Error("correo");
    error.code = "invalid-email";
    throw error;
  }
  const { db, fs } = await ensure();
  await fs.setDoc(fs.doc(db, "allowlist", email), {
    email,
    addedAt: fs.serverTimestamp(),
  });
  return email;
}

export async function revokeEmail(raw) {
  const email = normalizeEmail(raw);
  if (!email) return;
  if (email === adminEmail()) {
    const error = new Error("admin");
    error.code = "admin-email";
    throw error;
  }
  const { db, fs } = await ensure();
  await fs.deleteDoc(fs.doc(db, "allowlist", email));
}

export { ADMIN_EMAIL };
