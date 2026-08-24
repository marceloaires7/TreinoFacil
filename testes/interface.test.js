/* Teste ponta-a-ponta: DOM real (jsdom) + docs/index.html e docs/js/app.js
   reais + apps-script/Codigo.gs real, sobre a planilha emulada.
   O fetch falso chama o doPost() DE VERDADE, então cada clique atravessa a
   mesma camada de API que o app usa em produção. Só o Google fica de fora. */
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const { criarAmbiente } = require('./planilhaFalsa.js');

const { abas } = criarAmbiente();
vm.runInThisContext(fs.readFileSync(path.join(RAIZ, 'apps-script', 'Codigo.gs'), 'utf8'));

const API_FALSA = 'https://exemplo.test/exec';
const CHAVE_CACHE = 'treinofacil:ultimosDados';

// Monta a página como o navegador veria: o index.html com o app.js embutido
let html = fs.readFileSync(path.join(RAIZ, 'docs', 'index.html'), 'utf8');
let appJs = fs.readFileSync(path.join(RAIZ, 'docs', 'js', 'app.js'), 'utf8');

if (!/const API = 'COLE_AQUI/.test(appJs)) {
  throw new Error('o placeholder da URL da API sumiu do docs/js/app.js');
}
appJs = appJs.replace(/const API = '[^']*';/, "const API = '" + API_FALSA + "';");

if (html.indexOf('<script src="js/app.js"></script>') < 0) {
  throw new Error('nao achei a tag <script src="js/app.js"> no docs/index.html');
}
html = html.replace('<script src="js/app.js"></script>', '<script>' + appJs + '</script>');

/**
 * Opções de uma instância do app.
 *   offline: true  -> todo fetch falha, como num celular sem rede
 *   semente: {chave, valor} -> pré-carrega o localStorage antes do script rodar
 */
function opcoesJsdom(cfg) {
  cfg = cfg || {};
  return {
    runScripts: 'dangerously',
    url: 'https://treinofacil.test/',      // origem real: sem isso não há localStorage
    beforeParse(window) {
      window.scrollTo = () => { };

      if (cfg.semente) {
        try { window.localStorage.setItem(cfg.semente.chave, cfg.semente.valor); } catch (e) { }
      }

      window.fetch = (url, opcoes) => new Promise((resolve, reject) => {
        setTimeout(() => {
          if (cfg.offline) { reject(new TypeError('Failed to fetch')); return; }
          if (url !== API_FALSA) { reject(new TypeError('URL inesperada: ' + url)); return; }

          // Passa pelo doPost() real do Codigo.gs
          const saida = global.doPost({ postData: { contents: opcoes.body } });
          const texto = saida.getContent();
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(JSON.parse(texto))
          });
        }, 0);
      });
    }
  };
}

const dom = new JSDOM(html, opcoesJsdom());
const doc = dom.window.document;
const $ = s => doc.querySelector(s);
const txt = s => ($(s) ? $(s).textContent.replace(/\s+/g, ' ').trim() : '<ausente>');
const visivel = id => $('#' + id).classList.contains('active');
const stats = raiz => [...doc.querySelectorAll(raiz + ' .stat')]
  .map(c => c.querySelector('.num').textContent + ' ' + c.querySelector('.lbl').textContent);
const espera = ms => new Promise(r => setTimeout(r, ms));
const calma = () => espera(30);

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASSOU  ' : '  FALHOU  ') + msg);
  if (!cond) falhas++;
}

