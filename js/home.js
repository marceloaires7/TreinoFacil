/* ===========================================================
   TreinoFácil — Tela Home (boas-vindas + resumo)
   Inclui filtro por dia da semana: os cards de números e a lista
   abaixo são recalculados conforme o dia escolhido.
   =========================================================== */
(function () {
  let filtroTreino = ""; // "" = todos os treinos

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const root = document.getElementById("homeContent");
    if (!root) return;

    root.innerHTML =
      '<div class="hero">' +
      "<h2>Bora treinar? 💪</h2>" +
      "<p>Registre seus exercícios, séries e cargas e acompanhe sua evolução em um só lugar.</p>" +
      "</div>" +
      '<div class="home-filter">' +
      '<label for="homeTreino">' + UI.ICONS.dumbbell + "Treino</label>" +
      '<select id="homeTreino"><option value="">Todos os treinos</option>' +
      TREINOS.map((t) => '<option value="' + t + '">' + t + "</option>").join("") +
      "</select>" +
      "</div>" +
      '<div id="homeStats"></div>' +
      '<a class="btn btn-primary btn-block" href="cadastro.html">' + UI.ICONS.plus + " Adicionar exercício</a>" +
      '<div id="homeList"></div>';

    document.getElementById("homeTreino").addEventListener("change", (e) => {
      filtroTreino = e.target.value;
      update();
    });

    try { await TreinoDB.load(); } catch (e) { UI.toast("Erro ao carregar dados"); }
    update();
  }

  function getFiltrados() {
    const all = TreinoDB.getAll();
    return filtroTreino ? all.filter((e) => e.dia === filtroTreino) : all;
  }

  function update() {
    renderStats();
    renderList();
  }

  function stat(num, lbl) {
    return '<div class="stat"><div class="num">' + num + '</div><div class="lbl">' + lbl + "</div></div>";
  }

  function renderStats() {
    const itens = getFiltrados();
    const grupos = new Set(itens.map((e) => e.grupo));
    const carga = itens.reduce((s, e) => s + (Number(e.carga) || 0), 0);

    let card1, card2;
    if (filtroTreino) {
      const series = itens.reduce((s, e) => s + (Number(e.series) || 0), 0);
      card1 = stat(itens.length, "Exercícios no treino");
      card2 = stat(series, "Séries no treino");
    } else {
      const treinos = new Set(itens.map((e) => e.dia));
      card1 = stat(itens.length, "Exercícios cadastrados");
      card2 = stat(treinos.size, "Treinos");
    }

    document.getElementById("homeStats").innerHTML =
      '<div class="stats-grid">' +
      card1 +
      card2 +
      stat(grupos.size, "Grupos musculares") +
      stat(carga, "Carga total (kg)") +
      "</div>";
  }

  function renderList() {
    const root = document.getElementById("homeList");
    const itens = getFiltrados();

    if (itens.length === 0) {
      root.innerHTML =
        '<div class="empty" style="margin-top:10px">' +
        UI.ICONS.dumbbell +
        "<h3>" + (filtroTreino ? "Nenhum exercício em " + filtroTreino : "Nenhum treino ainda") + "</h3>" +
        "<p>" + (filtroTreino ? "Cadastre um exercício para este treino." : "Comece adicionando seu primeiro exercício.") + "</p>" +
        "</div>";
      return;
    }

    // Sem filtro: mostra os 3 primeiros (na ordem da planilha). Com filtro: todos do treino.
    let lista;
    let label;
    if (filtroTreino) {
      lista = itens; // já vem na ordem da planilha
      label = "Exercícios do " + filtroTreino;
    } else {
      lista = itens.slice(0, 3); // primeiros da planilha
      label = "Seus exercícios";
    }

    let html = '<div class="section-label">' + label + "</div>";
    lista.forEach((e) => {
      html +=
        '<div class="card ex-card">' +
        '<div class="ex-head"><div class="ex-name">' + UI.escapeHtml(e.nome) + "</div>" +
        '<span class="badge">' + UI.escapeHtml(e.grupo) + "</span></div>" +
        '<div class="ex-day">' + UI.ICONS.dumbbell + UI.escapeHtml(e.dia) + "</div>" +
        '<div class="ex-stats">' +
        '<div class="s"><div class="v">' + e.series + "×" + e.repeticoes + '</div><div class="k">Séries × Reps</div></div>' +
        '<div class="s"><div class="v">' + e.carga + ' kg</div><div class="k">Carga</div></div>' +
        "</div>" +
        "</div>";
    });
    html += '<a class="btn btn-outline btn-block" style="margin-top:12px" href="lista.html">Ver todos os treinos</a>';
    root.innerHTML = html;
  }
})();