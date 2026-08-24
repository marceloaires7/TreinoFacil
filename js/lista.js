/* ===========================================================
   TreinoFácil — Tela de Listagem (READ) + Excluir (DELETE)
   Inclui busca por nome e filtro por grupo muscular.
   =========================================================== */
(function () {
  let termo = "";
  let filtroGrupo = "";
  let filtroTreino = "";

  document.addEventListener("DOMContentLoaded", async () => {
    montarToolbar();
    try { await TreinoDB.load(); } catch (e) { UI.toast("Erro ao carregar dados"); }
    render();
  });

  function montarToolbar() {
    const tb = document.getElementById("toolbar");
    if (!tb) return;
    tb.innerHTML =
      '<div class="search">' + UI.ICONS.search +
      '<input id="busca" type="search" placeholder="Buscar exercício..." autocomplete="off"></div>' +
      '<select id="filtroGrupo"><option value="">Todos os grupos</option>' +
      GRUPOS.map((g) => '<option value="' + g + '">' + g + "</option>").join("") +
      "</select>" +
      '<select id="filtroTreino"><option value="">Todos os treinos</option>' +
      TREINOS.map((t) => '<option value="' + t + '">' + t + "</option>").join("") +
      "</select>";
    document.getElementById("busca").addEventListener("input", (e) => {
      termo = e.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById("filtroGrupo").addEventListener("change", (e) => {
      filtroGrupo = e.target.value;
      render();
    });
    document.getElementById("filtroTreino").addEventListener("change", (e) => {
      filtroTreino = e.target.value;
      render();
    });
  }

  function render() {
    const root = document.getElementById("listaContent");
    if (!root) return;

    let itens = TreinoDB.getAll();
    if (filtroGrupo) itens = itens.filter((e) => e.grupo === filtroGrupo);
    if (filtroTreino) itens = itens.filter((e) => e.dia === filtroTreino);
    if (termo) itens = itens.filter((e) => (e.nome || "").toLowerCase().includes(termo));

    if (TreinoDB.count() === 0) {
      root.innerHTML =
        '<div class="empty">' + UI.ICONS.dumbbell +
        "<h3>Sua lista está vazia</h3>" +
        "<p>Cadastre seu primeiro exercício para começar.</p>" +
        '<a class="btn btn-primary" href="cadastro.html">' + UI.ICONS.plus + " Adicionar exercício</a>" +
        '<div style="margin-top:12px"><button class="btn btn-ghost" id="seedBtn">Carregar exemplos</button></div>' +
        "</div>";
      const seed = document.getElementById("seedBtn");
      if (seed) seed.addEventListener("click", async () => { try { await TreinoDB.loadSamples(); UI.toast("Exemplos carregados", "success"); } catch (e) { UI.toast("Erro ao carregar exemplos"); } render(); });
      return;
    }

    if (itens.length === 0) {
      root.innerHTML = '<div class="empty">' + UI.ICONS.search + "<h3>Nada encontrado</h3><p>Tente outro termo ou filtro.</p></div>";
      return;
    }

    root.innerHTML = itens.map(cardHTML).join("");

    // Liga os botões de editar/excluir
    root.querySelectorAll("[data-edit]").forEach((b) =>
      b.addEventListener("click", () => { location.href = "editar.html?id=" + encodeURIComponent(b.getAttribute("data-edit")); })
    );
    root.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", () => pedirExclusao(b.getAttribute("data-del")))
    );
  }

  function cardHTML(e) {
    const obs = e.obs ? '<div class="ex-obs">' + UI.escapeHtml(e.obs) + "</div>" : "";
    return (
      '<div class="card ex-card">' +
      '<div class="ex-head"><div class="ex-name">' + UI.escapeHtml(e.nome) + "</div>" +
      '<span class="badge">' + UI.escapeHtml(e.grupo) + "</span></div>" +
      '<div class="ex-day">' + UI.ICONS.dumbbell + UI.escapeHtml(e.dia) + "</div>" +
      '<div class="ex-stats">' +
      '<div class="s"><div class="v">' + e.series + "×" + e.repeticoes + '</div><div class="k">Séries × Reps</div></div>' +
      '<div class="s"><div class="v">' + e.carga + ' kg</div><div class="k">Carga</div></div>' +
      "</div>" +
      obs +
      '<div class="ex-actions">' +
      '<button class="btn btn-outline" data-edit="' + e.id + '">' + UI.ICONS.edit + " Editar</button>" +
      '<button class="btn btn-danger-soft" data-del="' + e.id + '">' + UI.ICONS.trash + " Excluir</button>" +
      "</div>" +
      "</div>"
    );
  }

  function pedirExclusao(id) {
    const ex = TreinoDB.get(id);
    if (!ex) return;
    UI.confirmDialog({
      title: "Excluir exercício?",
      message: 'Tem certeza que deseja excluir "' + ex.nome + '"? Esta ação não pode ser desfeita.',
      confirmText: "Excluir",
      onConfirm: async () => {
        try { await TreinoDB.remove(id); UI.toast("Exercício excluído", "success"); }
        catch (e) { UI.toast("Erro ao excluir"); }
        render();
      },
    });
  }
})();