(async function () {
  await calma();

  console.log('\n== ABERTURA ==');
  ok(visivel('view-home'), 'abre na tela Início');
  ok(txt('#tituloPagina') === 'TreinoFácil', 'título do cabeçalho: ' + txt('#tituloPagina'));
  ok($('#f-grupo').options.length === 9, 'select de grupos preenchido pelo servidor (' + $('#f-grupo').options.length + ' opções)');
  ok($('#f-dia').options.length === 6, 'select de treinos preenchido (' + $('#f-dia').options.length + ' opções)');
  ok(stats('#homeStats')[0] === '0 Exercícios cadastrados', 'stats zerados: ' + stats('#homeStats').join(' | '));
  ok($('#fab').hidden === true, 'FAB escondido fora da listagem');

  console.log('\n== NAVEGAÇÃO ==');
  [...doc.querySelectorAll('.bottom-nav a')].find(a => a.getAttribute('data-ir') === 'lista').click();
  await calma();
  ok(visivel('view-lista') && !visivel('view-home'), 'navegou para Meus Treinos');
  ok($('#fab').hidden === false, 'FAB aparece na listagem');
  ok(txt('#listaContent').indexOf('Sua lista está vazia') >= 0, 'estado vazio na listagem');

  console.log('\n== VALIDAÇÃO DO FORMULÁRIO ==');
  $('#fab').click(); await calma();
  ok(visivel('view-form') && txt('#formTitulo') === 'Novo Exercício', 'FAB abre o formulário de cadastro');
  $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await calma();
  ok(doc.querySelectorAll('.field.invalid').length === 6, 'formulário vazio marcou os 6 campos obrigatórios');
  ok(listarExercicios().length === 0, 'nada foi gravado na planilha');
  ok(visivel('view-form'), 'continua no formulário');

  console.log('\n== CREATE ==');
  const preencher = (nome, grupo, dia, s, r, c, obs) => {
    $('#f-nome').value = nome; $('#f-grupo').value = grupo; $('#f-dia').value = dia;
    $('#f-series').value = s; $('#f-repeticoes').value = r; $('#f-carga').value = c;
    $('#f-obs').value = obs || '';
  };
  preencher('Supino reto', 'Peito', 'Treino A', 4, 12, 40, 'Aquecer antes');
  $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await calma();
  ok(listarExercicios().length === 1, 'gravou 1 linha na planilha');
  ok(listarExercicios()[0].nome === 'Supino reto', 'nome correto na planilha');
  ok(visivel('view-lista'), 'voltou para a listagem depois de salvar');
  ok(txt('#toast').indexOf('Exercício salvo') >= 0, 'toast de sucesso: ' + txt('#toast'));
  ok(txt('#listaContent').indexOf('Supino reto') >= 0, 'card aparece na lista');
  ok(txt('#listaContent').indexOf('4×12') >= 0 && txt('#listaContent').indexOf('40 kg') >= 0, 'séries×reps e carga no card');
  ok(txt('#listaContent').indexOf('Aquecer antes') >= 0, 'observação no card');

  // mais dois, para testar busca e filtros
  const criar = async (n, g, d, s, r, c) => {
    doc.querySelector('.bottom-nav a[data-ir="cadastro"]').click(); await calma();
    preencher(n, g, d, s, r, c, '');
    $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await calma();
  };
  await criar('Agachamento livre', 'Pernas', 'Treino B', 4, 10, 60);
  await criar('Puxada frontal', 'Costas', 'Treino A', 3, 12, 50);
  ok(listarExercicios().length === 3, 'planilha com 3 exercícios');
  ok(doc.querySelectorAll('#listaContent .ex-card').length === 3, '3 cards renderizados');

  console.log('\n== READ: busca e filtros ==');
  $('#busca').value = 'agach';
  $('#busca').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await calma();
  ok(doc.querySelectorAll('#listaContent .ex-card').length === 1, 'busca "agach" filtra para 1');
  $('#busca').value = 'zzzz';
  $('#busca').dispatchEvent(new dom.window.Event('input', { bubbles: true })); await calma();
  ok(txt('#listaContent').indexOf('Nada encontrado') >= 0, 'busca sem resultado mostra "Nada encontrado"');
  $('#busca').value = '';
  $('#busca').dispatchEvent(new dom.window.Event('input', { bubbles: true })); await calma();

  $('#filtroGrupo').value = 'Peito';
  $('#filtroGrupo').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await calma();
  ok(doc.querySelectorAll('#listaContent .ex-card').length === 1, 'filtro por grupo "Peito" -> 1 card');
  $('#filtroGrupo').value = '';
  $('#filtroGrupo').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await calma();

  $('#filtroTreino').value = 'Treino A';
  $('#filtroTreino').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await calma();
  ok(doc.querySelectorAll('#listaContent .ex-card').length === 2, 'filtro por "Treino A" -> 2 cards');
  $('#filtroTreino').value = '';
  $('#filtroTreino').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await calma();

  console.log('\n== UPDATE ==');
  const idSupino = listarExercicios().find(e => e.nome === 'Supino reto').id;
  doc.querySelector('[data-editar="' + idSupino + '"]').click(); await calma();
  ok(visivel('view-form') && txt('#formTitulo') === 'Editar Exercício', 'abriu a tela de edição');
  ok($('#f-nome').value === 'Supino reto' && $('#f-carga').value === '40', 'formulário veio preenchido (carga=' + $('#f-carga').value + ')');
  ok(txt('#btnSalvar') === 'Salvar alterações', 'botão vira "Salvar alterações"');
  $('#f-carga').value = '45'; $('#f-nome').value = 'Supino inclinado';
  $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await calma();
  const atualizado = listarExercicios().find(e => e.id === idSupino);
  ok(atualizado.carga === 45 && atualizado.nome === 'Supino inclinado', 'planilha atualizada (carga=' + atualizado.carga + ')');
  ok(listarExercicios().length === 3, 'update não criou linha nova');
  ok(txt('#listaContent').indexOf('45 kg') >= 0, 'lista já mostra a carga nova');

  console.log('\n== DELETE ==');
  doc.querySelector('[data-excluir="' + idSupino + '"]').click(); await calma();
  ok($('#modalBackdrop').classList.contains('open'), 'modal de confirmação abriu');
  ok(txt('#modalMsg').indexOf('Supino inclinado') >= 0, 'modal cita o exercício: ' + txt('#modalMsg'));
  $('#modalCancel').click(); await calma();
  ok(!$('#modalBackdrop').classList.contains('open'), 'Cancelar fecha o modal');
  ok(listarExercicios().length === 3, 'Cancelar NÃO excluiu nada');

  doc.querySelector('[data-excluir="' + idSupino + '"]').click(); await calma();
  $('#modalOk').click(); await calma();
  ok(listarExercicios().length === 2, 'Confirmar excluiu da planilha');
  ok(txt('#listaContent').indexOf('Supino inclinado') < 0, 'card sumiu da lista');

  console.log('\n== HOME reflete os dados ==');
  doc.querySelector('.bottom-nav a[data-ir="home"]').click(); await calma();
  ok(stats('#homeStats')[0] === '2 Exercícios cadastrados', 'stats: ' + stats('#homeStats').join(' | '));
  ok(stats('#homeStats')[3] === '110 Carga total (kg)', 'carga total somada 60+50 -> ' + stats('#homeStats')[3]);
  $('#homeTreino').value = 'Treino B';
  $('#homeTreino').dispatchEvent(new dom.window.Event('change', { bubbles: true })); await calma();
  ok(stats('#homeStats')[0] === '1 Exercícios no treino' && stats('#homeStats')[1] === '4 Séries no treino',
    'filtro da home recalcula: ' + stats('#homeStats').join(' | '));
  ok(txt('#homeList').indexOf('Agachamento livre') >= 0, 'lista da home filtrada');
  ok(doc.querySelectorAll('#homeList .ex-actions').length === 0, 'cards da home não têm botões de ação');

  console.log('\n== MENU LATERAL / APAGAR TUDO ==');
  $('#menuBtn').click(); await calma();
  ok($('#drawer').classList.contains('open'), 'menu abre');
  $('#backdrop').click(); await calma();
  ok(!$('#drawer').classList.contains('open'), 'clicar fora fecha o menu');
  $('#menuBtn').click(); $('#btnApagarTudo').click(); await calma();
  ok($('#modalBackdrop').classList.contains('open') && !$('#drawer').classList.contains('open'),
    'Apagar tudo fecha o menu e pede confirmação');
  $('#modalOk').click(); await calma();
  ok(listarExercicios().length === 0, 'planilha zerada');
  ok(visivel('view-lista') && txt('#listaContent').indexOf('Sua lista está vazia') >= 0, 'voltou ao estado vazio');

  console.log('\n== CARREGAR EXEMPLOS ==');
  $('#btnExemplos').click(); await calma();
  ok(listarExercicios().length === 3, 'exemplos gravados na planilha');
  ok(doc.querySelectorAll('#listaContent .ex-card').length === 3, '3 cards renderizados');

  console.log('\n== TELA SOBRE ==');
  doc.querySelector('.bottom-nav a[data-ir="sobre"]').click(); await calma();
  ok(visivel('view-sobre') && txt('#tituloPagina') === 'Sobre', 'abre a tela Sobre');
  ok($('#fab').hidden === true, 'FAB escondido na tela Sobre');

  console.log('\n== LINK DO VÍDEO no cartão ==');
  doc.querySelector('.bottom-nav a[data-ir="lista"]').click(); await calma();
  const cardDe = nome => [...doc.querySelectorAll('#listaContent .ex-card')]
    .find(c => c.querySelector('.ex-name').textContent === nome);

  const videoSupino = cardDe('Supino reto').querySelector('.ex-video');
  ok(!!videoSupino, 'exercício com link mostra o botão "Ver vídeo"');
  ok(videoSupino.getAttribute('href').indexOf('youtube.com') >= 0,
    'href aponta para o vídeo: ' + videoSupino.getAttribute('href'));
  ok(videoSupino.getAttribute('target') === '_blank', 'abre em nova aba (target=_blank)');
  ok((videoSupino.getAttribute('rel') || '').indexOf('noopener') >= 0, 'com rel=noopener');
  ok(!cardDe('Puxada frontal').querySelector('.ex-video'), 'exercício sem link não mostra o botão');

  console.log('\n== LINK DO VÍDEO no formulário ==');
  doc.querySelector('.bottom-nav a[data-ir="cadastro"]').click(); await calma();
  preencher('Remada curvada', 'Costas', 'Treino B', 3, 12, 30, '');
  $('#f-link').value = 'youtube.com/watch?v=semprotocolo';
  $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await calma();
  ok($('#f-link').closest('.field').classList.contains('invalid'), 'link sem http:// marca erro no campo');
  ok(listarExercicios().length === 3, 'e nada foi gravado');

  $('#f-link').value = 'https://www.youtube.com/watch?v=ok123';
  $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await calma();
  const remada = listarExercicios().find(e => e.nome === 'Remada curvada');
  ok(!!remada && remada.link === 'https://www.youtube.com/watch?v=ok123', 'com http(s) salva o link na planilha');

  doc.querySelector('[data-editar="' + remada.id + '"]').click(); await calma();
  ok($('#f-link').value === 'https://www.youtube.com/watch?v=ok123', 'edição vem com o link preenchido');
  $('#f-link').value = '';
  $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await calma();
  ok(listarExercicios().find(e => e.id === remada.id).link === '', 'dá para apagar o link editando');
  ok(!cardDe('Remada curvada').querySelector('.ex-video'), 'e o botão some do cartão');

  console.log('\n== AGENDA: montar a semana ==');
  doc.querySelector('.bottom-nav a[data-ir="agenda"]').click(); await calma();
  ok(visivel('view-agenda') && txt('#tituloPagina') === 'Agenda da Semana', 'abre a tela Agenda');
  ok(doc.querySelectorAll('#agendaDias .dia-card').length === 7, '7 cartões, um por dia da semana');
  ok(txt('#agendaResumo').indexOf('24/08 a 30/08') >= 0, 'cabeçalho da semana: ' + txt('#agendaResumo'));
  ok(txt('#agendaResumo').indexOf('Nenhum treino agendado') >= 0, 'placar começa vazio');
  ok(doc.querySelectorAll('#agendaDias .check-btn').length === 0, 'sem treino agendado não há o que marcar');

  const cardDia = nome => [...doc.querySelectorAll('#agendaDias .dia-card')]
    .find(c => c.querySelector('.dia-nome').textContent === nome);
  const selectDia = nome => [...doc.querySelectorAll('#agendaDias select')]
    .find(sel => sel.getAttribute('data-dia-treino') === nome);
  const escolher = async (dia, treino) => {
    const sel = selectDia(dia);
    sel.value = treino;
    sel.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    await calma();
  };

  ok(doc.querySelectorAll('#agendaDias .tag-hoje').length === 1, 'exatamente um dia marcado como "hoje"');
  ok(!!cardDia('Segunda').querySelector('.tag-hoje'), 'hoje é Segunda (relógio fixo em 24/08/2026)');

  await escolher('Segunda', 'Treino A');
  ok(lerAgenda_()['Segunda'] === 'Treino A', 'gravou na aba Agenda da planilha');
  ok(!!cardDia('Segunda').querySelector('.check-btn'), 'o dia agendado ganha o botão de marcar');
  ok(cardDia('Segunda').querySelector('.dia-meta').textContent.indexOf('1 exercício') >= 0,
    'conta os exercícios do treino: ' + cardDia('Segunda').querySelector('.dia-meta').textContent);

  await escolher('Quarta', 'Treino E');
  ok(!!cardDia('Quarta').querySelector('.dia-meta .alerta'), 'avisa quando o treino não tem exercício cadastrado');

  await escolher('Quarta', 'Treino B');
  ok(lerAgenda_()['Quarta'] === 'Treino B', 'trocar o treino do dia sobrescreve');
  ok(cardDia('Terça').querySelector('.dia-meta').textContent === 'Dia de descanso', 'dia sem treino diz "Dia de descanso"');

  console.log('\n== CHECKLIST: marcar o treino como feito ==');
  const btnDia = nome => cardDia(nome).querySelector('.check-btn');
  ok(btnDia('Segunda').getAttribute('aria-pressed') === 'false', 'começa desmarcado');

  btnDia('Segunda').click(); await calma();
  ok(lerFeitos_().join() === 'Segunda', 'gravou na aba Checklist da planilha');
  ok(btnDia('Segunda').getAttribute('aria-pressed') === 'true', 'botão fica pressionado');
  ok(cardDia('Segunda').classList.contains('feito'), 'cartão ganha o estilo de concluído');
  ok(txt('#agendaResumo').indexOf('1 de 2 treinos feitos') >= 0, 'placar: ' + txt('#agendaResumo'));
  ok(doc.querySelector('#agendaResumo .barra i').style.width === '50%',
    'barra em 50%: ' + doc.querySelector('#agendaResumo .barra i').style.width);

  btnDia('Quarta').click(); await calma();
  ok(lerFeitos_().length === 2, 'dois dias marcados');
  ok(doc.querySelector('#agendaResumo .barra i').style.width === '100%', 'barra completa');

  btnDia('Segunda').click(); await calma();
  ok(lerFeitos_().join() === 'Quarta', 'clicar de novo desmarca só aquele dia');

  console.log('\n== Virar o dia para Descanso apaga a marcação ==');
  ok(lerFeitos_().indexOf('Quarta') >= 0, 'quarta está marcada');
  await escolher('Quarta', '');
  ok(lerFeitos_().indexOf('Quarta') < 0, 'virou Descanso e a marcação sumiu da planilha');
  ok(!cardDia('Quarta').querySelector('.check-btn'), 'e o botão de marcar some do cartão');

  console.log('\n== Reiniciar marcações da semana ==');
  await escolher('Quarta', 'Treino B');
  btnDia('Segunda').click(); await calma();
  btnDia('Quarta').click(); await calma();
  ok(lerFeitos_().length === 2, 'dois dias marcados antes de reiniciar');

  $('#btnReiniciar').click(); await calma();
  ok($('#modalBackdrop').classList.contains('open'), 'reiniciar pede confirmação');
  $('#modalCancel').click(); await calma();
  ok(lerFeitos_().length === 2, 'cancelar não apaga nada');

  $('#btnReiniciar').click(); await calma();
  $('#modalOk').click(); await calma();
  ok(lerFeitos_().length === 0, 'confirmar limpa as marcações');
  ok(lerAgenda_()['Segunda'] === 'Treino A', 'mas a agenda em si continua montada');
  ok(txt('#agendaResumo').indexOf('0 de 2 treinos feitos') >= 0, 'placar zerado: ' + txt('#agendaResumo'));

  console.log('\n== ERRO DO SERVIDOR VIRA MENSAGEM NA TELA ==');
  const original = global.criarExercicio;
  global.criarExercicio = () => { throw new Error('Planilha indisponível.'); };
  doc.querySelector('.bottom-nav a[data-ir="cadastro"]').click(); await calma();
  preencher('Teste', 'Peito', 'Treino A', 3, 10, 20, '');
  $('#exForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await calma();
  ok(txt('#toast').indexOf('Planilha indisponível') >= 0, 'erro do servidor aparece no toast: ' + txt('#toast'));
  ok(visivel('view-form'), 'continua no formulário para não perder o que foi digitado');
  ok($('#btnSalvar').disabled === false, 'botão Salvar reabilitado depois do erro');
  global.criarExercicio = original;

  console.log('\n== LINK PERIGOSO gravado à mão na planilha ==');
  // O servidor recusa 'javascript:' na validação, mas nada impede alguém de
  // digitar isso direto na célula. O cliente precisa se defender ao renderizar.
  const linhaRemada = abas['Exercicios'].grade.find(l => l && l[1] === 'Remada curvada');
  linhaRemada[9] = 'javascript:alert(1)';
  ok(listarExercicios().find(e => e.nome === 'Remada curvada').link === 'javascript:alert(1)',
    'planilha realmente tem o link perigoso');

  // Abre o app do zero, agora já com o dado ruim vindo da planilha
  const dom2 = new JSDOM(html, opcoesJsdom());
  await espera(80);
  const doc2 = dom2.window.document;
  doc2.querySelector('.bottom-nav a[data-ir="lista"]').click();
  await espera(60);

  const cards2 = [...doc2.querySelectorAll('#listaContent .ex-card')];
  const remada2 = cards2.find(c => c.querySelector('.ex-name').textContent === 'Remada curvada');
  ok(cards2.length > 0 && !!remada2, 'segundo app carregou a lista da planilha');
  ok(!remada2.querySelector('.ex-video'), 'link javascript: NÃO vira botão clicável');
  ok([...doc2.querySelectorAll('a')].every(a => !/^javascript:/i.test(a.getAttribute('href') || '')),
    'nenhum link javascript: em lugar nenhum da página');

  console.log('\n== PWA: o que faz o Android tratar como aplicativo ==');
  const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'docs', 'manifest.json'), 'utf8'));
  ok(manifesto.display === 'standalone',
    'display: "standalone" -> abre sem a barra de endereço e sem a barra do navegador');
  ok(manifesto.name === 'TreinoFácil' && !!manifesto.short_name, 'nome do app definido');
  ok(manifesto.start_url === './' && manifesto.scope === './',
    'start_url e scope relativos (funcionam em subpasta do GitHub Pages)');
  ok(manifesto.theme_color === '#4338CA', 'theme_color combina com o cabeçalho do app');

  const tamanhos = manifesto.icons.map(i => i.sizes);
  ok(tamanhos.indexOf('192x192') >= 0 && tamanhos.indexOf('512x512') >= 0,
    'ícones 192 e 512 declarados: ' + tamanhos.join(', '));
  ok(manifesto.icons.some(i => i.purpose === 'maskable'),
    'há um ícone "maskable" (o Android recorta no formato do sistema)');
  ok(manifesto.icons.every(i => fs.existsSync(path.join(RAIZ, 'docs', i.src))),
    'todos os arquivos de ícone existem mesmo em docs/');

  // O <head> precisa apontar para o manifest, senão nada disso vale
  const cabeca = fs.readFileSync(path.join(RAIZ, 'docs', 'index.html'), 'utf8');
  ok(/<link[^>]+rel="manifest"[^>]+href="manifest\.json"/.test(cabeca),
    'index.html declara <link rel="manifest">');
  ok(/<link[^>]+rel="apple-touch-icon"/.test(cabeca), 'e o apple-touch-icon, para o iOS');
  ok(/name="apple-mobile-web-app-capable"[^>]+content="yes"/.test(cabeca),
    'modo app no iOS (que ignora o manifest)');
  ok(/name="viewport"/.test(cabeca), 'viewport declarado');
  ok(cabeca.indexOf('<base target="_top">') < 0, 'sem o <base> que só fazia sentido no iframe do Apps Script');

  const sw = fs.readFileSync(path.join(RAIZ, 'docs', 'sw.js'), 'utf8');
  ['./index.html', './css/style.css', './js/app.js', './icons/icon-192.png'].forEach(arq =>
    ok(sw.indexOf(arq) >= 0, 'service worker guarda ' + arq)
  );
  ok(/req\.method !== 'GET'/.test(sw), 'e não tenta cachear POST (as chamadas à API)');

  console.log('\n== OFFLINE: abrir sem rede usando o último retrato ==');
  const retrato = dom.window.localStorage.getItem(CHAVE_CACHE);
  ok(!!retrato, 'o app foi salvando o retrato da planilha no localStorage');
  ok(JSON.parse(retrato).exercicios.length > 0, 'e o retrato tem exercícios dentro');

  const domOff = new JSDOM(html, opcoesJsdom({
    offline: true,
    semente: { chave: CHAVE_CACHE, valor: retrato }
  }));
  await espera(80);
  const docOff = domOff.window.document;

  ok(docOff.getElementById('offlineAviso').hidden === false, 'aparece o aviso de "sem conexão"');
  ok(docOff.getElementById('view-home').classList.contains('active'), 'mesmo assim o app abre na Início');
  ok(docOff.querySelectorAll('#homeStats .stat').length === 4, 'e desenha os números do retrato salvo');
  ok(docOff.getElementById('homeStats').textContent.indexOf('Não foi possível') < 0,
    'sem tela de erro, porque havia retrato');

  docOff.querySelector('.bottom-nav a[data-ir="lista"]').click();
  await espera(40);
  ok(docOff.querySelectorAll('#listaContent .ex-card').length > 0, 'a listagem também funciona offline');

  console.log('\n== OFFLINE sem retrato: erro claro em vez de tela vazia ==');
  const domSemNada = new JSDOM(html, opcoesJsdom({ offline: true }));
  await espera(80);
  ok(domSemNada.window.document.getElementById('homeStats').textContent.indexOf('Não foi possível') >= 0,
    'mostra o aviso de falha');
  ok(!!domSemNada.window.document.getElementById('btnTentarDeNovo'), 'com botão de tentar de novo');

  console.log('\n== URL da API não configurada ==');
  const htmlSemUrl = html.replace(
    "const API = '" + API_FALSA + "';",
    "const API = 'COLE_AQUI_A_URL_QUE_TERMINA_EM_exec';");
  const domSemUrl = new JSDOM(htmlSemUrl, opcoesJsdom());
  await espera(80);
  const avisoUrl = domSemUrl.window.document.getElementById('homeStats').textContent;
  ok(avisoUrl.indexOf('URL do Apps Script') >= 0,
    'diz exatamente o que falta configurar: ' + avisoUrl.replace(/\s+/g, ' ').trim().slice(0, 90));

  console.log(falhas === 0 ? '\nTODOS OS TESTES DE INTERFACE PASSARAM\n' : '\n' + falhas + ' TESTE(S) FALHARAM\n');
  process.exit(falhas === 0 ? 0 : 1);
})();
