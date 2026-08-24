# TreinoFácil — Planilha Google + Apps Script + PWA

App de treinos com as 4 operações CRUD, agenda da semana e checklist.
**Sem Netlify e sem Make.** São duas peças, e as duas são gratuitas:

| Peça | Onde mora | Papel |
|------|-----------|-------|
| **`docs/`** | GitHub Pages | A interface. É um **PWA**: instala na tela inicial com ícone próprio, abre sem as barras do navegador e funciona offline. |
| **`apps-script/Codigo.gs`** | Google Apps Script | O servidor de dados. Recebe JSON e lê/escreve na **Planilha Google**. |

```
  Celular
     │  instala pela tela inicial (manifest.json)
     ▼
  GitHub Pages  ──── fetch() POST {acao, args} ────►  Apps Script /exec
  docs/index.html                                          │  doPost()
  docs/js/app.js   ◄──── { ok: true, dados } ──────────────┤
  docs/sw.js (offline)                                     ▼
  docs/manifest.json                                Planilha Google
                                          (Exercicios / Agenda / Checklist)
```

> **Por que duas peças?** Para o Android tratar o site como aplicativo — ícone
> próprio e sem as barras do navegador — ele precisa de um `manifest.json`
> declarado na página principal. Quando o Apps Script servia o HTML, a página
> principal era do Google e o nosso conteúdo ficava num iframe, então o manifest
> nunca valia. Servindo o front por conta própria, ele passa a valer.

---

## As 3 abas da planilha

Todas são criadas sozinhas na primeira execução — você não monta nada à mão.

### `Exercicios` — o cadastro

| Coluna | Conteúdo |
|---|---|
| `id` | identificador gerado pelo script (`ex_...`) |
| `nome` | nome do exercício |
| `grupo` | grupo muscular |
| `dia` | a qual treino pertence (Treino A–E) |
| `series`, `repeticoes`, `carga` | números |
| `obs` | observação livre |
| `criadoEm` | data/hora do cadastro |
| `link` | URL de um vídeo mostrando a execução (opcional) |

### `Agenda` — a semana montada

7 linhas fixas, uma por dia. `treino` vazio significa **Descanso**.
Os exercícios de cada dia não são digitados de novo: são os que já têm aquele
`Treino` no cadastro.

### `Checklist` — o que já foi feito

Uma linha por dia concluído. Existir a linha = feito; desmarcar apaga a linha.
A coluna `semana` guarda a **segunda-feira** daquela semana — é isso que faz o
checklist se zerar sozinho na virada, mantendo as semanas anteriores como
histórico.

---

## Publicar — parte 1: o servidor (Apps Script)

### 1. Criar a planilha

Abra <https://sheets.new>, dê um nome (ex.: *TreinoFácil — Banco de Dados*).

### 2. Abrir o editor de script

Na planilha: **Extensões → Apps Script**. Isso cria um projeto já vinculado à
planilha, então `PLANILHA_ID` pode ficar vazio.

### 3. Colar o código

O editor abre com um `Código.gs` contendo um `myFunction()` vazio. Apague tudo e
cole o conteúdo de **`apps-script/Codigo.gs`**. Salve (💾).

É o único arquivo — não há mais HTML aqui.

### 4. Testar antes de publicar

Escolha a função **`testarCRUD`** na barra do topo e clique **Executar** (depois
repita com **`testarAgenda`**). Na primeira vez o Google pede autorização:

1. **Revisar permissões** → escolha sua conta.
2. "O Google não verificou este app" → **Avançado** →
   **Acessar (não seguro)**. É esperado: o app não verificado é o seu próprio
   script, e a permissão é para mexer na sua planilha.
3. **Permitir**.

Volte à planilha: as abas foram criadas e o **Registro de execução** mostra o
create/read/update/delete acontecendo.

### 5. Publicar como app da web

**Implantar → Nova implantação**:

1. No ícone de engrenagem, escolha **App da Web**.
2. **Executar como:** **Eu**
3. **Quem tem acesso:** **Qualquer pessoa**
4. **Implantar** → copie a **URL do app da web** (termina em `/exec`).

> **"Qualquer pessoa" é obrigatório.** Sem isso o navegador recebe a página de
> login do Google em vez do JSON, e o app mostra erro de conexão.

