/* ===========================================================
   TreinoFácil — Lógica do cliente
   -----------------------------------------------------------
   O app é uma única página: as telas são <section class="view">
   que aparecem e somem. Toda leitura/escrita vai por fetch()
   para o Apps Script, que grava na Planilha Google.
   =========================================================== */

/* -----------------------------------------------------------
   >>> COLE AQUI A URL DO SEU APP DA WEB DO APPS SCRIPT <<<
   É o endereço que termina em /exec, o mesmo de antes.
   Implantar > Gerenciar implantações > copiar a URL.
   ----------------------------------------------------------- */
const API = 'https://script.google.com/macros/s/AKfycbzmSp-gfCsYt1s7Vp_eKuEMsSDEZF8HGf7IvbsfSPpne9vSteDvv75nzSVxPPpSMBQQwA/exec';

/* Onde fica o último retrato da planilha, para o app abrir offline */
const CHAVE_CACHE = 'treinofacil:ultimosDados';

/* ---------- Ícones usados no conteúdo gerado por JS ---------- */
const ICONS = {
  dumbbell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M3 8.5v7M17.5 6.5v11M21 8.5v7M6.5 12h11"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4 18 8M3 21l4-1 11-11-3-3L4 17l-1 4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg>'
};


/* ===========================================================
   1) PONTE COM O SERVIDOR (Apps Script)
   Um POST só, sempre para a mesma URL, dizendo qual ação rodar.
   O servidor responde { ok: true, dados } ou { ok: false, erro }.
   -----------------------------------------------------------
   Detalhe importante: o Content-Type é 'text/plain'. Com
   'application/json' o navegador dispararia uma requisição de
   preflight (OPTIONS), que o Apps Script não responde — e a
   chamada morreria em erro de CORS. Com text/plain ela vira uma
   "simple request" e passa direto. O corpo continua sendo JSON.
   =========================================================== */
const Servidor = {
  async chamar(acao, ...args) {
    if (/^COLE_AQUI/.test(API)) {
      throw new Error('Falta configurar a URL do Apps Script no arquivo js/app.js.');
    }

    let resposta;
    try {
      resposta = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ acao: acao, args: args })
      });
    } catch (e) {
      throw new Error('Sem conexão com o servidor.');
    }

    if (!resposta.ok) throw new Error('Falha na conexão (' + resposta.status + ').');

    let corpo;
    try {
      corpo = await resposta.json();
    } catch (e) {
      // Acontece quando a implantação está privada: o Apps Script
      // devolve a página de login do Google em vez do JSON.
      throw new Error('Resposta inesperada do servidor. Confira se a implantação está como "Qualquer pessoa".');
    }

    if (!corpo.ok) throw new Error(corpo.erro || 'Erro no servidor.');
    return corpo.dados;
  }
};

/* -----------------------------------------------------------
   Retrato local, para o app abrir offline.
   Guarda só o que a tela precisa desenhar; gravar continua
   exigindo internet.
   ----------------------------------------------------------- */
const Retrato = {
  salvar(dados) {
    try { localStorage.setItem(CHAVE_CACHE, JSON.stringify(dados)); }
    catch (e) { /* modo privado ou cota cheia: seguir sem cache */ }
  },
  ler() {
    try {
      const bruto = localStorage.getItem(CHAVE_CACHE);
      return bruto ? JSON.parse(bruto) : null;
    } catch (e) {
      return null;
    }
  },
  /* Regrava o retrato a partir do estado atual do App. Chamado a cada
     troca de tela, então qualquer alteração salva entra no cache offline
     sem precisar lembrar de chamar isto em cada operação. */
  atualizar() {
    if (!App.diasSemana.length) return;      // ainda não carregou
    Retrato.salvar({
      grupos: App.grupos,
      treinos: App.treinos,
      diasSemana: App.diasSemana,
      exercicios: App.itens,
      agenda: App.agenda,
      feitos: App.feitos,
      semana: App.semana
    });
  }
};

/* Barra de progresso no topo — conta quantas chamadas estão no ar. */
let _pendentes = 0;
function ocupado(ligado) {
  _pendentes = Math.max(0, _pendentes + (ligado ? 1 : -1));
  document.getElementById('progresso').classList.toggle('ativo', _pendentes > 0);
}


