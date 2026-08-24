/* Testes do SERVIDOR — Codigo.gs contra uma planilha emulada. */
/* Carrega o Codigo.gs de verdade (../Codigo.gs) no escopo global,
   por cima da planilha emulada em planilhaFalsa.js. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const { criarAmbiente } = require('./planilhaFalsa.js');
const { abas, ss } = criarAmbiente();
const grade = () => abas['Exercicios'].grade;
vm.runInThisContext(fs.readFileSync(path.join(RAIZ, 'apps-script', 'Codigo.gs'), 'utf8'));

let falhas = 0;
function ok(cond, msg) {
  console.log((cond ? '  PASSOU  ' : '  FALHOU  ') + msg);
  if (!cond) falhas++;
}
function esperaErro(fn, trecho, msg) {
  try { fn(); ok(false, msg + ' (não lançou erro)'); }
  catch (e) { ok(String(e.message).indexOf(trecho) >= 0, msg + ' -> "' + e.message + '"'); }
}

console.log('\n== API: doGet e doPost ==');
const chamarApi = (acao, ...args) => JSON.parse(
  doPost({ postData: { contents: JSON.stringify({ acao: acao, args: args }) } }).getContent()
);

const aviso = doGet({});
ok(aviso.getContent().indexOf('TreinoFácil') >= 0, 'GET sem parâmetro devolve a página de aviso');
ok(aviso._titulo === 'TreinoFácil — API', 'com o título certo: ' + aviso._titulo);
ok(aviso.getContent().indexOf('URL_DO_APP') >= 0, 'e lembra de configurar a URL do app');

const viaGet = doGet({ parameter: { acao: 'listarExercicios' } });
ok(viaGet.getMimeType() === 'application/json', 'resposta sai como JSON: ' + viaGet.getMimeType());
ok(JSON.parse(viaGet.getContent()).ok === true, 'GET com ?acao= roda a ação (bom para depurar no navegador)');

const criado = chamarApi('criarExercicio', {
  nome: 'Via API', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 10, carga: 25, obs: '', link: ''
});
ok(criado.ok === true && criado.dados.nome === 'Via API', 'POST cria de verdade na planilha');
ok(listarExercicios().length === 1, 'e a linha está lá');

const lido = chamarApi('carregarDados');
ok(lido.ok === true && lido.dados.exercicios.length === 1, 'POST carregarDados devolve o pacote inteiro');

console.log('\n== API: erros viram { ok:false, erro } em vez de estourar ==');
const invalido = chamarApi('criarExercicio', { nome: '', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 10, carga: 1 });
ok(invalido.ok === false && invalido.erro.indexOf('nome') >= 0,
  'erro de validação volta como mensagem: ' + invalido.erro);
ok(listarExercicios().length === 1, 'e nada foi gravado');

const desconhecida = chamarApi('formatarODisco');
ok(desconhecida.ok === false && desconhecida.erro.indexOf('desconhecida') >= 0,
  'ação fora da lista é recusada: ' + desconhecida.erro);

const privada = chamarApi('getAba_');
ok(privada.ok === false, 'função interna do script NÃO é chamável de fora');

const corpoQuebrado = JSON.parse(doPost({ postData: { contents: 'isto não é json' } }).getContent());
ok(corpoQuebrado.ok === false && corpoQuebrado.erro.indexOf('JSON') >= 0,
  'corpo malformado responde erro em vez de quebrar: ' + corpoQuebrado.erro);

const semCorpo = JSON.parse(doPost({}).getContent());
ok(semCorpo.ok === false, 'POST vazio também é tratado');

excluirTodos();

console.log('\n== READ inicial (planilha vazia) ==');
ok(JSON.stringify(listarExercicios()) === '[]', 'lista vazia devolve []');
ok(grade()[0] && grade()[0][0] === 'id', 'cabeçalho criado automaticamente: ' + JSON.stringify(grade()[0]));

console.log('\n== CREATE ==');
const a = criarExercicio({ nome: 'Supino reto', grupo: 'Peito', dia: 'Treino A', series: '4', repeticoes: '12', carga: '40', obs: 'Aquecer' });
const b = criarExercicio({ nome: 'Agachamento', grupo: 'Pernas', dia: 'Treino B', series: 4, repeticoes: 10, carga: 60, obs: '' });
ok(!!a.id && a.id !== b.id, 'ids gerados e distintos: ' + a.id + ' / ' + b.id);
ok(a.series === 4 && a.carga === 40, 'strings do formulário viraram número (series=' + a.series + ', carga=' + a.carga + ')');
ok(listarExercicios().length === 2, 'READ enxerga os 2 registros');

console.log('\n== CREATE inválido (validação do servidor) ==');
esperaErro(() => criarExercicio({ nome: '', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 10, carga: 10 }), 'nome', 'nome vazio é barrado');
esperaErro(() => criarExercicio({ nome: 'X', grupo: 'Hackeado', dia: 'Treino A', series: 4, repeticoes: 10, carga: 10 }), 'Grupo', 'grupo fora da lista é barrado');
esperaErro(() => criarExercicio({ nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 99, repeticoes: 10, carga: 10 }), 'Séries', 'séries fora da faixa é barrado');
esperaErro(() => criarExercicio({ nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 10, carga: -5 }), 'Carga', 'carga negativa é barrada');
ok(listarExercicios().length === 2, 'nenhum inválido foi gravado');

console.log('\n== UPDATE ==');
const alterado = atualizarExercicio(a.id, { nome: 'Supino inclinado', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 15, carga: 45, obs: 'mudou' });
ok(alterado.id === a.id, 'id preservado no update');
ok(alterado.criadoEm === a.criadoEm, 'criadoEm preservado no update');
ok(listarExercicios().find(e => e.id === a.id).carga === 45, 'carga gravada na planilha = 45');
ok(listarExercicios().length === 2, 'update não duplicou linha');
esperaErro(() => atualizarExercicio('id_que_nao_existe', { nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 10, carga: 10 }), 'não encontrado', 'update de id inexistente é barrado');

console.log('\n== DELETE ==');
excluirExercicio(a.id);
const sobrou = listarExercicios();
ok(sobrou.length === 1 && sobrou[0].id === b.id, 'excluiu o certo e manteve o outro');
esperaErro(() => excluirExercicio(a.id), 'não encontrado', 'excluir duas vezes é barrado');

console.log('\n== CREATE depois do DELETE (a linha some de verdade) ==');
const c = criarExercicio({ nome: 'Remada', grupo: 'Costas', dia: 'Treino C', series: 3, repeticoes: 12, carga: 30, obs: '' });
ok(listarExercicios().length === 2, 'voltou a ter 2 registros');
ok(listarExercicios().map(e => e.nome).join(', ') === 'Agachamento, Remada', 'ordem/conteúdo corretos');

console.log('\n== carregarDados (chamada de abertura) ==');
const boot = carregarDados();
ok(boot.grupos.length === 8 && boot.treinos.length === 5, 'devolve grupos e treinos para os selects');
ok(boot.exercicios.length === 2, 'devolve os exercícios junto');

console.log('\n== excluirTodos ==');
excluirTodos();
ok(listarExercicios().length === 0, 'planilha zerada');
ok(grade()[0][0] === 'id', 'cabeçalho NÃO foi apagado');

console.log('\n== carregarExemplos ==');
ok(carregarExemplos().length === 3, 'carregou os 3 exemplos');

console.log('\n== testarCRUD (função do editor) ==');
testarCRUD();
ok(listarExercicios().length === 3, 'testarCRUD limpou o próprio registro de teste');

console.log('\n== COLUNA link (vídeo do exercício) ==');
ok(COLUNAS.length === 10 && COLUNAS[9] === 'link', 'coluna "link" declarada por último: ' + COLUNAS.join(','));
ok(grade()[0][9] === 'link', 'cabeçalho da planilha tem a coluna link');

excluirTodos();
const comVideo = criarExercicio({
  nome: 'Supino', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 12, carga: 40,
  obs: '', link: 'https://www.youtube.com/watch?v=abc123'
});
ok(comVideo.link === 'https://www.youtube.com/watch?v=abc123', 'link salvo no objeto');
ok(listarExercicios()[0].link === comVideo.link, 'link relido da planilha');

const semVideo = criarExercicio({
  nome: 'Prancha', grupo: 'Abdômen', dia: 'Treino A', series: 3, repeticoes: 30, carga: 0, obs: ''
});
ok(semVideo.link === '', 'link é opcional (ausente vira string vazia)');

esperaErro(() => criarExercicio({
  nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 10, carga: 10,
  link: 'youtube.com/watch?v=abc'
}), 'http', 'link sem http:// é barrado');

const semLink = atualizarExercicio(comVideo.id, {
  nome: 'Supino', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 12, carga: 40, obs: '', link: ''
});
ok(semLink.link === '', 'dá para apagar o link num update');

console.log('\n== MIGRAÇÃO: planilha antiga com 9 colunas ==');
delete abas['Exercicios'];
const antiga = ss.insertSheet('Exercicios');
antiga.getRange(1, 1, 1, 9).setValues([['id', 'nome', 'grupo', 'dia', 'series', 'repeticoes', 'carga', 'obs', 'criadoEm']]);
antiga.getRange(2, 1, 1, 9).setValues([['ex_velho01', 'Rosca direta', 'Bíceps', 'Treino D', 3, 12, 18, 'sem vídeo', '01/01/2026 08:00']]);

const migrados = listarExercicios();
ok(antiga.getLastColumn() === 10 && antiga.grade[0][9] === 'link', 'coluna link acrescentada ao cabeçalho antigo');
ok(migrados.length === 1 && migrados[0].nome === 'Rosca direta', 'registro antigo continua legível');
ok(migrados[0].link === '', 'registro antigo fica com link vazio');
ok(migrados[0].carga === 18, 'dados antigos intactos (carga=' + migrados[0].carga + ')');

const novoNaAntiga = criarExercicio({
  nome: 'Tríceps corda', grupo: 'Tríceps', dia: 'Treino D', series: 3, repeticoes: 15, carga: 22,
  obs: '', link: 'https://exemplo.com/v'
});
ok(listarExercicios().length === 2 && novoNaAntiga.link === 'https://exemplo.com/v',
  'escrever na planilha migrada funciona');

console.log('\n== SEMANA (relógio fixo em segunda, 24/08/2026) ==');
const semana = infoSemana_();
ok(semana.chave === '2026-08-24', 'chave da semana = segunda-feira: ' + semana.chave);
ok(semana.rotulo === '24/08 a 30/08', 'rótulo da semana: ' + semana.rotulo);
ok(semana.hoje === 'Segunda', 'dia de hoje: ' + semana.hoje);

__setAgora(new Date('2026-08-27T19:00:00'));   // quinta da MESMA semana
ok(infoSemana_().chave === '2026-08-24', 'quinta cai na mesma semana');
ok(infoSemana_().hoje === 'Quinta', 'hoje vira Quinta');

__setAgora(new Date('2026-08-30T22:00:00'));   // domingo, ainda a mesma semana
ok(infoSemana_().chave === '2026-08-24', 'domingo ainda é a semana que começou na segunda');
ok(infoSemana_().hoje === 'Domingo', 'hoje vira Domingo');

__setAgora(new Date('2026-08-24T10:00:00'));   // volta para a segunda

console.log('\n== AGENDA ==');
const vazia = lerAgenda_();
ok(Object.keys(vazia).length === 7, 'agenda nasce com os 7 dias');
ok(DIAS_SEMANA.every(d => vazia[d] === ''), 'todos os dias começam em Descanso');

salvarAgenda('Segunda', 'Treino A');
salvarAgenda('Quarta', 'Treino B');
salvarAgenda('Sexta', 'Treino C');
const cheia = lerAgenda_();
ok(cheia['Segunda'] === 'Treino A' && cheia['Quarta'] === 'Treino B' && cheia['Sexta'] === 'Treino C',
  'treinos gravados nos dias certos');
ok(cheia['Terça'] === '' && cheia['Domingo'] === '', 'dias não preenchidos seguem em Descanso');

salvarAgenda('Segunda', 'Treino E');
ok(lerAgenda_()['Segunda'] === 'Treino E', 'trocar o treino do dia sobrescreve');
ok(abas['Agenda'].getLastRow() === 8, 'agenda continua com 7 linhas + cabeçalho (não duplicou)');

esperaErro(() => salvarAgenda('Sexta-feira', 'Treino A'), 'Dia', 'dia da semana inválido é barrado');
esperaErro(() => salvarAgenda('Segunda', 'Treino Z'), 'Treino', 'treino inexistente é barrado');
salvarAgenda('Segunda', 'Treino A');

console.log('\n== CHECKLIST ==');
ok(lerFeitos_().length === 0, 'semana começa sem nada marcado');

marcarDia('Segunda', true);
ok(lerFeitos_().join() === 'Segunda', 'marcou segunda: ' + JSON.stringify(lerFeitos_()));

marcarDia('Segunda', true);
ok(abas['Checklist'].getLastRow() === 2, 'marcar de novo não duplica linha');

marcarDia('Quarta', true);
ok(lerFeitos_().length === 2, 'duas marcações na semana');

marcarDia('Segunda', false);
ok(lerFeitos_().join() === 'Quarta', 'desmarcar remove só o dia certo: ' + JSON.stringify(lerFeitos_()));

esperaErro(() => marcarDia('Feriado', true), 'Dia', 'dia inválido é barrado no checklist');

console.log('\n== Descanso apaga a marcação do dia ==');
marcarDia('Quarta', true);
ok(lerFeitos_().indexOf('Quarta') >= 0, 'quarta marcada antes');
salvarAgenda('Quarta', '');
ok(lerFeitos_().indexOf('Quarta') < 0, 'virar Descanso desmarca o dia');
salvarAgenda('Quarta', 'Treino B');

console.log('\n== VIRADA DE SEMANA: zera sozinho e guarda histórico ==');
marcarDia('Segunda', true);
marcarDia('Quarta', true);
const linhasAntes = abas['Checklist'].getLastRow();
ok(lerFeitos_().length === 2, 'semana de 24/08 com 2 dias feitos');

__setAgora(new Date('2026-08-31T07:00:00'));   // segunda seguinte
ok(infoSemana_().chave === '2026-08-31', 'virou para a semana de 31/08');
ok(lerFeitos_().length === 0, 'checklist aparece limpo sozinho, sem apagar nada');
ok(abas['Checklist'].getLastRow() === linhasAntes, 'as linhas da semana anterior continuam na planilha (histórico)');

marcarDia('Terça', true);
ok(lerFeitos_().join() === 'Terça', 'a semana nova marca do zero');
ok(abas['Checklist'].getLastRow() === linhasAntes + 1, 'histórico cresce em vez de sobrescrever');

__setAgora(new Date('2026-08-24T10:00:00'));   // volta para a semana anterior
ok(lerFeitos_().length === 2, 'voltando no tempo, a semana antiga reaparece intacta');

console.log('\n== reiniciarSemana ==');
reiniciarSemana();
ok(lerFeitos_().length === 0, 'semana atual zerada');
__setAgora(new Date('2026-08-31T07:00:00'));
ok(lerFeitos_().join() === 'Terça', 'a outra semana não foi tocada');
__setAgora(new Date('2026-08-24T10:00:00'));

console.log('\n== carregarDados leva agenda e checklist junto ==');
salvarAgenda('Segunda', 'Treino A');
marcarDia('Segunda', true);
const pacote = carregarDados();
ok(!!pacote.agenda && !!pacote.semana && Array.isArray(pacote.feitos), 'carregarDados devolve agenda, semana e feitos');
ok(pacote.diasSemana.length === 7, 'devolve os 7 dias para montar a tela');
ok(pacote.agenda['Segunda'] === 'Treino A', 'agenda no pacote de abertura');
ok(pacote.feitos.join() === 'Segunda', 'feitos no pacote de abertura');

console.log('\n== testarAgenda (função do editor) ==');
testarAgenda();
ok(lerAgenda_()['Quarta'] === 'Treino B', 'testarAgenda rodou sem erro');

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM\n' : '\n' + falhas + ' TESTE(S) FALHARAM\n');
process.exit(falhas === 0 ? 0 : 1);