---

## Publicar — parte 2: o app (GitHub Pages)

### 6. Colar a URL da API

Abra **`docs/js/app.js`** e troque a primeira linha de configuração:

```js
const API = 'COLE_AQUI_A_URL_QUE_TERMINA_EM_exec';
```

pela URL que você copiou no passo 5.

### 7. Subir para o GitHub

Crie um repositório **público** (o GitHub Pages só é gratuito em repositório
público) e suba a pasta do projeto.

```bash
git init
git add .
git commit -m "TreinoFácil"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/treinofacil.git
git push -u origin main
```

### 8. Ligar o GitHub Pages

No repositório: **Settings → Pages**

- **Source:** `Deploy from a branch`
- **Branch:** `main` e a pasta **`/docs`**
- **Save**

Em um ou dois minutos sai o endereço:
`https://SEU_USUARIO.github.io/treinofacil/`

> A pasta chama `docs` justamente porque o GitHub Pages oferece essa opção
> pronta no menu — não precisa configurar mais nada.

### 9. (Opcional) Apontar o /exec para o app

Em `apps-script/Codigo.gs`, preencha `URL_DO_APP` com o endereço do Pages e
publique uma nova versão. Quem abrir a URL `/exec` no navegador verá uma página
avisando onde está o app, em vez de um JSON solto.

---

## Instalar no celular

1. Abra o endereço do GitHub Pages no **Chrome** ou **Brave** do Android.
2. Menu **⋮** → **Instalar aplicativo** (ou *Adicionar à tela inicial*).
3. O ícone do halter aparece na tela inicial, e ao tocar o app abre **sem a
   barra de endereço e sem a barra do navegador**.

No **iPhone**: Safari → botão de compartilhar → **Adicionar à Tela de Início**.

> Se ainda aparecer o ícone genérico e as barras do navegador, é porque o
> celular guardou o atalho antigo. Apague o atalho, feche as abas do site,
> e adicione de novo.

---

## Alterou alguma coisa? O que republicar

| Você mexeu em... | O que fazer |
|---|---|
| `apps-script/Codigo.gs` | **Implantar → Gerenciar implantações → ✏️ → Versão: Nova versão**. Salvar no editor **não** atualiza o `/exec`. |
| Qualquer arquivo de `docs/` | `git push`. O Pages atualiza sozinho em ~1 minuto. |
| `docs/css`, `docs/js` ou `docs/index.html` | Além do push, **suba o número em `docs/sw.js`** (`treinofacil-v1` → `v2`). Senão o Service Worker continua servindo a versão antiga do cache. |

---

## Como o código está organizado

**`apps-script/Codigo.gs`** (servidor), em 9 blocos comentados:

1. **A API JSON** — `doPost()` recebe `{ acao, args }`; `acoesPermitidas_()` é a
   lista branca do que pode ser chamado de fora (nada além dela roda);
   `responderJson_()` transforma exceção em `{ ok: false, erro }`.
2. **Acesso à planilha** — cria as abas na primeira vez; `garantirColunas_()`
   completa o cabeçalho de uma planilha antiga sem a coluna `link`;
   `comTrava_()` usa `LockService` contra cliques simultâneos.
3. **Conversão linha ↔ objeto**.
4. **A semana corrente** — `inicioDaSemana_()` acha a segunda-feira.
5. **Validação** — o servidor revalida tudo, inclusive o formato do `link`.
6. **As 4 operações CRUD** — mais `carregarDados()`, que devolve exercícios,
   agenda, checklist e as opções dos selects numa chamada só.
7. **Agenda** — `lerAgenda_()`, `salvarAgenda()`.
8. **Checklist** — `lerFeitos_()`, `marcarDia()`, `reiniciarSemana()`.
9. **`testarCRUD()` e `testarAgenda()`** — testes manuais pelo editor.

**`docs/js/app.js`** (cliente): `Servidor.chamar()` faz um POST só, sempre para a
mesma URL. O estado fica no objeto `App`, cópia em memória dos dados da planilha
— trocar de tela, buscar e filtrar é instantâneo, e só as operações de escrita
vão à rede. `Retrato` guarda o último pacote no `localStorage`, para o app abrir
offline em modo leitura.