/* ===========================================================
   2) ESTADO DO APP (cache em memória dos dados da planilha)
   =========================================================== */
const App = {
  grupos: [],
  treinos: [],
  diasSemana: [],
  itens: [],
  agenda: {},                       // { Segunda: 'Treino A', ... }
  feitos: [],                       // dias já concluídos NESTA semana
  semana: { chave: '', rotulo: '', hoje: '' },
  offline: false,                   // true = abriu sem rede, com o retrato salvo
  view: 'home',
  editId: null,
  filtroHome: '',
  busca: '',
  filtroGrupo: '',
  filtroTreino: ''
};

const VIEWS = {
  home: { titulo: 'TreinoFácil', secao: 'view-home' },
  agenda: { titulo: 'Agenda da Semana', secao: 'view-agenda' },
  lista: { titulo: 'Meus Treinos', secao: 'view-lista' },
  cadastro: { titulo: 'Novo Exercício', secao: 'view-form' },
  editar: { titulo: 'Editar Exercício', secao: 'view-form' },
  sobre: { titulo: 'Sobre', secao: 'view-sobre' }
};


/* ===========================================================
   3) UTILIDADES DE INTERFACE
   =========================================================== */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let _toastTimer;
function toast(msg, tipo) {
  const el = document.getElementById('toast');
  el.className = 'toast' + (tipo ? ' ' + tipo : '');
  el.innerHTML = (tipo === 'success' ? ICONS.check : '') + '<span>' + escapeHtml(msg) + '</span>';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function confirmar({ titulo, mensagem, textoOk, aoConfirmar }) {
  const back = document.getElementById('modalBackdrop');
  const ok = document.getElementById('modalOk');
  const cancelar = document.getElementById('modalCancel');

  document.getElementById('modalTitle').textContent = titulo || 'Confirmar';
  document.getElementById('modalMsg').textContent = mensagem || '';
  ok.textContent = textoOk || 'Confirmar';

  const fechar = () => {
    back.classList.remove('open');
    ok.removeEventListener('click', onOk);
    cancelar.removeEventListener('click', fechar);
    back.removeEventListener('click', onFundo);
  };
  const onOk = () => { fechar(); if (aoConfirmar) aoConfirmar(); };
  const onFundo = (ev) => { if (ev.target === back) fechar(); };

  ok.addEventListener('click', onOk);
  cancelar.addEventListener('click', fechar);
  back.addEventListener('click', onFundo);
  back.classList.add('open');
}

const carregandoHTML = (texto) =>
  '<div class="loading"><div class="spinner"></div><span>' + escapeHtml(texto) + '</span></div>';


/* ===========================================================
   4) NAVEGAÇÃO ENTRE AS TELAS
   =========================================================== */
function irPara(nome, id) {
  const destino = VIEWS[nome] ? nome : 'home';
  App.view = destino;

  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'));
  document.getElementById(VIEWS[destino].secao).classList.add('active');
  document.getElementById('tituloPagina').textContent = VIEWS[destino].titulo;

  // Destaque no menu lateral e na navegação inferior
  document.querySelectorAll('[data-ir]').forEach(el => {
    if (el.classList.contains('nav-link') || el.closest('.bottom-nav')) {
      el.classList.toggle('active', el.getAttribute('data-ir') === destino);
    }
  });

  document.getElementById('fab').hidden = (destino !== 'lista');
  Retrato.atualizar();
  fecharDrawer();
  window.scrollTo(0, 0);

  if (destino === 'home') renderHome();
  if (destino === 'agenda') renderAgenda();
  if (destino === 'lista') renderLista();
  if (destino === 'cadastro') abrirForm(null);
  if (destino === 'editar') abrirForm(id);
}


/* ===========================================================
   5) TELA: INÍCIO
   =========================================================== */
function itensDaHome() {
  return App.filtroHome ? App.itens.filter(e => e.dia === App.filtroHome) : App.itens;
}

function stat(numero, rotulo) {
  return '<div class="stat"><div class="num">' + numero + '</div>' +
    '<div class="lbl">' + rotulo + '</div></div>';
}

function renderHome() {
  renderHomeStats();
  renderHomeLista();
}

function renderHomeStats() {
  const itens = itensDaHome();
  const grupos = new Set(itens.map(e => e.grupo));
  const carga = itens.reduce((soma, e) => soma + (Number(e.carga) || 0), 0);

  let card1, card2;
  if (App.filtroHome) {
    const series = itens.reduce((soma, e) => soma + (Number(e.series) || 0), 0);
    card1 = stat(itens.length, 'Exercícios no treino');
    card2 = stat(series, 'Séries no treino');
  } else {
    card1 = stat(itens.length, 'Exercícios cadastrados');
    card2 = stat(new Set(itens.map(e => e.dia)).size, 'Treinos');
  }

  document.getElementById('homeStats').innerHTML =
    '<div class="stats-grid">' + card1 + card2 +
    stat(grupos.size, 'Grupos musculares') +
    stat(Math.round(carga * 10) / 10, 'Carga total (kg)') +
    '</div>';
}

function renderHomeLista() {
  const root = document.getElementById('homeList');
  const itens = itensDaHome();

  if (itens.length === 0) {
    root.innerHTML =
      '<div class="empty" style="margin-top:10px">' + ICONS.dumbbell +
      '<h3>' + (App.filtroHome ? 'Nenhum exercício em ' + escapeHtml(App.filtroHome) : 'Nenhum treino ainda') + '</h3>' +
      '<p>' + (App.filtroHome ? 'Cadastre um exercício para este treino.' : 'Comece adicionando seu primeiro exercício.') + '</p>' +
      '</div>';
    return;
  }

  const lista = App.filtroHome ? itens : itens.slice(0, 3);
  const rotulo = App.filtroHome ? 'Exercícios do ' + escapeHtml(App.filtroHome) : 'Seus exercícios';

  root.innerHTML =
    '<div class="section-label">' + rotulo + '</div>' +
    lista.map(e => cardHTML(e, false)).join('') +
    '<button class="btn btn-outline btn-block" style="margin-top:12px" data-ir="lista">Ver todos os treinos</button>';
}


/* ===========================================================
   6) TELA: AGENDA DA SEMANA + CHECKLIST
   Cada dia aponta para um treino do cadastro (ou Descanso).
   Os exercícios do dia são, de graça, os daquele treino.
   =========================================================== */
function renderAgenda() {
  renderAgendaResumo();
  renderAgendaDias();
}

/** Dias com treino marcado na agenda (Descanso não conta para o placar). */
function diasPlanejados() {
  return App.diasSemana.filter(dia => !!App.agenda[dia]);
}

function renderAgendaResumo() {
  const planejados = diasPlanejados();
  const feitos = planejados.filter(dia => App.feitos.indexOf(dia) >= 0);
  const pct = planejados.length ? Math.round((feitos.length / planejados.length) * 100) : 0;

  const placar = planejados.length === 0
    ? 'Nenhum treino agendado'
    : feitos.length + ' de ' + planejados.length +
    (planejados.length === 1 ? ' treino feito' : ' treinos feitos');

  document.getElementById('agendaResumo').innerHTML =
    '<div class="semana-card">' +
    '<div class="rotulo">Semana de ' + escapeHtml(App.semana.rotulo) + '</div>' +
    '<div class="placar">' + placar + '</div>' +
    '<div class="barra"><i style="width:' + pct + '%"></i></div>' +
    '</div>';
}

function renderAgendaDias() {
  const root = document.getElementById('agendaDias');
  root.innerHTML = App.diasSemana.map(cardDiaHTML).join('');

  root.querySelectorAll('[data-dia-treino]').forEach(select =>
    select.addEventListener('change', () =>
      trocarTreinoDoDia(select.getAttribute('data-dia-treino'), select.value))
  );
  root.querySelectorAll('[data-dia-feito]').forEach(botao =>
    botao.addEventListener('click', () => alternarFeito(botao.getAttribute('data-dia-feito')))
  );
}

function cardDiaHTML(dia) {
  const treino = App.agenda[dia] || '';
  const feito = App.feitos.indexOf(dia) >= 0;
  const ehHoje = App.semana.hoje === dia;

  const classes = ['dia-card'];
  if (treino) classes.push('treino');
  if (feito) classes.push('feito');
  if (ehHoje) classes.push('hoje');

  const opcoes = '<option value="">Descanso</option>' +
    App.treinos.map(t =>
      '<option value="' + escapeHtml(t) + '"' + (t === treino ? ' selected' : '') + '>' +
      escapeHtml(t) + '</option>').join('');

  // Quantos exercícios o treino do dia tem hoje no cadastro
  const quantos = treino ? App.itens.filter(e => e.dia === treino).length : 0;
  let meta;
  if (!treino) meta = 'Dia de descanso';
  else if (quantos === 0) meta = '<span class="alerta">Nenhum exercício cadastrado neste treino</span>';
  else meta = quantos + (quantos === 1 ? ' exercício' : ' exercícios');

  // Sem treino não há o que marcar como feito
  const botao = treino
    ? '<button class="check-btn" data-dia-feito="' + escapeHtml(dia) + '" ' +
    'aria-pressed="' + feito + '" ' +
    'aria-label="' + (feito ? 'Desmarcar' : 'Marcar') + ' ' + escapeHtml(dia) + ' como feito">' +
    ICONS.check + '</button>'
    : '';

  return '<div class="' + classes.join(' ') + '">' +
    '<div class="dia-topo">' +
    '<div class="dia-nome">' + escapeHtml(dia) + '</div>' +
    (ehHoje ? '<span class="tag-hoje">hoje</span>' : '') +
    botao +
    '</div>' +
    '<select data-dia-treino="' + escapeHtml(dia) + '">' + opcoes + '</select>' +
    '<div class="dia-meta">' + meta + '</div>' +
    '</div>';
}

async function trocarTreinoDoDia(dia, treino) {
  const anterior = App.agenda[dia];
  App.agenda[dia] = treino;          // otimista: o select não "pula de volta"
  ocupado(true);
  try {
    const r = await Servidor.chamar('salvarAgenda', dia, treino);
    App.agenda = r.agenda;
    App.feitos = r.feitos;           // virar Descanso apaga a marcação do dia
  } catch (erro) {
    App.agenda[dia] = anterior;
    toast(erro.message);
  } finally {
    ocupado(false);
    renderAgenda();
  }
}

async function alternarFeito(dia) {
  const jaFeito = App.feitos.indexOf(dia) >= 0;
  const botao = document.querySelector('[data-dia-feito="' + dia + '"]');
  if (botao) botao.disabled = true;
  ocupado(true);
  try {
    App.feitos = await Servidor.chamar('marcarDia', dia, !jaFeito);
    if (!jaFeito) toast(dia + ' concluído!', 'success');
    renderAgenda();
  } catch (erro) {
    toast(erro.message);
    if (botao) botao.disabled = false;
  } finally {
    ocupado(false);
  }
}

function pedirReiniciarSemana() {
  confirmar({
    titulo: 'Reiniciar a semana?',
    mensagem: 'As marcações desta semana serão apagadas. A agenda e as semanas anteriores não mudam.',
    textoOk: 'Reiniciar',
    aoConfirmar: async () => {
      ocupado(true);
      try {
        App.feitos = await Servidor.chamar('reiniciarSemana');
        toast('Semana reiniciada', 'success');
        renderAgenda();
      } catch (erro) {
        toast(erro.message);
      } finally {
        ocupado(false);
      }
    }
  });
}


/* ===========================================================
   7) TELA: LISTAGEM (READ) + EXCLUSÃO (DELETE)
   =========================================================== */
function renderLista() {
  const root = document.getElementById('listaContent');

  let itens = App.itens;
  if (App.filtroGrupo) itens = itens.filter(e => e.grupo === App.filtroGrupo);
  if (App.filtroTreino) itens = itens.filter(e => e.dia === App.filtroTreino);
  if (App.busca) itens = itens.filter(e => (e.nome || '').toLowerCase().includes(App.busca));

  if (App.itens.length === 0) {
    root.innerHTML =
      '<div class="empty">' + ICONS.dumbbell +
      '<h3>Sua lista está vazia</h3>' +
      '<p>Cadastre seu primeiro exercício para começar.</p>' +
      '<button class="btn btn-primary" data-ir="cadastro">' + ICONS.plus + ' Adicionar exercício</button>' +
      '<div style="margin-top:12px"><button class="btn btn-ghost" id="btnExemplos">Carregar exemplos</button></div>' +
      '</div>';
    document.getElementById('btnExemplos').addEventListener('click', carregarExemplos);
    return;
  }

  if (itens.length === 0) {
    root.innerHTML =
      '<div class="empty">' + ICONS.search +
      '<h3>Nada encontrado</h3><p>Tente outro termo ou filtro.</p></div>';
    return;
  }

  root.innerHTML = itens.map(e => cardHTML(e, true)).join('');

  root.querySelectorAll('[data-editar]').forEach(botao =>
    botao.addEventListener('click', () => irPara('editar', botao.getAttribute('data-editar')))
  );
  root.querySelectorAll('[data-excluir]').forEach(botao =>
    botao.addEventListener('click', () => pedirExclusao(botao.getAttribute('data-excluir')))
  );
}

/** Cartão de exercício. Com ações (listagem) ou sem ações (home). */
function cardHTML(e, comAcoes) {
  const obs = e.obs ? '<div class="ex-obs">' + escapeHtml(e.obs) + '</div>' : '';

  // Só rende link http(s). Impede que um 'javascript:' gravado na planilha
  // à mão vire um link clicável aqui.
  const video = /^https?:\/\//i.test(e.link || '')
    ? '<div><a class="ex-video" href="' + escapeHtml(e.link) + '" target="_blank" rel="noopener noreferrer">' +
    ICONS.play + ' Ver vídeo</a></div>'
    : '';
  const acoes = comAcoes
    ? '<div class="ex-actions">' +
    '<button class="btn btn-outline" data-editar="' + escapeHtml(e.id) + '">' + ICONS.edit + ' Editar</button>' +
    '<button class="btn btn-danger-soft" data-excluir="' + escapeHtml(e.id) + '">' + ICONS.trash + ' Excluir</button>' +
    '</div>'
    : '';

  return '<div class="card ex-card">' +
    '<div class="ex-head"><div class="ex-name">' + escapeHtml(e.nome) + '</div>' +
    '<span class="badge">' + escapeHtml(e.grupo) + '</span></div>' +
    '<div class="ex-day">' + ICONS.dumbbell + escapeHtml(e.dia) + '</div>' +
    '<div class="ex-stats">' +
    '<div class="s"><div class="v">' + e.series + '×' + e.repeticoes + '</div>' +
    '<div class="k">Séries × Reps</div></div>' +
    '<div class="s"><div class="v">' + e.carga + ' kg</div><div class="k">Carga</div></div>' +
    '</div>' + obs + video + acoes +
    '</div>';
}

function pedirExclusao(id) {
  const ex = App.itens.find(e => e.id === id);
  if (!ex) return;

  confirmar({
    titulo: 'Excluir exercício?',
    mensagem: 'Tem certeza que deseja excluir "' + ex.nome + '"? Esta ação não pode ser desfeita.',
    textoOk: 'Excluir',
    aoConfirmar: async () => {
      ocupado(true);
      try {
        await Servidor.chamar('excluirExercicio', id);
        App.itens = App.itens.filter(e => e.id !== id);
        toast('Exercício excluído', 'success');
        renderLista();
      } catch (erro) {
        toast(erro.message);
      } finally {
        ocupado(false);
      }
    }
  });
}

async function carregarExemplos() {
  const botao = document.getElementById('btnExemplos');
  if (botao) botao.disabled = true;
  ocupado(true);
  try {
    App.itens = await Servidor.chamar('carregarExemplos');
    toast('Exemplos carregados', 'success');
    renderLista();
  } catch (erro) {
    toast(erro.message);
    if (botao) botao.disabled = false;
  } finally {
    ocupado(false);
  }
}


/* ===========================================================
   8) TELA: FORMULÁRIO (CREATE e UPDATE)
   A mesma tela cria e edita — quem decide é App.editId.
   =========================================================== */
function abrirForm(id) {
  const form = document.getElementById('exForm');
  limparErros();
  form.reset();

  App.editId = id || null;

  if (App.editId) {
    const ex = App.itens.find(e => e.id === App.editId);
    if (!ex) {
      toast('Registro não encontrado');
      irPara('lista');
      return;
    }
    document.getElementById('formTitulo').textContent = 'Editar Exercício';
    document.getElementById('formSub').textContent = 'Altere os dados e salve as mudanças.';
    document.getElementById('btnSalvar').textContent = 'Salvar alterações';
    preencherForm(ex);
  } else {
    document.getElementById('formTitulo').textContent = 'Novo Exercício';
    document.getElementById('formSub').textContent = 'Preencha os dados do exercício e salve.';
    document.getElementById('btnSalvar').textContent = 'Salvar exercício';
  }
}

function preencherForm(ex) {
  document.getElementById('f-nome').value = ex.nome;
  document.getElementById('f-grupo').value = ex.grupo;
  document.getElementById('f-dia').value = ex.dia;
  document.getElementById('f-series').value = ex.series;
  document.getElementById('f-repeticoes').value = ex.repeticoes;
  document.getElementById('f-carga').value = ex.carga;
  document.getElementById('f-obs').value = ex.obs || '';
  document.getElementById('f-link').value = ex.link || '';
}

function setErro(id, msg) {
  const campo = document.getElementById(id).closest('.field');
  campo.classList.add('invalid');
  const err = campo.querySelector('.err');
  if (err && msg) err.textContent = msg;
}

function limparErros() {
  document.querySelectorAll('.field.invalid').forEach(f => f.classList.remove('invalid'));
}

async function aoSalvar(ev) {
  ev.preventDefault();
  limparErros();

  const dados = {
    nome: document.getElementById('f-nome').value.trim(),
    grupo: document.getElementById('f-grupo').value,
    dia: document.getElementById('f-dia').value,
    series: document.getElementById('f-series').value,
    repeticoes: document.getElementById('f-repeticoes').value,
    carga: document.getElementById('f-carga').value,
    obs: document.getElementById('f-obs').value.trim(),
    link: document.getElementById('f-link').value.trim()
  };

  let ok = true;
  if (!dados.nome) { setErro('f-nome', 'Informe o nome do exercício.'); ok = false; }
  if (!dados.grupo) { setErro('f-grupo', 'Selecione o grupo muscular.'); ok = false; }
  if (!dados.dia) { setErro('f-dia', 'Selecione o treino.'); ok = false; }
  if (!dados.series || Number(dados.series) < 1) { setErro('f-series', 'Mínimo 1.'); ok = false; }
  if (!dados.repeticoes || Number(dados.repeticoes) < 1) { setErro('f-repeticoes', 'Mínimo 1.'); ok = false; }
  if (dados.carga === '' || Number(dados.carga) < 0) { setErro('f-carga', 'Valor inválido.'); ok = false; }
  if (dados.link && !/^https?:\/\/\S+$/i.test(dados.link)) {
    setErro('f-link', 'O link precisa começar com http:// ou https://.'); ok = false;
  }
  if (!ok) return;

  const botao = document.getElementById('btnSalvar');
  botao.disabled = true;
  ocupado(true);

  try {
    if (App.editId) {
      const salvo = await Servidor.chamar('atualizarExercicio', App.editId, dados);
      const i = App.itens.findIndex(e => e.id === App.editId);
      if (i >= 0) App.itens[i] = salvo;
      toast('Alterações salvas!', 'success');
    } else {
      const salvo = await Servidor.chamar('criarExercicio', dados);
      App.itens.push(salvo);
      toast('Exercício salvo!', 'success');
    }
    irPara('lista');
  } catch (erro) {
    toast(erro.message);
  } finally {
    botao.disabled = false;
    ocupado(false);
  }
}


/* ===========================================================
   9) MENU LATERAL
   =========================================================== */
function abrirDrawer() {
  document.getElementById('drawer').classList.add('open');
  document.getElementById('backdrop').classList.add('open');
}

function fecharDrawer() {
  document.getElementById('drawer').classList.remove('open');
  document.getElementById('backdrop').classList.remove('open');
}

function pedirApagarTudo() {
  fecharDrawer();
  confirmar({
    titulo: 'Apagar todos os dados?',
    mensagem: 'Todos os exercícios serão removidos da planilha. Esta ação não pode ser desfeita.',
    textoOk: 'Apagar tudo',
    aoConfirmar: async () => {
      ocupado(true);
      try {
        await Servidor.chamar('excluirTodos');
        App.itens = [];
        toast('Dados apagados', 'success');
        irPara('lista');
      } catch (erro) {
        toast(erro.message);
      } finally {
        ocupado(false);
      }
    }
  });
}


/* ===========================================================
  10) PARTIDA
   =========================================================== */
function opcoes(valores) {
  return valores.map(v => '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>').join('');
}

function preencherSelects() {
  const grupos = opcoes(App.grupos);
  const treinos = opcoes(App.treinos);
  document.getElementById('f-grupo').insertAdjacentHTML('beforeend', grupos);
  document.getElementById('filtroGrupo').insertAdjacentHTML('beforeend', grupos);
  document.getElementById('f-dia').insertAdjacentHTML('beforeend', treinos);
  document.getElementById('filtroTreino').insertAdjacentHTML('beforeend', treinos);
  document.getElementById('homeTreino').insertAdjacentHTML('beforeend', treinos);
}

function ligarEventos() {
  document.getElementById('menuBtn').addEventListener('click', abrirDrawer);
  document.getElementById('backdrop').addEventListener('click', fecharDrawer);
  document.getElementById('btnApagarTudo').addEventListener('click', pedirApagarTudo);
  document.getElementById('fab').addEventListener('click', () => irPara('cadastro'));
  document.getElementById('exForm').addEventListener('submit', aoSalvar);
  document.getElementById('btnReiniciar').addEventListener('click', pedirReiniciarSemana);

  // Qualquer elemento com data-ir navega — inclusive os criados por JS depois
  document.addEventListener('click', ev => {
    const alvo = ev.target.closest('[data-ir]');
    if (!alvo) return;
    ev.preventDefault();
    irPara(alvo.getAttribute('data-ir'));
  });

  document.getElementById('homeTreino').addEventListener('change', ev => {
    App.filtroHome = ev.target.value;
    renderHome();
  });
  document.getElementById('busca').addEventListener('input', ev => {
    App.busca = ev.target.value.trim().toLowerCase();
    renderLista();
  });
  document.getElementById('filtroGrupo').addEventListener('change', ev => {
    App.filtroGrupo = ev.target.value;
    renderLista();
  });
  document.getElementById('filtroTreino').addEventListener('change', ev => {
    App.filtroTreino = ev.target.value;
    renderLista();
  });
}

/** Joga o pacote do servidor (ou do retrato local) dentro do App. */
function aplicarDados(dados) {
  App.grupos = dados.grupos;
  App.treinos = dados.treinos;
  App.diasSemana = dados.diasSemana;
  App.itens = dados.exercicios;
  App.agenda = dados.agenda;
  App.feitos = dados.feitos;
  App.semana = dados.semana;
}

/** É o service worker que permite abrir o app sem internet. */
function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { });
  });
}

