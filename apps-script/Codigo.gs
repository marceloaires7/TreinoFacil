/* ===========================================================
   TreinoFácil — Backend (Google Apps Script + Google Sheets)
   -----------------------------------------------------------
   Este arquivo é o SERVIDOR de dados do app:
     • doPost() -> recebe { acao, args, token } e devolve JSON
     • login    -> confere usuário/senha e devolve um token
     • CRUD     -> lê e escreve direto na planilha, sempre
                   filtrando pelo usuário dono do token
   Não existe Make, não existe Netlify, não existe webhook.
   A interface fica no GitHub Pages e conversa com estas
   funções por fetch().

   A planilha tem 4 abas, todas criadas automaticamente:
     • Usuarios   -> quem pode entrar (senha guardada como hash)
     • Exercicios -> o cadastro (1 linha por exercício)
     • Agenda     -> qual treino cai em cada dia da semana
     • Checklist  -> quais dias já foram feitos, semana a semana
   As três últimas têm uma coluna "usuario": cada pessoa só
   enxerga e mexe nas próprias linhas.
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
var ABA_USUARIOS = 'Usuarios';

var COLUNAS = ['id', 'nome', 'grupo', 'dia', 'series', 'repeticoes', 'carga', 'obs', 'criadoEm', 'link', 'usuario'];
var COLUNAS_AGENDA = ['dia', 'treino', 'usuario'];
var COLUNAS_CHECKLIST = ['semana', 'dia', 'feitoEm', 'usuario'];
var COLUNAS_USUARIOS = ['usuario', 'nome', 'salt', 'senhaHash', 'criadoEm'];

// Posição (0-based) da coluna "usuario" em cada aba de dados
var IDX_USUARIO_EX = 10;
var IDX_USUARIO_AGENDA = 2;
var IDX_USUARIO_CHECKLIST = 3;

var GRUPOS = ['Peito', 'Costas', 'Pernas', 'Ombros', 'Bíceps', 'Tríceps', 'Abdômen', 'Cardio'];
var TREINOS = ['Treino A', 'Treino B', 'Treino C', 'Treino D', 'Treino E'];
var DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Segurança
var DURACAO_SESSAO_DIAS = 30;      // quanto tempo o login vale
var MAX_TENTATIVAS = 5;            // erros de senha até bloquear
var BLOQUEIO_SEGUNDOS = 15 * 60;   // duração do bloqueio
var ITERACOES_HASH = 300;          // voltas do hash de senha (custo p/ quem tentar quebrar)
var SENHA_MINIMA = 6;


/* ===========================================================
   1) A API JSON
   -----------------------------------------------------------
   O app manda um POST com { acao, args, token } e recebe
   { ok: true, dados } ou { ok: false, erro, codigo? }.

   Só "login" dispensa token. Todas as outras ações recebem o
   usuário dono do token como PRIMEIRO argumento — o cliente
   nunca diz quem ele é; quem diz é a assinatura do token.
   =========================================================== */

/** Só estas funções podem ser chamadas de fora. */
function acoesPermitidas_() {
  return {
    login: login,
    carregarDados: carregarDados,
    listarExercicios: listarExercicios,
    criarExercicio: criarExercicio,
    atualizarExercicio: atualizarExercicio,
    excluirExercicio: excluirExercicio,
    excluirTodos: excluirTodos,
    carregarExemplos: carregarExemplos,
    salvarAgenda: salvarAgenda,
    marcarDia: marcarDia,
    reiniciarSemana: reiniciarSemana,
    trocarSenha: trocarSenha
  };
}

/** Ações que não exigem estar logado. */
var ACOES_PUBLICAS = ['login'];

