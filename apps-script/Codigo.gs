/* ===========================================================
   TreinoFácil — Backend (Google Apps Script + Google Sheets)
   -----------------------------------------------------------
   Este arquivo é o SERVIDOR de dados do app:
     • doPost() -> recebe { acao, args } e devolve JSON
     • CRUD     -> lê e escreve direto na planilha
   Não existe Make, não existe Netlify, não existe webhook.
   A interface fica no GitHub Pages e conversa com estas
   funções por fetch().

   A planilha tem 3 abas, todas criadas automaticamente:
     • Exercicios -> o cadastro (1 linha por exercício)
     • Agenda     -> qual treino cai em cada dia da semana
     • Checklist  -> quais dias já foram feitos, semana a semana
   =========================================================== */

/* -----------------------------------------------------------
   CONFIGURAÇÃO
   -----------------------------------------------------------
   Se o script estiver VINCULADO à planilha (menu Extensões >
   Apps Script dentro do Sheets), deixe PLANILHA_ID vazio.
   Se for um projeto AVULSO, cole aqui o ID da planilha — é o
   trecho da URL entre /d/ e /edit.
   ----------------------------------------------------------- */
var PLANILHA_ID = '';

/* Endereço do app no GitHub Pages. Só é usado na página de aviso que
   aparece quando alguém abre a URL /exec direto no navegador. */
var URL_DO_APP = '';

var ABA = 'Exercicios';
var ABA_AGENDA = 'Agenda';
var ABA_CHECKLIST = 'Checklist';

var COLUNAS = ['id', 'nome', 'grupo', 'dia', 'series', 'repeticoes', 'carga', 'obs', 'criadoEm', 'link'];
var COLUNAS_AGENDA = ['dia', 'treino'];
var COLUNAS_CHECKLIST = ['semana', 'dia', 'feitoEm'];

var GRUPOS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Bíceps', 'Tríceps', 'Abdômen', 'Cardio'];
var TREINOS = ['Treino A', 'Treino B', 'Treino C', 'Treino D', 'Treino E'];
var DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];


/* ===========================================================
   1) A API JSON
   -----------------------------------------------------------
   Este script não serve mais a interface — quem faz isso é o
   GitHub Pages, para o app poder ter manifest.json e Service
   Worker (é o que dá o ícone próprio na tela inicial e a
   abertura sem as barras do navegador).

   Aqui ficou só o servidor de dados. O app manda um POST com
   { acao: 'criarExercicio', args: [ {...} ] } e recebe de volta
   { ok: true, dados: ... } ou { ok: false, erro: 'mensagem' }.
   =========================================================== */

/** Só estas funções podem ser chamadas de fora. */
function acoesPermitidas_() {
  return {
    carregarDados: carregarDados,
    listarExercicios: listarExercicios,
    criarExercicio: criarExercicio,
    atualizarExercicio: atualizarExercicio,
    excluirExercicio: excluirExercicio,
    excluirTodos: excluirTodos,
    carregarExemplos: carregarExemplos,
    salvarAgenda: salvarAgenda,
    marcarDia: marcarDia,
    reiniciarSemana: reiniciarSemana
  };
}