async function iniciar() {
  ligarEventos();
  registrarServiceWorker();

  // Mostra a home já com o indicador de carregamento
  document.getElementById('view-home').classList.add('active');
  document.getElementById('homeStats').innerHTML = carregandoHTML('Lendo os dados da planilha...');

  ocupado(true);
  try {
    const dados = await Servidor.chamar('carregarDados');
    aplicarDados(dados);
    Retrato.salvar(dados);
    preencherSelects();
    irPara('home');
  } catch (erro) {
    // Sem rede, mas com um retrato salvo: abre em modo leitura
    const salvo = Retrato.ler();
    if (salvo) {
      App.offline = true;
      aplicarDados(salvo);
      preencherSelects();
      document.getElementById('offlineAviso').hidden = false;
      irPara('home');
    } else {
      document.getElementById('homeStats').innerHTML =
        '<div class="erro-box"><strong>Não foi possível ler a planilha.</strong><br>' +
        escapeHtml(erro.message) + '</div>' +
        '<button class="btn btn-primary btn-block" id="btnTentarDeNovo">Tentar novamente</button>';
      document.getElementById('btnTentarDeNovo')
        .addEventListener('click', () => window.location.reload());
    }
  } finally {
    ocupado(false);
  }
}

document.addEventListener('DOMContentLoaded', iniciar);
