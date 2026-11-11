import { useEffect } from "react";
import { syncEngine } from "@/lib/sync/syncEngine";
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(registration => {
        console.log("✓ Service Worker registered with scope:", registration.scope);
        // Listen for messages from Service Worker (e.g. background sync triggers)
        navigator.serviceWorker.addEventListener("message", event => {
          if (event.data?.type === "TRIGGER_BACKGROUND_SYNC") {
            console.log("⚡ Service Worker triggered background sync");
            syncEngine.triggerSync();
          }
        });
      }).catch(error => {
        console.error("Service Worker registration failed:", error);
      });
    }
  }, []);
  return null;
}
