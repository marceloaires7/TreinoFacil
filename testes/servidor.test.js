/* Testes do SERVIDOR — Codigo.gs contra uma planilha emulada. */
/* Carrega o Codigo.gs de verdade (apps-script/Codigo.gs) no escopo global,
   por cima da planilha emulada em planilhaFalsa.js. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const RAIZ = path.join(__dirname, '..');
const { criarAmbiente } = require('./planilhaFalsa.js');
const { abas, ss } = criarAmbiente();
const grade = () => abas['Exercicios'].grade;
vm.runInThisContext(fs.readFileSync(path.join(RAIZ, 'apps-script', 'Codigo.gs'), 'utf8'));

// Todo dado agora tem dono. U é o usuário padrão dos testes.
const U = 'marcelo';
criarUsuario_(U, 'senha-do-marcelo', 'Marcelo');

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
const TOKEN = login(U, 'senha-do-marcelo').token;
const chamarApi = (acao, ...args) => JSON.parse(
  doPost({ postData: { contents: JSON.stringify({ acao: acao, args: args, token: TOKEN }) } }).getContent()
);

const aviso = doGet({});
ok(aviso.getContent().indexOf('TreinoFácil') >= 0, 'GET sem parâmetro devolve a página de aviso');
ok(aviso._titulo === 'TreinoFácil — API', 'com o título certo: ' + aviso._titulo);
ok(aviso.getContent().indexOf('URL_DO_APP') >= 0, 'e lembra de configurar a URL do app');

const viaGet = doGet({ parameter: { acao: 'listarExercicios', token: TOKEN } });
ok(viaGet.getMimeType() === 'application/json', 'resposta sai como JSON: ' + viaGet.getMimeType());
ok(JSON.parse(viaGet.getContent()).ok === true, 'GET com ?acao= roda a ação (bom para depurar no navegador)');

const criado = chamarApi('criarExercicio', {
  nome: 'Via API', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 10, carga: 25, obs: '', link: ''
});
ok(criado.ok === true && criado.dados.nome === 'Via API', 'POST cria de verdade na planilha');
ok(listarExercicios(U).length === 1, 'e a linha está lá');

const lido = chamarApi('carregarDados');
ok(lido.ok === true && lido.dados.exercicios.length === 1, 'POST carregarDados devolve o pacote inteiro');

console.log('\n== API: erros viram { ok:false, erro } em vez de estourar ==');
const invalido = chamarApi('criarExercicio', { nome: '', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 10, carga: 1 });
ok(invalido.ok === false && invalido.erro.indexOf('nome') >= 0,
  'erro de validação volta como mensagem: ' + invalido.erro);
ok(listarExercicios(U).length === 1, 'e nada foi gravado');

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

excluirTodos(U);

console.log('\n== READ inicial (planilha vazia) ==');
ok(JSON.stringify(listarExercicios(U)) === '[]', 'lista vazia devolve []');
ok(grade()[0] && grade()[0][0] === 'id', 'cabeçalho criado automaticamente: ' + JSON.stringify(grade()[0]));

console.log('\n== CREATE ==');
const a = criarExercicio(U, { nome: 'Supino reto', grupo: 'Peito', dia: 'Treino A', series: '4', repeticoes: '12', carga: '40', obs: 'Aquecer' });
const b = criarExercicio(U, { nome: 'Agachamento', grupo: 'Pernas', dia: 'Treino B', series: 4, repeticoes: 10, carga: 60, obs: '' });
ok(!!a.id && a.id !== b.id, 'ids gerados e distintos: ' + a.id + ' / ' + b.id);
ok(a.series === 4 && a.carga === 40, 'strings do formulário viraram número (series=' + a.series + ', carga=' + a.carga + ')');
ok(listarExercicios(U).length === 2, 'READ enxerga os 2 registros');

console.log('\n== CREATE inválido (validação do servidor) ==');
esperaErro(() => criarExercicio(U, { nome: '', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 10, carga: 10 }), 'nome', 'nome vazio é barrado');
esperaErro(() => criarExercicio(U, { nome: 'X', grupo: 'Hackeado', dia: 'Treino A', series: 4, repeticoes: 10, carga: 10 }), 'Grupo', 'grupo fora da lista é barrado');
esperaErro(() => criarExercicio(U, { nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 99, repeticoes: 10, carga: 10 }), 'Séries', 'séries fora da faixa é barrado');
esperaErro(() => criarExercicio(U, { nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 10, carga: -5 }), 'Carga', 'carga negativa é barrada');
ok(listarExercicios(U).length === 2, 'nenhum inválido foi gravado');

console.log('\n== UPDATE ==');
const alterado = atualizarExercicio(U, a.id, { nome: 'Supino inclinado', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 15, carga: 45, obs: 'mudou' });
ok(alterado.id === a.id, 'id preservado no update');
ok(alterado.criadoEm === a.criadoEm, 'criadoEm preservado no update');
ok(listarExercicios(U).find(e => e.id === a.id).carga === 45, 'carga gravada na planilha = 45');
ok(listarExercicios(U).length === 2, 'update não duplicou linha');
esperaErro(() => atualizarExercicio(U, 'id_que_nao_existe', { nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 10, carga: 10 }), 'não encontrado', 'update de id inexistente é barrado');

console.log('\n== DELETE ==');
excluirExercicio(U, a.id);
const sobrou = listarExercicios(U);
ok(sobrou.length === 1 && sobrou[0].id === b.id, 'excluiu o certo e manteve o outro');
esperaErro(() => excluirExercicio(U, a.id), 'não encontrado', 'excluir duas vezes é barrado');

console.log('\n== CREATE depois do DELETE (a linha some de verdade) ==');
const c = criarExercicio(U, { nome: 'Remada', grupo: 'Costas', dia: 'Treino C', series: 3, repeticoes: 12, carga: 30, obs: '' });
ok(listarExercicios(U).length === 2, 'voltou a ter 2 registros');
ok(listarExercicios(U).map(e => e.nome).join(', ') === 'Agachamento, Remada', 'ordem/conteúdo corretos');

console.log('\n== carregarDados (chamada de abertura) ==');
const boot = carregarDados(U);
ok(boot.grupos.length === 8 && boot.treinos.length === 5, 'devolve grupos e treinos para os selects');
ok(boot.exercicios.length === 2, 'devolve os exercícios junto');

console.log('\n== excluirTodos ==');
excluirTodos(U);
ok(listarExercicios(U).length === 0, 'planilha zerada');
ok(grade()[0][0] === 'id', 'cabeçalho NÃO foi apagado');

console.log('\n== carregarExemplos ==');
ok(carregarExemplos(U).length === 3, 'carregou os 3 exemplos');


console.log('\n== COLUNA link (vídeo do exercício) ==');
ok(COLUNAS.length === 11 && COLUNAS[9] === 'link' && COLUNAS[10] === 'usuario', 'colunas: ' + COLUNAS.join(','));
ok(grade()[0][9] === 'link', 'cabeçalho da planilha tem a coluna link');

excluirTodos(U);
const comVideo = criarExercicio(U, {
  nome: 'Supino', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 12, carga: 40,
  obs: '', link: 'https://www.youtube.com/watch?v=abc123'
});
ok(comVideo.link === 'https://www.youtube.com/watch?v=abc123', 'link salvo no objeto');
ok(listarExercicios(U)[0].link === comVideo.link, 'link relido da planilha');

const semVideo = criarExercicio(U, {
  nome: 'Prancha', grupo: 'Abdômen', dia: 'Treino A', series: 3, repeticoes: 30, carga: 0, obs: ''
});
ok(semVideo.link === '', 'link é opcional (ausente vira string vazia)');

esperaErro(() => criarExercicio(U, {
  nome: 'X', grupo: 'Peito', dia: 'Treino A', series: 3, repeticoes: 10, carga: 10,
  link: 'youtube.com/watch?v=abc'
}), 'http', 'link sem http:// é barrado');

const semLink = atualizarExercicio(U, comVideo.id, {
  nome: 'Supino', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 12, carga: 40, obs: '', link: ''
});
ok(semLink.link === '', 'dá para apagar o link num update');

console.log('\n== MIGRAÇÃO: planilha antiga com 9 colunas ==');
delete abas['Exercicios'];
const antiga = ss.insertSheet('Exercicios');
antiga.getRange(1, 1, 1, 9).setValues([['id', 'nome', 'grupo', 'dia', 'series', 'repeticoes', 'carga', 'obs', 'criadoEm']]);
antiga.getRange(2, 1, 1, 9).setValues([['ex_velho01', 'Rosca direta', 'Bíceps', 'Treino D', 3, 12, 18, 'sem vídeo', '01/01/2026 08:00']]);

ok(listarExercicios(U).length === 0, 'antes de adotar, a linha antiga (sem dono) fica invisível');
ok(antiga.getLastColumn() === 11 && antiga.grade[0][9] === 'link' && antiga.grade[0][10] === 'usuario',
  'colunas link e usuario acrescentadas ao cabeçalho antigo');

const adotadas = adotarRegistrosSemDono_(U);
ok(adotadas === 1, 'adotarRegistrosSemDono_ carimbou 1 linha: ' + adotadas);
const migrados = listarExercicios(U);
ok(migrados.length === 1 && migrados[0].nome === 'Rosca direta', 'depois de adotar, o registro antigo aparece');
ok(adotarRegistrosSemDono_(U) === 0, 'rodar de novo não faz nada (idempotente)');
ok(migrados[0].link === '', 'registro antigo fica com link vazio');
ok(migrados[0].carga === 18, 'dados antigos intactos (carga=' + migrados[0].carga + ')');

const novoNaAntiga = criarExercicio(U, {
  nome: 'Tríceps corda', grupo: 'Tríceps', dia: 'Treino D', series: 3, repeticoes: 15, carga: 22,
  obs: '', link: 'https://exemplo.com/v'
});
ok(listarExercicios(U).length === 2 && novoNaAntiga.link === 'https://exemplo.com/v',
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
const vazia = lerAgenda_(U);
ok(Object.keys(vazia).length === 7, 'agenda nasce com os 7 dias');
ok(DIAS_SEMANA.every(d => vazia[d] === ''), 'todos os dias começam em Descanso');

salvarAgenda(U, 'Segunda', 'Treino A');
salvarAgenda(U, 'Quarta', 'Treino B');
salvarAgenda(U, 'Sexta', 'Treino C');
const cheia = lerAgenda_(U);
ok(cheia['Segunda'] === 'Treino A' && cheia['Quarta'] === 'Treino B' && cheia['Sexta'] === 'Treino C',
  'treinos gravados nos dias certos');
ok(cheia['Terça'] === '' && cheia['Domingo'] === '', 'dias não preenchidos seguem em Descanso');

salvarAgenda(U, 'Segunda', 'Treino E');
ok(lerAgenda_(U)['Segunda'] === 'Treino E', 'trocar o treino do dia sobrescreve');
ok(abas['Agenda'].grade.filter(l => l && l[0] === 'Segunda' && l[2] === U).length === 1,
  'trocar o treino não duplica a linha do dia');

esperaErro(() => salvarAgenda(U, 'Sexta-feira', 'Treino A'), 'Dia', 'dia da semana inválido é barrado');
esperaErro(() => salvarAgenda(U, 'Segunda', 'Treino Z'), 'Treino', 'treino inexistente é barrado');
salvarAgenda(U, 'Segunda', 'Treino A');

console.log('\n== CHECKLIST ==');
ok(lerFeitos_(U).length === 0, 'semana começa sem nada marcado');

marcarDia(U, 'Segunda', true);
ok(lerFeitos_(U).join() === 'Segunda', 'marcou segunda: ' + JSON.stringify(lerFeitos_(U)));

marcarDia(U, 'Segunda', true);
ok(abas['Checklist'].getLastRow() === 2, 'marcar de novo não duplica linha');

marcarDia(U, 'Quarta', true);
ok(lerFeitos_(U).length === 2, 'duas marcações na semana');

marcarDia(U, 'Segunda', false);
ok(lerFeitos_(U).join() === 'Quarta', 'desmarcar remove só o dia certo: ' + JSON.stringify(lerFeitos_(U)));

esperaErro(() => marcarDia(U, 'Feriado', true), 'Dia', 'dia inválido é barrado no checklist');

console.log('\n== Descanso apaga a marcação do dia ==');
marcarDia(U, 'Quarta', true);
ok(lerFeitos_(U).indexOf('Quarta') >= 0, 'quarta marcada antes');
salvarAgenda(U, 'Quarta', '');
ok(lerFeitos_(U).indexOf('Quarta') < 0, 'virar Descanso desmarca o dia');
salvarAgenda(U, 'Quarta', 'Treino B');

console.log('\n== VIRADA DE SEMANA: zera sozinho e guarda histórico ==');
marcarDia(U, 'Segunda', true);
marcarDia(U, 'Quarta', true);
const linhasAntes = abas['Checklist'].getLastRow();
ok(lerFeitos_(U).length === 2, 'semana de 24/08 com 2 dias feitos');

__setAgora(new Date('2026-08-31T07:00:00'));   // segunda seguinte
ok(infoSemana_().chave === '2026-08-31', 'virou para a semana de 31/08');
ok(lerFeitos_(U).length === 0, 'checklist aparece limpo sozinho, sem apagar nada');
ok(abas['Checklist'].getLastRow() === linhasAntes, 'as linhas da semana anterior continuam na planilha (histórico)');

marcarDia(U, 'Terça', true);
ok(lerFeitos_(U).join() === 'Terça', 'a semana nova marca do zero');
ok(abas['Checklist'].getLastRow() === linhasAntes + 1, 'histórico cresce em vez de sobrescrever');

__setAgora(new Date('2026-08-24T10:00:00'));   // volta para a semana anterior
ok(lerFeitos_(U).length === 2, 'voltando no tempo, a semana antiga reaparece intacta');

console.log('\n== reiniciarSemana ==');
reiniciarSemana(U);
ok(lerFeitos_(U).length === 0, 'semana atual zerada');
__setAgora(new Date('2026-08-31T07:00:00'));
ok(lerFeitos_(U).join() === 'Terça', 'a outra semana não foi tocada');
__setAgora(new Date('2026-08-24T10:00:00'));

console.log('\n== CHECKLIST: célula da semana convertida em Date pelo Sheets ==');
// O Google Sheets converte o texto '2026-08-24' em data. Quando isso acontece,
// comparar o valor cru nunca bate — era o bug que deixava o contador em 0.
const ck = abas['Checklist'];
const limparChecklist = () => { ck.grade.length = 1; };   // deixa só o cabeçalho

limparChecklist();
ck.grade[1] = [new Date('2026-08-24T00:00:00'), 'Segunda', '24/08/2026 19:00', U];
ok(lerFeitos_(U).join() === 'Segunda', 'encontra a marcação mesmo com a célula como Date');

ck.grade[2] = ['2026-08-24', 'Quarta', '26/08/2026 20:00', U];
ok(lerFeitos_(U).sort().join() === 'Quarta,Segunda', 'lê Date e texto misturados na mesma aba');

ck.grade[3] = [new Date('2026-08-31T00:00:00'), 'Terça', '31/08/2026 07:00', U];
ok(lerFeitos_(U).length === 2, 'e ignora a semana seguinte (Date de outra semana)');

console.log('\n== CHECKLIST: linhas duplicadas de planilha antiga ==');
// Enquanto o bug existia, cada clique gravava uma linha nova.
limparChecklist();
ck.grade[1] = [new Date('2026-08-24T00:00:00'), 'Segunda', '24/08/2026 19:00', U];
ck.grade[2] = [new Date('2026-08-24T00:00:00'), 'Segunda', '24/08/2026 19:05', U];
ck.grade[3] = ['2026-08-24', 'Segunda', '24/08/2026 19:07', U];
ok(lerFeitos_(U).length === 1, '3 linhas do mesmo dia contam como 1: ' + JSON.stringify(lerFeitos_(U)));

marcarDia(U, 'Segunda', true);
ok(ck.getLastRow() === 4, 'marcar de novo não acrescenta uma quarta linha');

marcarDia(U, 'Segunda', false);
ok(lerFeitos_(U).length === 0, 'desmarcar limpa o dia');
ok(ck.getLastRow() === 1, 'e apaga TODAS as duplicatas, não só a primeira');

console.log('\n== CHECKLIST: ciclo normal depois da correção ==');
limparChecklist();
marcarDia(U, 'Segunda', true);
marcarDia(U, 'Quarta', true);
ok(lerFeitos_(U).sort().join() === 'Quarta,Segunda', 'marca dois dias');
ok(ck.getLastRow() === 3, 'uma linha por dia, sem duplicar');
ok(chaveDaCelula_(ck.grade[1][0]) === '2026-08-24', 'a semana gravada é a corrente');
marcarDia(U, 'Segunda', false);
ok(lerFeitos_(U).join() === 'Quarta', 'desmarcar tira só o dia certo');
limparChecklist();

console.log('\n== carregarDados leva agenda e checklist junto ==');
salvarAgenda(U, 'Segunda', 'Treino A');
marcarDia(U, 'Segunda', true);
const pacote = carregarDados(U);
ok(!!pacote.agenda && !!pacote.semana && Array.isArray(pacote.feitos), 'carregarDados devolve agenda, semana e feitos');
ok(pacote.diasSemana.length === 7, 'devolve os 7 dias para montar a tela');
ok(pacote.agenda['Segunda'] === 'Treino A', 'agenda no pacote de abertura');
ok(pacote.feitos.join() === 'Segunda', 'feitos no pacote de abertura');

console.log('\n== testarAgenda (função do editor) ==');
testarAgenda();
ok(lerAgenda_(U)['Quarta'] === 'Treino B', 'testarAgenda rodou sem erro');

console.log('\n== CONTAS: criação ==');
esperaErro(() => criarUsuario_('ab', 'senha123', 'X'), 'caracteres', 'usuário curto demais é barrado');
esperaErro(() => criarUsuario_('Com Espaço', 'senha123', 'X'), 'caracteres', 'usuário com espaço é barrado');
esperaErro(() => criarUsuario_('novo', '123', 'X'), 'pelo menos', 'senha curta é barrada');
esperaErro(() => criarUsuario_('marcelo', 'outra-senha', 'X'), 'Já existe', 'usuário repetido é barrado');
ok(criarUsuario_('  ANA  ', 'senha-da-ana', 'Ana').usuario === 'ana', 'usuário é normalizado (minúsculo, sem espaços)');

const linhaAna = abas['Usuarios'].grade.find(l => l && l[0] === 'ana');
ok(linhaAna[3] !== 'senha-da-ana' && linhaAna[3].length === 64, 'a planilha guarda um hash de 64 hex, não a senha');
ok(linhaAna[2].length > 20, 'e um salt por conta');
criarUsuario_('bia', 'senha-da-ana', 'Bia');                       // mesma senha que a Ana
const linhaBia = abas['Usuarios'].grade.find(l => l && l[0] === 'bia');
ok(linhaBia[3] !== linhaAna[3], 'duas contas com a MESMA senha têm hashes diferentes (salt funciona)');

console.log('\n== LOGIN ==');
const sessao = login('marcelo', 'senha-do-marcelo');
ok(!!sessao.token && sessao.usuario === 'marcelo' && sessao.nome === 'Marcelo', 'login certo devolve token, usuário e nome');
ok(sessao.token.split('.').length === 2, 'token tem formato carga.assinatura');
ok(login('  MARCELO ', 'senha-do-marcelo').usuario === 'marcelo', 'login aceita o usuário com caixa/espaços diferentes');

esperaErro(() => login('marcelo', 'errada'), 'incorretos', 'senha errada é recusada');
esperaErro(() => login('ninguem', 'qualquer'), 'incorretos', 'usuário inexistente dá a MESMA mensagem (não entrega quem existe)');
esperaErro(() => login('', ''), 'Informe', 'campos vazios são barrados');

console.log('\n== LOGIN: bloqueio por tentativas ==');
for (let i = 0; i < 4; i++) { try { login('ana', 'errada'); } catch (e) { } }
esperaErro(() => login('ana', 'errada'), 'incorretos', '5ª tentativa errada ainda diz "incorretos"');
esperaErro(() => login('ana', 'senha-da-ana'), 'Muitas tentativas', 'a 6ª é bloqueada MESMO com a senha certa');
ok(!!login('marcelo', 'senha-do-marcelo').token, 'o bloqueio é por usuário: outro entra normal');

__setAgora(new Date('2026-08-24T10:16:00'));      // 16 minutos depois
ok(!!login('ana', 'senha-da-ana').token, 'passados 15 minutos, o bloqueio expira');
__setAgora(new Date('2026-08-24T10:00:00'));
ok(!!login('ana', 'senha-da-ana').token, 'depois de acertar, o contador zera');

console.log('\n== TOKEN ==');
ok(validarToken_(sessao.token) === 'marcelo', 'token válido identifica o usuário');
const [carga, assinatura] = sessao.token.split('.');
const codigoDe = fn => { try { fn(); return null; } catch (e) { return e.codigo || 'sem-codigo:' + e.message; } };
ok(codigoDe(() => validarToken_('')) === 'SESSAO_INVALIDA', 'token vazio');
ok(codigoDe(() => validarToken_('lixo')) === 'SESSAO_INVALIDA', 'token sem formato');
ok(codigoDe(() => validarToken_(carga + '.' + 'a'.repeat(64))) === 'SESSAO_INVALIDA', 'assinatura errada');
const cargaAna = Utilities.base64EncodeWebSafe('ana|' + (Date.now() + 1000000));
ok(codigoDe(() => validarToken_(cargaAna + '.' + assinatura)) === 'SESSAO_INVALIDA',
  'trocar o usuário na carga e reaproveitar a assinatura NÃO funciona');
ok(codigoDe(() => validarToken_(carga + 'x.' + assinatura)) === 'SESSAO_INVALIDA', 'carga adulterada');

__setAgora(new Date('2026-09-24T10:00:00'));      // 31 dias depois
ok(codigoDe(() => validarToken_(sessao.token)) === 'SESSAO_INVALIDA', 'token expira depois de 30 dias');
__setAgora(new Date('2026-08-24T10:00:00'));
ok(validarToken_(sessao.token) === 'marcelo', 'voltando no tempo, vale de novo (a expiração está na carga)');

criarUsuario_('temporario', 'senha-temp', 'Temp');
const tokenTemp = login('temporario', 'senha-temp').token;
abas['Usuarios'].grade.splice(abas['Usuarios'].grade.findIndex(l => l && l[0] === 'temporario'), 1);
ok(codigoDe(() => validarToken_(tokenTemp)) === 'SESSAO_INVALIDA', 'conta apagada da planilha derruba o token');

console.log('\n== API exige token ==');
const semToken = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'listarExercicios', args: [] }) } }).getContent());
ok(semToken.ok === false && semToken.codigo === 'SESSAO_INVALIDA', 'sem token: { ok:false, codigo:SESSAO_INVALIDA }');
const loginApi = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'login', args: ['ana', 'senha-da-ana'] }) } }).getContent());
ok(loginApi.ok === true && !!loginApi.dados.token, 'login pela API funciona sem token');
const comToken = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'carregarDados', args: [], token: loginApi.dados.token }) } }).getContent());
ok(comToken.ok === true && comToken.dados.usuario === 'ana' && comToken.dados.nome === 'Ana',
  'e o token identifica quem está chamando: ' + comToken.dados.usuario);
const fingindo = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'listarExercicios', args: ['marcelo'], token: loginApi.dados.token }) } }).getContent());
ok(fingindo.ok === true, 'chamada com args extras não quebra...');
ok(!fingindo.dados.some(e => e.nome === 'Via API' || e.nome === 'Tríceps corda'),
  '...mas passar "marcelo" nos args não faz a Ana ver os dados dele (o usuário vem só do token)');

console.log('\n== ISOLAMENTO entre usuários ==');
excluirTodos(U);
const deMarcelo = criarExercicio(U, { nome: 'Supino do Marcelo', grupo: 'Peito', dia: 'Treino A', series: 4, repeticoes: 12, carga: 40 });
const deAna = criarExercicio('ana', { nome: 'Agachamento da Ana', grupo: 'Pernas', dia: 'Treino A', series: 4, repeticoes: 10, carga: 30 });
ok(listarExercicios(U).map(e => e.nome).join() === 'Supino do Marcelo', 'Marcelo vê só o dele');
ok(listarExercicios('ana').map(e => e.nome).join() === 'Agachamento da Ana', 'Ana vê só o dela');

esperaErro(() => atualizarExercicio('ana', deMarcelo.id, { nome: 'Hackeado', grupo: 'Peito', dia: 'Treino A', series: 1, repeticoes: 1, carga: 0 }),
  'não encontrado', 'Ana não consegue editar o exercício do Marcelo pelo id');
esperaErro(() => excluirExercicio('ana', deMarcelo.id), 'não encontrado', 'nem excluir');
ok(listarExercicios(U)[0].nome === 'Supino do Marcelo', 'o exercício do Marcelo continua intacto');

salvarAgenda(U, 'Segunda', 'Treino A');
salvarAgenda('ana', 'Segunda', 'Treino B');
ok(lerAgenda_(U)['Segunda'] === 'Treino A' && lerAgenda_('ana')['Segunda'] === 'Treino B',
  'cada um tem a própria agenda para o mesmo dia');

marcarDia(U, 'Segunda', true);
ok(lerFeitos_(U).join() === 'Segunda' && lerFeitos_('ana').length === 0, 'checklist do Marcelo não aparece para a Ana');
marcarDia('ana', 'Segunda', true);
reiniciarSemana('ana');
ok(lerFeitos_(U).join() === 'Segunda', 'Ana reiniciar a semana dela não apaga a do Marcelo');

excluirTodos('ana');
ok(listarExercicios('ana').length === 0 && listarExercicios(U).length === 1, 'apagar tudo da Ana não toca no Marcelo');

console.log('\n== TROCAR SENHA ==');
esperaErro(() => trocarSenha('ana', 'errada', 'nova-senha-123'), 'não confere', 'exige a senha atual');
esperaErro(() => trocarSenha('ana', 'senha-da-ana', '123'), 'pelo menos', 'nova senha curta é barrada');
ok(trocarSenha('ana', 'senha-da-ana', 'nova-senha-123') === true, 'troca com senha atual certa');
esperaErro(() => login('ana', 'senha-da-ana'), 'incorretos', 'a senha antiga deixa de valer');
ok(!!login('ana', 'nova-senha-123').token, 'e a nova entra');

console.log('\n== PEPPER: hash depende do segredo fora da planilha ==');
const hashAntes = hashSenha_('abc123', 'sal');
__propriedades['PEPPER_SENHA'] = 'outro-segredo';
ok(hashSenha_('abc123', 'sal') !== hashAntes, 'mudando o pepper, o mesmo (senha, salt) dá outro hash');
delete __propriedades['PEPPER_SENHA'];
ok(hashSenha_('abc123', 'sal') !== hashAntes, 'sem o pepper original, quem baixou a planilha não recalcula o hash');

console.log('\n== cadastrarUsuarios (função do editor) ==');
const antesDoWrapper = abas['Usuarios'].getLastRow();
cadastrarUsuarios();
ok(abas['Usuarios'].getLastRow() === antesDoWrapper, 'com as senhas de exemplo, o wrapper não cria ninguém');

console.log('\n== testarCRUD / testarAgenda usam o 1º usuário ==');
ok(usuarioParaTeste_() === 'marcelo', 'usuarioParaTeste_ pega o primeiro da aba');
const antesTeste = listarExercicios(U).length;
testarCRUD();
ok(listarExercicios(U).length === antesTeste, 'testarCRUD limpa o próprio registro');

console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM\n' : '\n' + falhas + ' TESTE(S) FALHARAM\n');
process.exit(falhas === 0 ? 0 : 1);
