/* ===========================================================
   TreinoFácil — Service Worker
   Guarda o "app shell" (HTML, CSS, JS, ícones) para o app abrir
   mesmo sem internet. É ele, junto com o manifest.json, que faz
   o Android aceitar instalar o site como aplicativo.
   -----------------------------------------------------------
   Os dados em si NÃO passam por aqui: as chamadas ao Apps Script
   são POST para outro domínio, e Service Worker não guarda POST.
   Quem cuida do modo offline dos dados é o app.js, que salva o
   último retrato da planilha no localStorage.
   =========================================================== */

const CACHE = 'treinofacil-v2';

const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Baixa o app shell na instalação
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

// Apaga versões antigas do cache ao ativar
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;

  // POST/PUT e qualquer coisa de outro domínio (a API do Apps Script)
  // seguem direto para a rede, sem passar pelo cache.
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(req).then((emCache) => {
      if (emCache) return emCache;

      return fetch(req)
        .then((resposta) => {
          // Guarda o que for buscado com sucesso, para a próxima vez
          const copia = resposta.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copia)).catch(() => { });
          return resposta;
        })
        .catch(() => {
          // Offline e sem cache: se for navegação, devolve a página inicial
          if (req.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    })
  );
});