/** O app chama por POST. */
function doPost(e) {
  return responderJson_(function () {
    var corpo = {};
    try {
      corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (erro) {
      throw new Error('Corpo da requisição não é JSON válido.');
    }
    return executar_(corpo.acao, corpo.args, corpo.token);
  });
}

/**
 * GET serve para duas coisas:
 *   • sem parâmetro -> página simples dizendo onde está o app
 *   • ?acao=...&token=... -> testar a API direto no navegador
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
      return executar_(acao, args, e.parameter.token);
    });
  }

  return paginaDeAviso_();
}

/** Roda a ação pedida, se ela estiver na lista permitida e o token for válido. */
function executar_(acao, args, token) {
  var permitidas = acoesPermitidas_();
  acao = String(acao || '');
  args = Array.isArray(args) ? args : [];

  if (!Object.prototype.hasOwnProperty.call(permitidas, acao)) {
    throw new Error('Ação desconhecida: "' + acao + '".');
  }

  if (ACOES_PUBLICAS.indexOf(acao) >= 0) {
    return permitidas[acao].apply(null, args);
  }

  var usuario = validarToken_(token);
  return permitidas[acao].apply(null, [usuario].concat(args));
}

/** Embrulha o resultado no formato { ok, dados } / { ok, erro, codigo }. */
function responderJson_(fn) {
  var corpo;
  try {
    corpo = { ok: true, dados: fn() };
  } catch (erro) {
    corpo = { ok: false, erro: (erro && erro.message) ? erro.message : String(erro) };
    if (erro && erro.codigo) corpo.codigo = erro.codigo;
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
   2) LOGIN, SENHAS E TOKENS
   -----------------------------------------------------------
   • A senha NUNCA é gravada. Vai para a planilha só o hash:
       hash = HMAC(pepper, salt|senha), repetido ITERACOES vezes
     O "pepper" é um segredo que vive nas propriedades do script
     (fora da planilha). Quem baixar a planilha não tem como
     testar senhas, porque não tem o pepper.
   • O token é "carga.assinatura": carga = usuario|expira em
     base64, assinatura = HMAC(segredo, carga). O servidor não
     guarda sessão nenhuma — só confere a assinatura.
   =========================================================== */

/** Segredo gerado uma vez e guardado fora da planilha. */
function segredo_(chave) {
  var props = PropertiesService.getScriptProperties();
  var valor = props.getProperty(chave);
  if (!valor) {
    valor = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty(chave, valor);
  }
  return valor;
}

/** Bytes do Apps Script (-128..127) -> texto hexadecimal. */
function paraHex_(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

function hmac_(texto, chave) {
  return paraHex_(Utilities.computeHmacSha256Signature(texto, chave, Utilities.Charset.UTF_8));
}

function hashSenha_(senha, salt) {
  var pepper = segredo_('PEPPER_SENHA');
  var h = hmac_(salt + '|' + senha, pepper);
  for (var i = 0; i < ITERACOES_HASH; i++) {
    h = hmac_(h + '|' + salt, pepper);
  }
  return h;
}

/** Compara sem parar no primeiro caractere diferente (não vaza pelo tempo). */
function iguaisSemVazar_(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var dif = 0;
  for (var i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

function erroSessao_() {
  var erro = new Error('Sessão inválida ou expirada. Entre de novo.');
  erro.codigo = 'SESSAO_INVALIDA';
  return erro;
}

function gerarToken_(usuario) {
  var expira = Date.now() + DURACAO_SESSAO_DIAS * 24 * 60 * 60 * 1000;
  var carga = Utilities.base64EncodeWebSafe(usuario + '|' + expira);
  return carga + '.' + hmac_(carga, segredo_('SEGREDO_TOKEN'));
}

/** Devolve o usuário dono do token, ou lança SESSAO_INVALIDA. */
function validarToken_(token) {
  var partes = String(token || '').split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) throw erroSessao_();

  if (!iguaisSemVazar_(hmac_(partes[0], segredo_('SEGREDO_TOKEN')), partes[1])) throw erroSessao_();

  var carga;
  try {
    carga = Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString();
  } catch (e) {
    throw erroSessao_();
  }
  var sep = carga.lastIndexOf('|');
  var usuario = carga.slice(0, sep);
  var expira = Number(carga.slice(sep + 1));

  if (!usuario || !(expira > Date.now())) throw erroSessao_();
  if (!acharUsuario_(usuario)) throw erroSessao_();     // conta apagada depois do login
  return usuario;
}

/** Nome de usuário: minúsculo, sem espaços, 3 a 30 caracteres. */
function normalizarUsuario_(usuario) {
  return String(usuario == null ? '' : usuario).trim().toLowerCase();
}

function validarNomeDeUsuario_(usuario) {
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
    throw new Error('Usuário deve ter de 3 a 30 caracteres: letras minúsculas, números, ponto, traço ou sublinhado.');
  }
}

/** Aba de usuários. */
function getAbaUsuarios_() {
  var r = abaComCabecalho_(ABA_USUARIOS, COLUNAS_USUARIOS);
  if (r.nova) {
    r.aba.getRange(1, 1, r.aba.getMaxRows(), COLUNAS_USUARIOS.length).setNumberFormat('@');
    r.aba.setColumnWidth(4, 260);
  }
  return r.aba;
}

/** Devolve { linha, usuario, nome, salt, senhaHash } ou null. */
function acharUsuario_(usuario) {
  usuario = normalizarUsuario_(usuario);
  var aba = getAbaUsuarios_();
  var ultima = aba.getLastRow();
  if (ultima < 2) return null;

  var valores = aba.getRange(2, 1, ultima - 1, COLUNAS_USUARIOS.length).getValues();
  for (var i = 0; i < valores.length; i++) {
    if (normalizarUsuario_(valores[i][0]) === usuario) {
      return {
        linha: i + 2,
        usuario: usuario,
        nome: String(valores[i][1]),
        salt: String(valores[i][2]),
        senhaHash: String(valores[i][3])
      };
    }
  }
  return null;
}

/** Cria uma conta. Chamado só pelo dono da planilha, pelo editor. */
function criarUsuario_(usuario, senha, nome) {
  usuario = normalizarUsuario_(usuario);
  senha = String(senha == null ? '' : senha);
  nome = String(nome == null ? '' : nome).trim() || usuario;

  validarNomeDeUsuario_(usuario);
  if (senha.length < SENHA_MINIMA) throw new Error('A senha precisa ter pelo menos ' + SENHA_MINIMA + ' caracteres.');

  return comTrava_(function () {
    if (acharUsuario_(usuario)) throw new Error('Já existe o usuário "' + usuario + '".');
    var salt = Utilities.getUuid();
    getAbaUsuarios_().appendRow([usuario, nome, salt, hashSenha_(senha, salt), agora_()]);
    return { usuario: usuario, nome: nome };
  });
}

/** AÇÃO PÚBLICA — confere usuário/senha e devolve o token. */
function login(usuario, senha) {
  usuario = normalizarUsuario_(usuario);
  senha = String(senha == null ? '' : senha);
  if (!usuario || !senha) throw new Error('Informe usuário e senha.');

  var cache = CacheService.getScriptCache();
  var chaveFalhas = 'falhas:' + usuario;
  var falhas = Number(cache.get(chaveFalhas) || 0);
  if (falhas >= MAX_TENTATIVAS) {
    throw new Error('Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  }

  var conta = acharUsuario_(usuario);
  // Mesmo sem conta, calcula um hash: a resposta demora igual, e quem
  // tenta adivinhar nomes de usuário não ganha pista pelo tempo.
  var hash = hashSenha_(senha, conta ? conta.salt : 'salt-de-mentira');
  var confere = !!conta && iguaisSemVazar_(hash, conta.senhaHash);

  if (!confere) {
    cache.put(chaveFalhas, String(falhas + 1), BLOQUEIO_SEGUNDOS);
    throw new Error('Usuário ou senha incorretos.');
  }

  cache.remove(chaveFalhas);
  return {
    token: gerarToken_(usuario),
    usuario: usuario,
    nome: conta.nome,
    expiraEm: Date.now() + DURACAO_SESSAO_DIAS * 24 * 60 * 60 * 1000
  };
}

/** Troca a própria senha (precisa da atual). */
function trocarSenha(usuario, senhaAtual, senhaNova) {
  senhaAtual = String(senhaAtual == null ? '' : senhaAtual);
  senhaNova = String(senhaNova == null ? '' : senhaNova);
  if (senhaNova.length < SENHA_MINIMA) {
    throw new Error('A nova senha precisa ter pelo menos ' + SENHA_MINIMA + ' caracteres.');
  }

  return comTrava_(function () {
    var conta = acharUsuario_(usuario);
    if (!conta) throw erroSessao_();
    if (!iguaisSemVazar_(hashSenha_(senhaAtual, conta.salt), conta.senhaHash)) {
      throw new Error('A senha atual não confere.');
    }
    var salt = Utilities.getUuid();
    getAbaUsuarios_().getRange(conta.linha, 3, 1, 2).setValues([[salt, hashSenha_(senhaNova, salt)]]);
    return true;
  });
}


/* ===========================================================
   3) ACESSO À PLANILHA
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
  garantirColunas_(aba, colunas);
  return { aba: aba, nova: false };
}

/**
 * Planilha criada por uma versão anterior tem menos colunas (sem "link",
 * sem "usuario"). Completa o cabeçalho em vez de quebrar, sem perder dados.
 */
function garantirColunas_(aba, colunas) {
  var largura = aba.getLastColumn();
  if (largura >= colunas.length) return;

  var faltam = colunas.slice(largura);
  aba.getRange(1, largura + 1, 1, faltam.length).setValues([faltam]).setFontWeight('bold');
  aba.getRange(1, largura + 1, aba.getMaxRows(), faltam.length).setNumberFormat('@');
}

/** Aba do cadastro de exercícios. */
function getAba_() {
  var r = abaComCabecalho_(ABA, COLUNAS);
  if (r.nova) {
    // id, criadoEm, link e usuario como TEXTO puro, para o Sheets não
    // converter em número, data ou hyperlink automático
    r.aba.getRange(1, 1, r.aba.getMaxRows(), 1).setNumberFormat('@');
    r.aba.getRange(1, 9, r.aba.getMaxRows(), 3).setNumberFormat('@');
    r.aba.setColumnWidth(1, 130);
    r.aba.setColumnWidth(2, 200);
    r.aba.setColumnWidth(10, 240);
  }
  return r.aba;
}

/** Aba da agenda — uma linha por (dia, usuário). */
function getAbaAgenda_() {
  var r = abaComCabecalho_(ABA_AGENDA, COLUNAS_AGENDA);
  if (r.nova) {
    r.aba.setColumnWidth(1, 120);
    r.aba.setColumnWidth(2, 140);
  }
  return r.aba;
}

/** Aba do checklist — uma linha por dia concluído, por usuário. */
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

/** Todas as linhas de dados de uma aba, já com o número da linha. */
function linhasDe_(aba, largura) {
  var ultima = aba.getLastRow();
  if (ultima < 2) return [];
  return aba.getRange(2, 1, ultima - 1, largura).getValues().map(function (valores, i) {
    return { linha: i + 2, v: valores };
  });
}

function ehDoUsuario_(valores, idxUsuario, usuario) {
  return normalizarUsuario_(valores[idxUsuario]) === usuario;
}


/* ===========================================================
   4) CONVERSÃO LINHA <-> OBJETO
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

function paraLinha_(item, usuario) {
  return [
    item.id, item.nome, item.grupo, item.dia,
    item.series, item.repeticoes, item.carga,
    item.obs, item.criadoEm, item.link, usuario
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

/** Linha (1-based) do exercício com aquele id E daquele usuário, ou -1. */
function acharLinhaDoUsuario_(aba, id, usuario) {
  var alvo = String(id).trim();
  var linhas = linhasDe_(aba, COLUNAS.length);
  for (var i = 0; i < linhas.length; i++) {
    if (String(linhas[i].v[0]).trim() === alvo && ehDoUsuario_(linhas[i].v, IDX_USUARIO_EX, usuario)) {
      return linhas[i].linha;
    }
  }
  return -1;
}


/* ===========================================================
   5) A SEMANA CORRENTE
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

/**
 * Normaliza a chave de semana lida da planilha.
 * O Sheets pode ter convertido o texto '2026-08-24' em Date; se comparar
 * o valor cru, nada bate e o checklist nunca acha as próprias marcações.
 */
function chaveDaCelula_(valor) {
  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(valor == null ? '' : valor).trim();
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
   6) VALIDAÇÃO (servidor também valida — não confie só no cliente)
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
   7) AS 4 OPERAÇÕES CRUD  (o 1º argumento vem do token)
   =========================================================== */

/** Chamada única de abertura: tudo que o app precisa para desenhar as telas. */
function carregarDados(usuario) {
  var conta = acharUsuario_(usuario);
  return {
    usuario: usuario,
    nome: conta ? conta.nome : usuario,
    grupos: GRUPOS,
    treinos: TREINOS,
    diasSemana: DIAS_SEMANA,
    exercicios: listarExercicios(usuario),
    agenda: lerAgenda_(usuario),
    feitos: lerFeitos_(usuario),
    semana: infoSemana_()
  };
}

/** READ — devolve os exercícios DO USUÁRIO. */
function listarExercicios(usuario) {
  return linhasDe_(getAba_(), COLUNAS.length)
    .filter(function (l) { return String(l.v[0]).trim() !== '' && ehDoUsuario_(l.v, IDX_USUARIO_EX, usuario); })
    .map(function (l) { return paraObjeto_(l.v); });
}

/** CREATE — acrescenta uma linha nova e devolve o item salvo. */
function criarExercicio(usuario, dados) {
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
    aba.appendRow(paraLinha_(item, usuario));
    return item;
  });
}

/** UPDATE — reescreve a linha do id informado (só se for do usuário). */
function atualizarExercicio(usuario, id, dados) {
  var limpo = validar_(dados);
  return comTrava_(function () {
    var aba = getAba_();
    var linha = acharLinhaDoUsuario_(aba, id, usuario);
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
    aba.getRange(linha, 1, 1, COLUNAS.length).setValues([paraLinha_(item, usuario)]);
    return item;
  });
}

/** DELETE — remove a linha do id informado (só se for do usuário). */
function excluirExercicio(usuario, id) {
  return comTrava_(function () {
    var aba = getAba_();
    var linha = acharLinhaDoUsuario_(aba, id, usuario);
    if (linha < 0) throw new Error('Exercício não encontrado na planilha.');
    aba.deleteRow(linha);
    return true;
  });
}

/** Apaga TODOS os exercícios do usuário (e só os dele). */
function excluirTodos(usuario) {
  return comTrava_(function () {
    var aba = getAba_();
    apagarLinhasDoUsuario_(aba, COLUNAS.length, IDX_USUARIO_EX, usuario, function () { return true; });
    return true;
  });
}

/** Apaga, de baixo para cima, as linhas do usuário que passarem no filtro. */
function apagarLinhasDoUsuario_(aba, largura, idxUsuario, usuario, filtro) {
  linhasDe_(aba, largura)
    .filter(function (l) { return ehDoUsuario_(l.v, idxUsuario, usuario) && filtro(l.v); })
    .map(function (l) { return l.linha; })
    .sort(function (a, b) { return b - a; })       // de baixo para cima: os índices não mudam
    .forEach(function (linha) { aba.deleteRow(linha); });
}

/** Popula com exemplos (botão do estado vazio). */
function carregarExemplos(usuario) {
  var exemplos = [
    { nome: 'Supino reto', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 12, carga: 40, obs: 'Aquecer antes', link: 'https://www.youtube.com/watch?v=rT7DgCr-3pg' },
    { nome: 'Agachamento livre', grupo: 'Pernas', dia: 'Treino B', series: 4, repeticoes: 10, carga: 60, obs: '', link: 'https://www.youtube.com/watch?v=SW_C1A-rejs' },
    { nome: 'Puxada frontal', grupo: 'Costas', dia: 'Treino C', series: 3, repeticoes: 12, carga: 50, obs: 'Pegada aberta', link: '' }
  ];
  exemplos.forEach(function (exemplo) { criarExercicio(usuario, exemplo); });
  return listarExercicios(usuario);
}


/* ===========================================================
   8) AGENDA DA SEMANA (por usuário)
   =========================================================== */

/** Devolve { Segunda: 'Treino A', Terça: '', ... } com os 7 dias sempre presentes. */
function lerAgenda_(usuario) {
  var mapa = {};
  DIAS_SEMANA.forEach(function (dia) { mapa[dia] = ''; });

  linhasDe_(getAbaAgenda_(), COLUNAS_AGENDA.length).forEach(function (l) {
    if (!ehDoUsuario_(l.v, IDX_USUARIO_AGENDA, usuario)) return;
    var dia = String(l.v[0]).trim();
    if (mapa.hasOwnProperty(dia)) mapa[dia] = String(l.v[1]).trim();
  });
  return mapa;
}

/** Define (ou limpa) o treino de um dia da semana. */
function salvarAgenda(usuario, dia, treino) {
  dia = String(dia == null ? '' : dia).trim();
  treino = String(treino == null ? '' : treino).trim();

  if (DIAS_SEMANA.indexOf(dia) < 0) throw new Error('Dia da semana inválido.');
  if (treino && TREINOS.indexOf(treino) < 0) throw new Error('Treino inválido.');

  return comTrava_(function () {
    var aba = getAbaAgenda_();
    var existente = linhasDe_(aba, COLUNAS_AGENDA.length).filter(function (l) {
      return String(l.v[0]).trim() === dia && ehDoUsuario_(l.v, IDX_USUARIO_AGENDA, usuario);
    })[0];

    if (existente) aba.getRange(existente.linha, 2).setValue(treino);
    else aba.appendRow([dia, treino, usuario]);

    // Virou Descanso: a marcação de "feito" daquele dia perde o sentido
    if (!treino) desmarcarSemTrava_(usuario, dia);

    return { agenda: lerAgenda_(usuario), feitos: lerFeitos_(usuario) };
  });
}


/* ===========================================================
   9) CHECKLIST DA SEMANA (por usuário)
   Existir uma linha = aquele dia daquela semana foi feito.
   =========================================================== */

/** Todas as linhas (1-based) que marcam aquele dia naquela semana para o usuário. */
function acharMarcas_(aba, semana, dia, usuario) {
  return linhasDe_(aba, COLUNAS_CHECKLIST.length)
    .filter(function (l) {
      return chaveDaCelula_(l.v[0]) === semana &&
        String(l.v[1]).trim() === dia &&
        ehDoUsuario_(l.v, IDX_USUARIO_CHECKLIST, usuario);
    })
    .map(function (l) { return l.linha; });
}

/** Dias já concluídos NESTA semana pelo usuário, ex.: ['Segunda', 'Quarta']. */
function lerFeitos_(usuario) {
  var semana = chaveSemana_();
  var vistos = {};
  return linhasDe_(getAbaChecklist_(), COLUNAS_CHECKLIST.length)
    .filter(function (l) { return chaveDaCelula_(l.v[0]) === semana && ehDoUsuario_(l.v, IDX_USUARIO_CHECKLIST, usuario); })
    .map(function (l) { return String(l.v[1]).trim(); })
    .filter(function (dia) {
      if (DIAS_SEMANA.indexOf(dia) < 0 || vistos[dia]) return false;   // sem repetidos
      vistos[dia] = true;
      return true;
    });
}

function marcarSemTrava_(usuario, dia) {
  var aba = getAbaChecklist_();
  var semana = chaveSemana_();
  if (acharMarcas_(aba, semana, dia, usuario).length > 0) return;   // já estava marcado

  aba.appendRow([semana, dia, agora_(), usuario]);
  // Trava a coluna da semana como TEXTO, para o Sheets não reinterpretar
  // '2026-08-24' como data na próxima leitura.
  aba.getRange(aba.getLastRow(), 1).setNumberFormat('@');
}

function desmarcarSemTrava_(usuario, dia) {
  var aba = getAbaChecklist_();
  acharMarcas_(aba, chaveSemana_(), dia, usuario)
    .sort(function (a, b) { return b - a; })
    .forEach(function (linha) { aba.deleteRow(linha); });
}

/** Marca ou desmarca um dia da semana atual. Devolve a lista atualizada. */
function marcarDia(usuario, dia, feito) {
  dia = String(dia == null ? '' : dia).trim();
  if (DIAS_SEMANA.indexOf(dia) < 0) throw new Error('Dia da semana inválido.');

  return comTrava_(function () {
    if (feito) marcarSemTrava_(usuario, dia);
    else desmarcarSemTrava_(usuario, dia);
    return lerFeitos_(usuario);
  });
}

/** Limpa as marcações só da semana atual (botão "Reiniciar semana"). */
function reiniciarSemana(usuario) {
  return comTrava_(function () {
    DIAS_SEMANA.forEach(function (dia) { desmarcarSemTrava_(usuario, dia); });
    return lerFeitos_(usuario);
  });
}


/* ===========================================================
   10) MIGRAÇÃO: dar dono às linhas antigas
   Uma planilha de antes do login tem linhas sem a coluna
   "usuario". Elas ficam invisíveis para todo mundo até alguém
   adotá-las.
   =========================================================== */

/** Carimba o usuário em toda linha que ainda não tem dono. Devolve quantas. */
function adotarRegistrosSemDono_(usuario) {
  usuario = normalizarUsuario_(usuario);
  if (!acharUsuario_(usuario)) throw new Error('Usuário "' + usuario + '" não existe. Cadastre-o primeiro.');

  var abas = [
    { aba: getAba_(), largura: COLUNAS.length, idx: IDX_USUARIO_EX },
    { aba: getAbaAgenda_(), largura: COLUNAS_AGENDA.length, idx: IDX_USUARIO_AGENDA },
    { aba: getAbaChecklist_(), largura: COLUNAS_CHECKLIST.length, idx: IDX_USUARIO_CHECKLIST }
  ];

  return comTrava_(function () {
    var total = 0;
    abas.forEach(function (cfg) {
      linhasDe_(cfg.aba, cfg.largura).forEach(function (l) {
        var temDados = String(l.v[0]).trim() !== '';
        var semDono = String(l.v[cfg.idx] == null ? '' : l.v[cfg.idx]).trim() === '';
        if (temDados && semDono) {
          cfg.aba.getRange(l.linha, cfg.idx + 1).setValue(usuario);
          total++;
        }
      });
    });
    return total;
  });
}


/* ===========================================================
   11) FUNÇÕES PARA VOCÊ RODAR NO EDITOR
   Selecione a função na barra do topo e clique em Executar.
   =========================================================== */

/**
 * PASSO 1 — Crie as contas.
 * Edite a lista abaixo, rode a função UMA vez e depois APAGUE AS SENHAS
 * daqui: elas não devem ficar gravadas no código.
 */
function cadastrarUsuarios() {
  var contas = [
    { usuario: 'marcelo', senha: 'troque-esta-senha', nome: 'Marcelo' },
    { usuario: 'namorada', senha: 'troque-esta-senha', nome: 'Nome dela' }
  ];

  contas.forEach(function (c) {
    if (c.senha === 'troque-esta-senha') {
      Logger.log('PULEI "%s": troque a senha de exemplo antes de rodar.', c.usuario);
      return;
    }
    try {
      criarUsuario_(c.usuario, c.senha, c.nome);
      Logger.log('Criado: %s (%s)', c.usuario, c.nome);
    } catch (erro) {
      Logger.log('Erro em "%s": %s', c.usuario, erro.message);
    }
  });
}

/**
 * PASSO 2 — Dê dono aos exercícios que já existiam antes do login.
 * Troque 'marcelo' pelo SEU usuário e rode uma vez.
 */
function adotarMeusRegistros() {
  var MEU_USUARIO = 'marcelo';
  var quantas = adotarRegistrosSemDono_(MEU_USUARIO);
  Logger.log('%s linha(s) agora pertencem a "%s".', quantas, MEU_USUARIO);
}

/** Primeiro usuário cadastrado — usado só pelos testes abaixo. */
function usuarioParaTeste_() {
  var aba = getAbaUsuarios_();
  if (aba.getLastRow() < 2) throw new Error('Cadastre um usuário primeiro (função cadastrarUsuarios).');
  return normalizarUsuario_(aba.getRange(2, 1).getValue());
}

function testarCRUD() {
  var u = usuarioParaTeste_();
  var criado = criarExercicio(u, {
    nome: 'TESTE — remover', grupo: 'Peito', dia: 'Treino A',
    series: 3, repeticoes: 10, carga: 20, obs: 'registro de teste',
    link: 'https://www.youtube.com/watch?v=teste'
  });
  Logger.log('CREATE -> %s', JSON.stringify(criado));

  Logger.log('READ   -> %s registro(s) de %s', listarExercicios(u).length, u);

  var alterado = atualizarExercicio(u, criado.id, {
    nome: 'TESTE — alterado', grupo: 'Costas', dia: 'Treino B',
    series: 4, repeticoes: 12, carga: 35, obs: 'atualizado', link: ''
  });
  Logger.log('UPDATE -> %s', JSON.stringify(alterado));

  excluirExercicio(u, criado.id);
  Logger.log('DELETE -> ok. Sobraram %s registro(s).', listarExercicios(u).length);
}

function testarAgenda() {
  var u = usuarioParaTeste_();
  Logger.log('Semana  -> %s', JSON.stringify(infoSemana_()));

  salvarAgenda(u, 'Segunda', 'Treino A');
  salvarAgenda(u, 'Quarta', 'Treino B');
  Logger.log('AGENDA  -> %s', JSON.stringify(lerAgenda_(u)));

  marcarDia(u, 'Segunda', true);
  Logger.log('MARCOU  -> %s', JSON.stringify(lerFeitos_(u)));

  marcarDia(u, 'Segunda', false);
  Logger.log('DESMARCA-> %s', JSON.stringify(lerFeitos_(u)));
}
