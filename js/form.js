/* ===========================================================
   TreinoFácil — Formulário (CREATE e UPDATE)
   O mesmo script serve para Cadastro (cria) e Edição (atualiza),
   decidido por body[data-page] e pelo parâmetro ?id= da URL.
   =========================================================== */
(function () {
  let editId = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    const form = document.getElementById("exForm");
    if (!form) return;

    preencherSelects();

    const page = document.body.getAttribute("data-page");
    if (page === "editar") {
      editId = new URLSearchParams(location.search).get("id");
      try { await TreinoDB.load(); } catch (e) { }
      const ex = editId && TreinoDB.get(editId);
      if (!ex) {
        UI.toast("Registro não encontrado");
        setTimeout(() => (location.href = "lista.html"), 800);
        return;
      }
      preencher(ex);
    }

    form.addEventListener("submit", onSubmit);
  }

  function preencherSelects() {
    const grupo = document.getElementById("f-grupo");
    const dia = document.getElementById("f-dia");
    grupo.insertAdjacentHTML("beforeend", GRUPOS.map((g) => '<option value="' + g + '">' + g + "</option>").join(""));
    dia.insertAdjacentHTML("beforeend", TREINOS.map((t) => '<option value="' + t + '">' + t + "</option>").join(""));
  }

  function preencher(ex) {
    document.getElementById("f-nome").value = ex.nome;
    document.getElementById("f-grupo").value = ex.grupo;
    document.getElementById("f-dia").value = ex.dia;
    document.getElementById("f-series").value = ex.series;
    document.getElementById("f-repeticoes").value = ex.repeticoes;
    document.getElementById("f-carga").value = ex.carga;
    document.getElementById("f-obs").value = ex.obs || "";
  }

  function setErro(id, msg) {
    const field = document.getElementById(id).closest(".field");
    field.classList.add("invalid");
    const err = field.querySelector(".err");
    if (err && msg) err.textContent = msg;
  }

  function limparErros() {
    document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
  }

  async function onSubmit(e) {
    e.preventDefault();
    limparErros();

    const data = {
      nome: document.getElementById("f-nome").value.trim(),
      grupo: document.getElementById("f-grupo").value,
      dia: document.getElementById("f-dia").value,
      series: document.getElementById("f-series").value,
      repeticoes: document.getElementById("f-repeticoes").value,
      carga: document.getElementById("f-carga").value,
      obs: document.getElementById("f-obs").value.trim(),
    };

    let ok = true;
    if (!data.nome) { setErro("f-nome", "Informe o nome do exercício."); ok = false; }
    if (!data.grupo) { setErro("f-grupo", "Selecione o grupo muscular."); ok = false; }
    if (!data.dia) { setErro("f-dia", "Selecione o treino."); ok = false; }
    if (!data.series || Number(data.series) < 1) { setErro("f-series", "Mínimo 1."); ok = false; }
    if (!data.repeticoes || Number(data.repeticoes) < 1) { setErro("f-repeticoes", "Mínimo 1."); ok = false; }
    if (data.carga === "" || Number(data.carga) < 0) { setErro("f-carga", "Valor inválido."); ok = false; }
    if (!ok) return;

    const btn = document.querySelector('#exForm button[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      if (editId) {
        await TreinoDB.update(editId, data);
        UI.toast("Alterações salvas!", "success");
      } else {
        await TreinoDB.create(data);
        UI.toast("Exercício salvo!", "success");
      }
      setTimeout(() => (location.href = "lista.html"), 700);
    } catch (err) {
      UI.toast("Erro ao salvar. Verifique a conexão / o Make.");
      if (btn) btn.disabled = false;
    }
  }
})();