/* ===========================================================
   TreinoFácil — Camada de dados (CRUD) via Make (Integromat) + Google Sheets
   Substitui o localStorage por chamadas aos 4 webhooks do Make.
   -----------------------------------------------------------
   >>> COLE ABAIXO AS 4 URLs DOS SEUS WEBHOOKS DO MAKE <<<
   (cada cenário do Make começa num módulo "Custom webhook", que te dá a URL)
   =========================================================== */

const MAKE = {
  READ: "https://hook.us2.make.com/p8h156kf5ni69i7wsadyw3mumshb4i87",
  CREATE: "https://hook.us2.make.com/mdngitwfrsne8poyckvngxk4fwnvcur3",
  UPDATE: "https://hook.us2.make.com/c1pfutioec826ap68m5v2e1hrx3tbxup",
  DELETE: "https://hook.us2.make.com/fqxnnv0e4do67kganhgjiylxu3afbnfn",
};

const GRUPOS = ["Peito", "Costas", "Pernas", "Ombros", "Bíceps", "Tríceps", "Abdômen", "Cardio"];
const TREINOS = ["Treino A", "Treino B", "Treino C", "Treino D", "Treino E"];

const TreinoDB = (function () {
  let _items = []; // cache em memória — preenchido por load()

  /* POST sem disparar preflight de CORS (form-urlencoded é "simple request").
     O Make recebe cada campo já separado, pronto pra mapear na planilha. */
  async function _post(url, obj) {
    const body = new URLSearchParams(obj).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body,
    });
    if (!res.ok) throw new Error("Falha na requisição (" + res.status + ")");
    return res;
  }

  function _id() {
    return "ex_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function _normalize(e) {
    return {
      id: e.id,
      nome: e.nome,
      grupo: e.grupo,
      dia: e.dia,
      series: Number(e.series) || 0,
      repeticoes: Number(e.repeticoes) || 0,
      carga: Number(e.carga) || 0,
      obs: e.obs || "",
      criadoEm: e.criadoEm || "",
    };
  }

  /* LOAD — busca todos os registros no Make e preenche o cache.
     IMPORTANTE: chame com "await" antes de renderizar cada tela. */
  /* Traduz linha por posição (0,1,2...) caso o Make não devolva chaves nomeadas */
  function _fromRow(e) {
    if (e && e.id === undefined && e["0"] !== undefined) {
      return {
        id: e["0"], nome: e["1"], grupo: e["2"], dia: e["3"],
        series: e["4"], repeticoes: e["5"], carga: e["6"],
        obs: e["7"], criadoEm: e["8"],
      };
    }
    return e;
  }

  async function load() {
    const res = await fetch(MAKE.READ, { method: "GET" });
    if (!res.ok) throw new Error("Falha ao ler dados (" + res.status + ")");
    let data = [];
    try { data = await res.json(); } catch (e) { data = []; }
    if (!Array.isArray(data)) data = (data && data.exercicios) || [];
    _items = data.map(_fromRow).map(_normalize);
    return _items;
  }

  /* READ — a partir do cache (sem rede), igual à versão antiga */
  function getAll() {
    return _items.slice();
  }
  function get(id) { return _items.find((e) => e.id === id) || null; }
  function count() { return _items.length; }

  /* CREATE — gera id/criadoEm no cliente, envia ao Make e atualiza o cache */
  async function create(data) {
    const item = _normalize({ ...data, id: _id(), criadoEm: new Date().toISOString() });
    await _post(MAKE.CREATE, item);
    _items.push(item);
    return item;
  }

  /* UPDATE */
  async function update(id, data) {
    const item = _normalize({ ...data, id: id });
    await _post(MAKE.UPDATE, item);
    const i = _items.findIndex((e) => e.id === id);
    if (i >= 0) _items[i] = { ..._items[i], ...item };
    return item;
  }

  /* DELETE */
  async function remove(id) {
    await _post(MAKE.DELETE, { id: id });
    _items = _items.filter((e) => e.id !== id);
    return true;
  }

  /* Apaga todos — limpa o cache na hora e remove cada linha no Make em 2º plano */
  function clearAll() {
    const ids = _items.map((e) => e.id);
    _items = [];
    ids.forEach((id) => { _post(MAKE.DELETE, { id: id }).catch(() => { }); });
  }

  /* Exemplos para demonstração (botão do estado vazio) */
  async function loadSamples() {
    const samples = [
      { nome: "Supino reto", grupo: "Peito", dia: "Segunda", series: 4, repeticoes: 12, carga: 40, obs: "Aquecer antes" },
      { nome: "Agachamento livre", grupo: "Pernas", dia: "Quarta", series: 4, repeticoes: 10, carga: 60, obs: "" },
      { nome: "Puxada frontal", grupo: "Costas", dia: "Sexta", series: 3, repeticoes: 12, carga: 50, obs: "Pegada aberta" },
    ];
    for (const s of samples) { await create(s); }
  }

  return { load, getAll, get, count, create, update, remove, clearAll, loadSamples };
})();