/** O app chama por POST. */
function doPost(e) {
  return responderJson_(function () {
    var corpo = {};
    try {
      corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (erro) {
      throw new Error('Corpo da requisição não é JSON válido.');
    }
    return executar_(corpo.acao, corpo.args);
  });
}

/**
 * GET serve para duas coisas:
 *   • sem parâmetro  -> página simples dizendo onde está o app
 *   • ?acao=listarExercicios -> testar a API direto no navegador
 */
function doGet(e) {
  var acao = (e && e.parameter && e.parameter.acao) || '';

  if (acao) {
    return responderJson_(function () {
      var args = [];
      if (e.parameter.args) {
        try { args = JSON.parse(e.parameter.args); }
        catch (erro) { throw new Error('O parâmetro "args" precisa ser um JSON válido.'); }
      }
      return executar_(acao, args);
    });
  }

  return paginaDeAviso_();
}

/** Roda a ação pedida, se ela estiver na lista permitida. */
function executar_(acao, args) {
  var permitidas = acoesPermitidas_();
  acao = String(acao || '');

  if (!Object.prototype.hasOwnProperty.call(permitidas, acao)) {
    throw new Error('Ação desconhecida: "' + acao + '".');
  }
  return permitidas[acao].apply(null, args || []);
}

/** Embrulha o resultado no formato { ok, dados } / { ok, erro }. */
function responderJson_(fn) {
  var corpo;
  try {
    corpo = { ok: true, dados: fn() };
  } catch (erro) {
    corpo = { ok: false, erro: (erro && erro.message) ? erro.message : String(erro) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(corpo))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Quem abrir a URL /exec no navegador cai aqui. */
function paginaDeAviso_() {
  var destino = URL_DO_APP
    ? '<p>O aplicativo está em:<br><a href="' + URL_DO_APP + '">' + URL_DO_APP + '</a></p>'
    : '<p>Preencha <code>URL_DO_APP</code> no Codigo.gs com o endereço do GitHub Pages.</p>';

  return HtmlService.createHtmlOutput(
    '<div style="font-family:system-ui,sans-serif;max-width:520px;margin:60px auto;' +
    'padding:0 20px;line-height:1.6;color:#1F2937">' +
    '<h2 style="color:#4338CA">TreinoFácil — API</h2>' +
    '<p>Este endereço é o <strong>servidor de dados</strong> do TreinoFácil, ' +
    'não a interface.</p>' + destino +
    '</div>'
  ).setTitle('TreinoFácil — API');
}


/* ===========================================================
   2) ACESSO À PLANILHA
   =========================================================== */

function getPlanilha_() {
  if (PLANILHA_ID) return SpreadsheetApp.openById(PLANILHA_ID);
  var ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (!ativa) {
    throw new Error(
      'Planilha não encontrada. Vincule o script a uma planilha ou preencha PLANILHA_ID no Codigo.gs.'
    );
  }
  return ativa;
}

/** Cria a aba (se faltar) e escreve o cabeçalho na primeira vez. */
function abaComCabecalho_(nome, colunas) {
  var ss = getPlanilha_();
  var aba = ss.getSheetByName(nome);

  if (!aba) aba = ss.insertSheet(nome);

  if (aba.getLastRow() === 0) {
    aba.getRange(1, 1, 1, colunas.length).setValues([colunas]).setFontWeight('bold');
    aba.setFrozenRows(1);
    return { aba: aba, nova: true };
  }
  return { aba: aba, nova: false };
}

/** Aba do cadastro de exercícios. */
function getAba_() {
  var r = abaComCabecalho_(ABA, COLUNAS);
  var aba = r.aba;

  if (r.nova) {
    // id, criadoEm e link como TEXTO puro, para o Sheets não converter
    // em número, data ou hyperlink automático
    aba.getRange(1, 1, aba.getMaxRows(), 1).setNumberFormat('@');
    aba.getRange(1, 9, aba.getMaxRows(), 2).setNumberFormat('@');
    aba.setColumnWidth(1, 130);
    aba.setColumnWidth(2, 200);
    aba.setColumnWidth(10, 240);
  } else {
    garantirColunas_(aba);
  }
  return aba;
}

/**
 * Planilha criada antes da coluna "link" tem só 9 colunas.
 * Completa o cabeçalho em vez de quebrar, para não perder dados.
 */
function garantirColunas_(aba) {
  var largura = aba.getLastColumn();
  if (largura >= COLUNAS.length) return;

  var faltam = COLUNAS.slice(largura);
  aba.getRange(1, largura + 1, 1, faltam.length).setValues([faltam]).setFontWeight('bold');
  aba.getRange(1, largura + 1, aba.getMaxRows(), faltam.length).setNumberFormat('@');
  aba.setColumnWidth(COLUNAS.length, 240);
}

/** Aba da agenda — nasce com os 7 dias, todos em Descanso. */
function getAbaAgenda_() {
  var r = abaComCabecalho_(ABA_AGENDA, COLUNAS_AGENDA);

  if (r.nova) {
    var linhas = DIAS_SEMANA.map(function (dia) { return [dia, '']; });
    r.aba.getRange(2, 1, linhas.length, COLUNAS_AGENDA.length).setValues(linhas);
    r.aba.setColumnWidth(1, 120);
    r.aba.setColumnWidth(2, 140);
  }
  return r.aba;
}

/** Aba do checklist — uma linha por dia concluído, com a semana a que pertence. */
function getAbaChecklist_() {
  var r = abaComCabecalho_(ABA_CHECKLIST, COLUNAS_CHECKLIST);

  if (r.nova) {
    r.aba.getRange(1, 1, r.aba.getMaxRows(), COLUNAS_CHECKLIST.length).setNumberFormat('@');
    r.aba.setColumnWidth(1, 120);
    r.aba.setColumnWidth(3, 150);
  }
  return r.aba;
}

/** Roda uma escrita com trava, para dois cliques simultâneos não corromperem a planilha. */
function comTrava_(fn) {
  var trava = LockService.getScriptLock();
  if (!trava.tryLock(20000)) {
    throw new Error('A planilha está ocupada. Tente novamente em alguns segundos.');
  }
  try {
    return fn();
  } finally {
    trava.releaseLock();
  }
}


/* ===========================================================
   3) CONVERSÃO LINHA <-> OBJETO
   =========================================================== */

function paraObjeto_(linha) {
  return {
    id: String(linha[0]).trim(),
    nome: String(linha[1]),
    grupo: String(linha[2]),
    dia: String(linha[3]),
    series: Number(linha[4]) || 0,
    repeticoes: Number(linha[5]) || 0,
    carga: Number(linha[6]) || 0,
    obs: String(linha[7] == null ? '' : linha[7]),
    criadoEm: comoTexto_(linha[8]),
    link: String(linha[9] == null ? '' : linha[9]).trim()
  };
}

function paraLinha_(item) {
  return [
    item.id, item.nome, item.grupo, item.dia,
    item.series, item.repeticoes, item.carga,
    item.obs, item.criadoEm, item.link
  ];
}

/** Se a célula virou Date no Sheets, devolve formatada; senão devolve o texto. */
function comoTexto_(valor) {
  if (!valor) return '';
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return String(valor);
}

function agora_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function novoId_() {
  return 'ex_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

/** Localiza a linha (1-based) de um id. Devolve -1 se não achar. */
function acharLinha_(aba, id) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return -1;
  var ids = aba.getRange(2, 1, ultima - 1, 1).getValues();
  var alvo = String(id).trim();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === alvo) return i + 2;
  }
  return -1;
}


/* ===========================================================
   4) A SEMANA CORRENTE
   O checklist se zera sozinho porque cada marcação guarda a
   segunda-feira da sua semana. Virou a semana, a chave muda e
   as marcações antigas simplesmente deixam de ser lidas —
   mas continuam na planilha como histórico.
   =========================================================== */

/** Segunda-feira da semana da data informada. */
function inicioDaSemana_(data) {
  var d = new Date(data.getTime());
  var diaDaSemana = d.getDay();                        // 0=Dom, 1=Seg ... 6=Sáb
  var recuo = (diaDaSemana === 0) ? -6 : 1 - diaDaSemana;
  d.setDate(d.getDate() + recuo);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Chave da semana atual, no formato 'aaaa-mm-dd' (ordenável). */
function chaveSemana_() {
  return Utilities.formatDate(inicioDaSemana_(new Date()), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Dados da semana para o cabeçalho da tela Agenda. */
function infoSemana_() {
  var tz = Session.getScriptTimeZone();
  var hoje = new Date();
  var inicio = inicioDaSemana_(hoje);
  var fim = new Date(inicio.getTime());
  fim.setDate(fim.getDate() + 6);

  return {
    chave: Utilities.formatDate(inicio, tz, 'yyyy-MM-dd'),
    rotulo: Utilities.formatDate(inicio, tz, 'dd/MM') + ' a ' + Utilities.formatDate(fim, tz, 'dd/MM'),
    hoje: DIAS_SEMANA[(hoje.getDay() + 6) % 7]         // converte 0=Dom para 0=Segunda
  };
}


/* ===========================================================
   5) VALIDAÇÃO (servidor também valida — não confie só no cliente)
   =========================================================== */

function validar_(dados) {
  dados = dados || {};
  var erros = [];

  var nome = String(dados.nome == null ? '' : dados.nome).trim();
  var grupo = String(dados.grupo == null ? '' : dados.grupo).trim();
  var dia = String(dados.dia == null ? '' : dados.dia).trim();
  var link = String(dados.link == null ? '' : dados.link).trim();
  var series = Number(dados.series);
  var repeticoes = Number(dados.repeticoes);
  var carga = Number(dados.carga);

  if (!nome) erros.push('Informe o nome do exercício.');
  if (GRUPOS.indexOf(grupo) < 0) erros.push('Grupo muscular inválido.');
  if (TREINOS.indexOf(dia) < 0) erros.push('Treino inválido.');
  if (!(series >= 1 && series <= 20)) erros.push('Séries deve ficar entre 1 e 20.');
  if (!(repeticoes >= 1 && repeticoes <= 100)) erros.push('Repetições deve ficar entre 1 e 100.');
  if (!(carga >= 0)) erros.push('Carga inválida.');
  if (link && !/^https?:\/\/[^\s]+$/i.test(link)) {
    erros.push('O link do vídeo precisa começar com http:// ou https://.');
  }

  if (erros.length) throw new Error(erros.join(' '));

  return {
    nome: nome.slice(0, 60),
    grupo: grupo,
    dia: dia,
    series: series,
    repeticoes: repeticoes,
    carga: carga,
    obs: String(dados.obs == null ? '' : dados.obs).trim().slice(0, 160),
    link: link.slice(0, 500)
  };
}


/* ===========================================================
   6) AS 4 OPERAÇÕES CRUD  (chamadas por google.script.run)
   =========================================================== */

/** Chamada única de abertura: tudo que o app precisa para desenhar as telas. */
function carregarDados() {
  return {
    grupos: GRUPOS,
    treinos: TREINOS,
    diasSemana: DIAS_SEMANA,
    exercicios: listarExercicios(),
    agenda: lerAgenda_(),
    feitos: lerFeitos_(),
    semana: infoSemana_()
  };
}

/** READ — devolve todos os exercícios da planilha. */
function listarExercicios() {
  var aba = getAba_();
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];

  return aba.getRange(2, 1, ultima - 1, COLUNAS.length)
    .getValues()
    .filter(function (linha) { return String(linha[0]).trim() !== ''; })
    .map(paraObjeto_);
}

/** CREATE — acrescenta uma linha nova e devolve o item salvo. */
function criarExercicio(dados) {
  var limpo = validar_(dados);
  return comTrava_(function () {
    var aba = getAba_();
    var item = {
      id: novoId_(),
      nome: limpo.nome,
      grupo: limpo.grupo,
      dia: limpo.dia,
      series: limpo.series,
      repeticoes: limpo.repeticoes,
      carga: limpo.carga,
      obs: limpo.obs,
      criadoEm: agora_(),
      link: limpo.link
    };
    aba.appendRow(paraLinha_(item));
    return item;
  });
}

/** UPDATE — reescreve a linha do id informado, preservando id e criadoEm. */
function atualizarExercicio(id, dados) {
  var limpo = validar_(dados);
  return comTrava_(function () {
    var aba = getAba_();
    var linha = acharLinha_(aba, id);
    if (linha < 0) throw new Error('Exercício não encontrado na planilha.');

    var atual = paraObjeto_(aba.getRange(linha, 1, 1, COLUNAS.length).getValues()[0]);
    var item = {
      id: atual.id,
      nome: limpo.nome,
      grupo: limpo.grupo,
      dia: limpo.dia,
      series: limpo.series,
      repeticoes: limpo.repeticoes,
      carga: limpo.carga,
      obs: limpo.obs,
      criadoEm: atual.criadoEm || agora_(),
      link: limpo.link
    };
    aba.getRange(linha, 1, 1, COLUNAS.length).setValues([paraLinha_(item)]);
    return item;
  });
}

/** DELETE — remove a linha do id informado. */
function excluirExercicio(id) {
  return comTrava_(function () {
    var aba = getAba_();
    var linha = acharLinha_(aba, id);
    if (linha < 0) throw new Error('Exercício não encontrado na planilha.');
    aba.deleteRow(linha);
    return true;
  });
}

/** Limpa a lista inteira (botão "Apagar todos os dados" do menu). */
function excluirTodos() {
  return comTrava_(function () {
    var aba = getAba_();
    var ultima = aba.getLastRow();
    if (ultima > 1) aba.deleteRows(2, ultima - 1);
    return true;
  });
}

/** Popula a planilha com exemplos (botão do estado vazio). */
function carregarExemplos() {
  var exemplos = [
    { nome: 'Supino reto', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 12, carga: 40, obs: 'Aquecer antes', link: 'https://www.youtube.com/watch?v=rT7DgCr-3pg' },
    { nome: 'Agachamento livre', grupo: 'Pernas', dia: 'Treino B', series: 4, repeticoes: 10, carga: 60, obs: '', link: 'https://www.youtube.com/watch?v=SW_C1A-rejs' },
    { nome: 'Puxada frontal', grupo: 'Costas', dia: 'Treino C', series: 3, repeticoes: 12, carga: 50, obs: 'Pegada aberta', link: '' }
  ];
  exemplos.forEach(function (exemplo) { criarExercicio(exemplo); });
  return listarExercicios();
}


/* ===========================================================
   7) AGENDA DA SEMANA
   Cada dia da semana aponta para um dos treinos do cadastro
   (ou fica vazio = Descanso). Os exercícios do dia saem de
   graça: são os que têm aquele "Treino" no cadastro.
   =========================================================== */

/** Devolve { Segunda: 'Treino A', Terça: '', ... } com os 7 dias sempre presentes. */
function lerAgenda_() {
  var aba = getAbaAgenda_();
  var mapa = {};
  DIAS_SEMANA.forEach(function (dia) { mapa[dia] = ''; });

  var ultima = aba.getLastRow();
  if (ultima < 2) return mapa;

  aba.getRange(2, 1, ultima - 1, COLUNAS_AGENDA.length).getValues().forEach(function (linha) {
    var dia = String(linha[0]).trim();
    if (mapa.hasOwnProperty(dia)) mapa[dia] = String(linha[1]).trim();
  });
  return mapa;
}

/** Define (ou limpa) o treino de um dia da semana. */
function salvarAgenda(dia, treino) {
  dia = String(dia == null ? '' : dia).trim();
  treino = String(treino == null ? '' : treino).trim();

  if (DIAS_SEMANA.indexOf(dia) < 0) throw new Error('Dia da semana inválido.');
  if (treino && TREINOS.indexOf(treino) < 0) throw new Error('Treino inválido.');

  return comTrava_(function () {
    var aba = getAbaAgenda_();
    var ultima = aba.getLastRow();
    var linha = -1;

    if (ultima >= 2) {
      var dias = aba.getRange(2, 1, ultima - 1, 1).getValues();
      for (var i = 0; i < dias.length; i++) {
        if (String(dias[i][0]).trim() === dia) { linha = i + 2; break; }
      }
    }

    if (linha < 0) aba.appendRow([dia, treino]);
    else aba.getRange(linha, 2).setValue(treino);

    // Virou Descanso: a marcação de "feito" daquele dia perde o sentido
    if (!treino) desmarcarSemTrava_(dia);

    return { agenda: lerAgenda_(), feitos: lerFeitos_() };
  });
}


/* ===========================================================
   8) CHECKLIST DA SEMANA
   Existir uma linha = aquele dia daquela semana foi feito.
   Desmarcar apaga a linha. Semanas anteriores ficam guardadas.
   =========================================================== */

/** Linha (1-based) da marcação, ou -1. */
function acharMarca_(aba, semana, dia) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return -1;

  var valores = aba.getRange(2, 1, ultima - 1, 2).getValues();
  for (var i = 0; i < valores.length; i++) {
    if (String(valores[i][0]).trim() === semana && String(valores[i][1]).trim() === dia) {
      return i + 2;
    }
  }
  return -1;
}

/** Dias já concluídos NESTA semana, ex.: ['Segunda', 'Quarta']. */
function lerFeitos_() {
  var aba = getAbaChecklist_();
  var semana = chaveSemana_();
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];

  return aba.getRange(2, 1, ultima - 1, 2).getValues()
    .filter(function (linha) { return String(linha[0]).trim() === semana; })
    .map(function (linha) { return String(linha[1]).trim(); })
    .filter(function (dia) { return DIAS_SEMANA.indexOf(dia) >= 0; });
}

function marcarSemTrava_(dia) {
  var aba = getAbaChecklist_();
  var semana = chaveSemana_();
  if (acharMarca_(aba, semana, dia) > 0) return;   // já estava marcado
  aba.appendRow([semana, dia, agora_()]);
}

function desmarcarSemTrava_(dia) {
  var aba = getAbaChecklist_();
  var linha = acharMarca_(aba, chaveSemana_(), dia);
  if (linha > 0) aba.deleteRow(linha);
}

/** Marca ou desmarca um dia da semana atual. Devolve a lista atualizada. */
function marcarDia(dia, feito) {
  dia = String(dia == null ? '' : dia).trim();
  if (DIAS_SEMANA.indexOf(dia) < 0) throw new Error('Dia da semana inválido.');

  return comTrava_(function () {
    if (feito) marcarSemTrava_(dia);
    else desmarcarSemTrava_(dia);
    return lerFeitos_();
  });
}

/** Limpa as marcações só da semana atual (botão "Reiniciar semana"). */
function reiniciarSemana() {
  return comTrava_(function () {
    DIAS_SEMANA.forEach(desmarcarSemTrava_);
    return lerFeitos_();
  });
}


/* ===========================================================
   9) TESTE RÁPIDO NO EDITOR
   Selecione a função e clique em Executar.
   =========================================================== */

function testarCRUD() {
  var criado = criarExercicio({
    nome: 'TESTE — remover', grupo: 'Peito', dia: 'Treino A',
    series: 3, repeticoes: 10, carga: 20, obs: 'registro de teste',
    link: 'https://www.youtube.com/watch?v=teste'
  });
  Logger.log('CREATE -> %s', JSON.stringify(criado));

  Logger.log('READ   -> %s registro(s)', listarExercicios().length);

  var alterado = atualizarExercicio(criado.id, {
    nome: 'TESTE — alterado', grupo: 'Costas', dia: 'Treino B',
    series: 4, repeticoes: 12, carga: 35, obs: 'atualizado', link: ''
  });
  Logger.log('UPDATE -> %s', JSON.stringify(alterado));

  excluirExercicio(criado.id);
  Logger.log('DELETE -> ok. Sobraram %s registro(s).', listarExercicios().length);
}

function testarAgenda() {
  Logger.log('Semana  -> %s', JSON.stringify(infoSemana_()));

  salvarAgenda('Segunda', 'Treino A');
  salvarAgenda('Quarta', 'Treino B');
  Logger.log('AGENDA  -> %s', JSON.stringify(lerAgenda_()));

  marcarDia('Segunda', true);
  Logger.log('MARCOU  -> %s', JSON.stringify(lerFeitos_()));

  marcarDia('Segunda', false);
  Logger.log('DESMARCA-> %s', JSON.stringify(lerFeitos_()));
}
