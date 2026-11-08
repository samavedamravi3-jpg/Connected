"use client";
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

// Chrome/Android fire `beforeinstallprompt`; iOS Safari has no prompt API, so we show a one-time tip instead.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const DISMISS_KEY = "connected-install-dismissed";

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
}
function writeDismissed() {
  try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private mode: just hide for this visit */ }
}

/** Registers the service worker (production only) and offers "Add to Home Screen" when it makes sense. */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [iosTip, setIosTip] = useState(false);

  useEffect(() => {
    // In dev the worker would cache Vite modules and fight hot reload, so only register in production builds.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || readDismissed()) return;

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    // Wait a moment so the tip never covers the first screen the person sees.
    const t = isIOS && isSafari ? window.setTimeout(() => setIosTip(true), 4000) : undefined;
    const onInstalled = () => { setDeferred(null); setIosTip(false); writeDismissed(); };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) window.clearTimeout(t);
    };
  }, []);

  const dismiss = () => { setDeferred(null); setIosTip(false); writeDismissed(); };

  if (deferred)
    return (
      <div className="install-banner" role="region" aria-label="Install Connected">
        <img src="/icons/icon-192.png" alt="" width={36} height={36} />
        <div><b>Get the Connected app</b><span>Full screen, one tap from your home screen.</span></div>
        <button
          className="button primary small"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            dismiss();
          }}
        >
          <Download size={15} /> Install
        </button>
        <button className="icon-button" aria-label="Not now" onClick={dismiss}><X size={16} /></button>
      </div>
    );

  if (iosTip)
    return (
      <div className="install-banner" role="region" aria-label="Add Connected to your home screen">
        <img src="/icons/icon-192.png" alt="" width={36} height={36} />
        <div>
          <b>Add Connected to your home screen</b>
          <span>Tap <Share size={13} aria-label="Share" /> then “Add to Home Screen”.</span>
        </div>
        <button className="icon-button" aria-label="Dismiss" onClick={dismiss}><X size={16} /></button>
      </div>
    );

  return null;
}
