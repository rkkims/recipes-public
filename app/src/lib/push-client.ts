/**
 * Asking for notification permission, at the one moment §12 allows it.
 *
 * *"Only ever from a user-initiated pin. Never re-engagement, never 'new
 * recipes this week', never anything the user did not personally ask for by
 * pinning. Ask at the FIRST pin, never before. At that moment the ask has a
 * visible reason attached and the user has just demonstrated the need."*
 *
 * ── The permission is spent once ──────────────────────────────────────────
 *
 * A denied notification permission cannot be asked for again — the browser
 * remembers, and on iOS the only way back is deleting and re-adding the app.
 * So every guard here is about not spending it: never on a first pin that is
 * also a first visit, never twice, never anywhere except immediately after the
 * pin that justifies it.
 *
 * ── iOS needs the home screen first ───────────────────────────────────────
 *
 * Safari refuses web push entirely unless the app has been installed. §12 names
 * the real sequence — **pin → install → permission** — so on an uninstalled iOS
 * device this returns quietly rather than asking for something the browser will
 * refuse. The install prompt is what moves them along; this simply waits.
 */
import { savePushSub } from "@/app/actions";

const ASKED = "push-asked";

/**
 * base64url → the bytes `pushManager.subscribe` insists on.
 *
 * Built on an explicit `ArrayBuffer` rather than `Uint8Array.from`: the DOM type
 * requires a view over a plain ArrayBuffer, and the inferred `ArrayBufferLike`
 * includes `SharedArrayBuffer`, which it will not accept.
 */
function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function installedOnIos(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!ios) return true;                       // not iOS: no install requirement
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * Offer notifications, once, after a pin. Returns whether a subscription now
 * exists — callers use it only to decide what to say, never to retry.
 */
export async function offerReminders(publicKey: string): Promise<boolean> {
  if (!publicKey) return false;                                  // not configured
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  if (typeof Notification === "undefined") return false;

  // Already answered, either way. `denied` is final and must never be re-asked.
  if (Notification.permission === "denied") return false;
  try { if (localStorage.getItem(ASKED)) return Notification.permission === "granted"; }
  catch { /* no storage: fall through and rely on the browser's own memory */ }

  if (!installedOnIos()) return false;         // pin → install → permission

  try { localStorage.setItem(ASKED, "1"); } catch { /* fine */ }

  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();
  if (permission !== "granted") return false;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? await reg.pushManager.subscribe({
    // Required by every browser: a push that cannot be shown must not be sent.
    userVisibleOnly: true,
    applicationServerKey: toBytes(publicKey),
  });

  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
  if (!json.endpoint || !json.keys) return false;
  const r = await savePushSub({ endpoint: json.endpoint, keys: json.keys });
  return r.ok;
}