> **Detalhe do POST:** o `Content-Type` é `text/plain`, não `application/json`.
> Com `application/json` o navegador dispararia um *preflight* (`OPTIONS`), que o
> Apps Script não responde — e a chamada morreria em erro de CORS. Com
> `text/plain` ela vira uma *simple request* e passa. O corpo continua sendo JSON.

### Onde cada operação acontece

| Operação | Tela | Cliente (`app.js`) | Servidor (`Codigo.gs`) |
|----------|------|--------------------|------------------------|
| Create | Novo Exercício | `aoSalvar()` | `criarExercicio()` → `appendRow` |
| Read | Início / Meus Treinos | `iniciar()`, `renderLista()` | `carregarDados()` |
| Update | Editar Exercício | `aoSalvar()` | `atualizarExercicio()` → `setValues` |
| Delete | Meus Treinos | `pedirExclusao()` | `excluirExercicio()` → `deleteRow` |
| Montar a semana | Agenda | `trocarTreinoDoDia()` | `salvarAgenda()` |
| Marcar como feito | Agenda | `alternarFeito()` | `marcarDia()` |

---

## Problemas comuns

### O app abre e diz "Sem conexão com o servidor"

Quase sempre é a implantação. Confira em **Implantar → Gerenciar implantações**
se **Quem tem acesso** está em **Qualquer pessoa**. Com qualquer outra opção o
Apps Script devolve a tela de login do Google, e o `fetch` não consegue ler.

### "Falta configurar a URL do Apps Script"

O `const API` em `docs/js/app.js` continua com o texto de exemplo. Cole ali a URL
que termina em `/exec`.

### Alterei o `Codigo.gs` e o app não mudou

Salvar no editor não republica. **Implantar → Gerenciar implantações → ✏️ →
Versão: Nova versão.**

### Alterei o `docs/` e o celular mostra a versão velha

O Service Worker está servindo o cache. Suba o número em `docs/sw.js`
(`treinofacil-v1` → `v2`) e dê push. No computador dá para forçar em
*DevTools → Application → Service Workers → Unregister*.

### O ícone da tela inicial continua errado

O atalho antigo ficou salvo. Apague-o, feche as abas do site e instale de novo
pelo menu **⋮ → Instalar aplicativo**. Se o menu só oferece "Adicionar à tela
inicial" e não "Instalar aplicativo", o navegador não achou o `manifest.json` —
confira se o endereço abre `https://.../manifest.json` sem erro 404.

### `Planilha não encontrada`

O projeto do Apps Script foi criado avulso, sem estar vinculado à planilha. Copie
o ID da planilha da URL (o trecho entre `/d/` e `/edit`) e cole em
`PLANILHA_ID`, no topo do `Codigo.gs`.

---

## Limites do plano gratuito

Nada que um trabalho de faculdade encoste: 20.000 execuções/dia no Apps Script e
1 GB de site no GitHub Pages. Cada abertura do app gasta 1 execução, e cada
salvar/excluir mais 1.

---

## Testes automatizados (opcional)

A pasta `testes/` roda no seu computador, com a planilha emulada — serve para
conferir tudo antes de publicar:

```bash
cd testes
npm install          # baixa o jsdom
npm test
```

São **216 verificações**, em duas suítes:

- **`servidor.test.js`** (88) — roda o `Codigo.gs` de verdade contra uma planilha
  emulada: CRUD, validação, migração da planilha de 9 para 10 colunas, agenda,
  checklist, virada de semana (com o relógio adiantado na marra), e a camada de
  API — inclusive recusando ação fora da lista branca e função interna do script.
- **`interface.test.js`** (128) — roda o `docs/index.html` e o `docs/js/app.js`
  de verdade num DOM (jsdom). O `fetch` falso chama o `doPost()` real, então cada
  clique atravessa a mesma camada de API da produção. Cobre navegação, busca,
  filtros, modal, o botão de vídeo, a agenda com checklist, o conteúdo do
  `manifest.json` e do `sw.js`, e o modo offline.

O emulador em `planilhaFalsa.js` reproduz de propósito as **regras** do Apps
Script, não só as assinaturas — é isso que faz um teste local falhar pelos mesmos
motivos que o Google falharia.
