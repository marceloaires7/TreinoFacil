/* ===========================================================
   TreinoFácil — UI compartilhada
   Injeta cabeçalho + menu lateral + navegação inferior em TODAS as páginas
   (num só lugar -> sem precisar repetir o menu em cada arquivo).
   Também provê: toast, modal de confirmação, registro do Service Worker.
   =========================================================== */

const ICONS = {
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>',
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M3 8.5v7M17.5 6.5v11M21 8.5v7M6.5 12h11"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  plusCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4 18 8M3 21l4-1 11-11-3-3L4 17l-1 4z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
};

const PAGES = {
  home:     { title: "TreinoFácil",       file: "index.html" },
  lista:    { title: "Meus Treinos",      file: "lista.html" },
  cadastro: { title: "Novo Exercício",    file: "cadastro.html" },
  editar:   { title: "Editar Exercício",  file: "editar.html" },
  sobre:    { title: "Sobre",             file: "sobre.html" },
};

const UI = (function () {

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildChrome(page) {
    const cur = PAGES[page] || PAGES.home;

    // Cabeçalho
    const header = document.createElement("header");
    header.className = "app-header";
    header.innerHTML =
      '<button class="icon-btn" id="menuBtn" aria-label="Abrir menu">' + ICONS.menu + "</button>" +
      "<h1>" + cur.title + "</h1>";
    document.body.insertBefore(header, document.body.firstChild);

    // Backdrop + Drawer
    const backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    backdrop.id = "backdrop";

    const drawer = document.createElement("aside");
    drawer.className = "drawer";
    drawer.id = "drawer";
    const link = (p, icon, label) =>
      '<a class="nav-link' + (page === p ? " active" : "") + '" href="' + PAGES[p].file + '">' +
      icon + "<span>" + label + "</span></a>";
    drawer.innerHTML =
      '<div class="drawer-head"><div class="brand">' +
        '<img src="icons/icon-192.png" alt="TreinoFácil">' +
        '<div><div class="brand-name">TreinoFácil</div>' +
        '<div class="brand-tag">Registre seus treinos</div></div>' +
      "</div></div>" +
      "<nav>" +
        link("home", ICONS.home, "Início") +
        link("lista", ICONS.dumbbell, "Meus Treinos") +
        link("cadastro", ICONS.plusCircle, "Adicionar Exercício") +
        link("sobre", ICONS.info, "Sobre o App") +
      "</nav>" +
      '<div class="drawer-foot">' +
        '<button class="btn-clear" id="clearBtn">' + ICONS.trash + " Apagar todos os dados</button>" +
      "</div>";
    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    // Navegação inferior
    const nav = document.createElement("nav");
    nav.className = "bottom-nav";
    const bn = (p, icon, label, extra) =>
      '<a class="' + (page === p ? "active " : "") + (extra || "") + '" href="' + PAGES[p].file + '">' +
      icon + "<span>" + label + "</span></a>";
    nav.innerHTML =
      bn("home", ICONS.home, "Início") +
      bn("lista", ICONS.dumbbell, "Treinos") +
      bn("cadastro", ICONS.plusCircle, "Novo", "fab-item") +
      bn("sobre", ICONS.info, "Sobre");
    document.body.appendChild(nav);

    // Container do toast
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.id = "toast";
    document.body.appendChild(toast);

    // Modal de confirmação
    const modal = document.createElement("div");
    modal.className = "modal-backdrop";
    modal.id = "modalBackdrop";
    modal.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true">' +
        '<div class="modal-icon">' + ICONS.alert + "</div>" +
        '<h3 id="modalTitle">Confirmar</h3>' +
        '<p id="modalMsg"></p>' +
        '<div class="modal-actions">' +
          '<button class="btn btn-ghost" id="modalCancel">Cancelar</button>' +
          '<button class="btn btn-danger" id="modalOk">Confirmar</button>' +
        "</div>" +
      "</div>";
    document.body.appendChild(modal);

    wireDrawer();
  }

  function wireDrawer() {
    const drawer = document.getElementById("drawer");
    const backdrop = document.getElementById("backdrop");
    const open = () => { drawer.classList.add("open"); backdrop.classList.add("open"); };
    const close = () => { drawer.classList.remove("open"); backdrop.classList.remove("open"); };
    document.getElementById("menuBtn").addEventListener("click", open);
    backdrop.addEventListener("click", close);

    document.getElementById("clearBtn").addEventListener("click", () => {
      close();
      confirmDialog({
        title: "Apagar todos os dados?",
        message: "Todos os exercícios cadastrados serão removidos. Esta ação não pode ser desfeita.",
        confirmText: "Apagar tudo",
        onConfirm: () => {
          TreinoDB.clearAll();
          toast("Dados apagados");
          setTimeout(() => location.reload(), 600);
        },
      });
    });
  }

  let _toastTimer;
  function toast(msg, type) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.className = "toast" + (type ? " " + type : "");
    el.innerHTML = (type === "success" ? ICONS.check : "") + "<span>" + escapeHtml(msg) + "</span>";
    el.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function confirmDialog(opts) {
    const back = document.getElementById("modalBackdrop");
    document.getElementById("modalTitle").textContent = opts.title || "Confirmar";
    document.getElementById("modalMsg").textContent = opts.message || "";
    const ok = document.getElementById("modalOk");
    const cancel = document.getElementById("modalCancel");
    ok.textContent = opts.confirmText || "Confirmar";

    const close = () => back.classList.remove("open");
    const onOk = () => { close(); cleanup(); if (opts.onConfirm) opts.onConfirm(); };
    const onCancel = () => { close(); cleanup(); };
    const onBack = (e) => { if (e.target === back) onCancel(); };
    function cleanup() {
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      back.removeEventListener("click", onBack);
    }
    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    back.addEventListener("click", onBack);
    back.classList.add("open");
  }

  function registerSW() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  function init() {
    const page = document.body.getAttribute("data-page") || "home";
    buildChrome(page);
    registerSW();
  }

  document.addEventListener("DOMContentLoaded", init);

  return { toast, confirmDialog, escapeHtml, ICONS };
})();
