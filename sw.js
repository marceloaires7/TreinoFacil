/* ===========================================================
   TreinoFácil — Service Worker
   Faz cache do "app shell" para funcionar offline (requisito de PWA).
   -----------------------------------------------------------
   CORREÇÃO: as chamadas ao Make agora usam "network-first" (busca
   sempre o dado fresco; só cai no cache se você estiver offline).
   Antes, todo GET era "cache-first", então a leitura do Make ficava
   congelada na 1ª resposta e só atualizava com Ctrl+Shift+R.
   =========================================================== */
const CACHE = "treinofacil-v4"; // versão BUMPADA p/ limpar o cache antigo

const ASSETS = [
  "./",
  "./index.html",
  "./lista.html",
  "./cadastro.html",
  "./editar.html",
  "./sobre.html",
  "./css/style.css",
  "./js/db.js",
  "./js/ui.js",
  "./js/home.js",
  "./js/lista.js",
  "./js/form.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Instala e pré-carrega o app shell no cache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Remove caches antigos ao ativar (inclui a leitura velha do Make do cache v3)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return; // POST (create/update/delete) vai direto pra rede

  const url = new URL(event.request.url);

  // --- Chamadas ao Make: NETWORK-FIRST ---
  // Busca sempre o dado atualizado. Se a rede falhar (offline), usa a última
  // resposta guardada no cache, pra lista não ficar vazia sem internet.
  if (url.hostname.endsWith("make.com")) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => { });
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // --- App shell: CACHE-FIRST (offline + instalável) ---
  // ignoreSearch: true -> "editar.html?id=123" casa com o "editar.html" do cache.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => { });
          return resp;
        })
        .catch(() => {
          if (event.request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
    })
  );
});