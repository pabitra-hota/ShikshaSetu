const CACHE_NAME = "shikshasetu-shell-v5";
const MODELS_CACHE = "shikshasetu-models-v1";

const SHELL_ASSETS = [
  "/",
  "/dashboard",
  "/attendance",
  "/timetable",
  "/classes",
  "/students",
  "/sync",
  "/reports",
  "/manifest.json",
  "/favicon.ico",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[ServiceWorker] Pre-caching offline app shell");
      return cache.addAll(SHELL_ASSETS).catch((err) => {
        console.warn("[ServiceWorker] Some shell assets could not be pre-cached:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME && cache !== MODELS_CACHE) {
            console.log("[ServiceWorker] Clearing legacy cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Never cache sensitive server API calls directly in SW
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // 2. Cache-First for AI Neural Network Model Weights (/models/*)
  if (url.pathname.startsWith("/models/")) {
    event.respondWith(
      caches.open(MODELS_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) return cachedResponse;
        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return new Response("Model file offline unavailable", { status: 503 });
        }
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate for static assets & App Shell
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            event.request.method === "GET"
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and request is page navigation, return cached app shell
          if (event.request.mode === "navigate") {
            return caches.match("/");
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Background Sync handler
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-attendance") {
    console.log("[ServiceWorker] Background Sync event triggered: sync-attendance");
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "TRIGGER_BACKGROUND_SYNC" });
        });
      })
    );
  }
});
