# Modelo do PDF de Entrega — TreinoFácil

> Preencha os campos entre **[colchetes]**, cole os prints onde indicado e
> exporte como **PDF** (Word/Google Docs: Arquivo → Baixar/Exportar como PDF).

---

## 1. Capa / Identificação  *(máx. 1 página)*

- **Nome do app:** TreinoFácil
- **Aluno(s):** [SEU NOME COMPLETO] — [matrícula, se houver]
- **Disciplina:** Programação para Dispositivos Móveis — Turma B (0426)
- **Professor:** Romes Heriberto Pires de Araújo
- **Problema resolvido:** quem treina costuma anotar séries, repetições e cargas
  no papel ou no bloco de notas do celular. Isso vira bagunça, o histórico se
  perde e fica difícil acompanhar a evolução.
- **Público-alvo:** praticantes de musculação (iniciantes e intermediários) que
  querem organizar a rotina e acompanhar o progresso.

---

## 2. Links do Projeto  *(teste os dois antes de enviar!)*

- **App funcional:** [COLE AQUI o link do GitHub Pages]
  `https://SEU_USUARIO.github.io/treinofacil/`
- **Código-fonte:** [COLE AQUI o link do repositório no GitHub]
- **Design / UI:** [COLE AQUI o link do Figma — opcional, ver observação no fim]

---

## 3. Arquitetura  *(rende pontos: mostra que há um back-end de verdade)*

O app é um **PWA** (Progressive Web App) hospedado no **GitHub Pages**, e os
dados ficam numa **Planilha Google**, acessada por um **Google Apps Script**
publicado como app da web.

```
  Celular (app instalado na tela inicial)
     │
     ▼
  GitHub Pages ──── fetch() POST {acao, args} ────► Apps Script /exec
  (interface: HTML, CSS, JS,                              │
   manifest.json, service worker)  ◄── { ok, dados } ─────┤
                                                          ▼
                                                  Planilha Google
                                      (abas Exercicios / Agenda / Checklist)
```

- **Persistência real:** os dados ficam na planilha, não no aparelho. Abrindo em
  outro celular, os mesmos exercícios aparecem.
- **Validação em duas camadas:** o formulário valida no navegador e o Apps Script
  revalida no servidor, porque a validação do cliente pode ser burlada.
- **App híbrido:** uma única base de código roda em Android e iOS, é instalável
  na tela inicial e funciona offline (Service Worker + Manifest).

`[PRINT — a planilha aberta, mostrando as abas e as linhas gravadas pelo app]`

---

## 4. Relatório de Testes  *(prints das 4 operações CRUD)*

> Tire os prints com o app rodando no celular. Cada figura precisa de legenda.

**Figura 1 — CREATE (Criar):** tela de Cadastro preenchida e, em seguida, o novo
exercício aparecendo na listagem.
`[PRINT 1 — formulário preenchido]`
`[PRINT 2 — item salvo aparecendo na lista]`

**Figura 2 — READ (Ler):** tela de Listagem exibindo os exercícios cadastrados
(mostre a busca e o filtro por grupo muscular funcionando).
`[PRINT 3 — listagem com vários itens]`

**Figura 3 — UPDATE (Atualizar):** tela de Edição com os dados de um exercício e
a lista já refletindo a alteração depois de salvar.
`[PRINT 4 — formulário de edição]`
`[PRINT 5 — item alterado na lista]`

**Figura 4 — DELETE (Excluir):** o diálogo de **confirmação** e a lista sem o
item depois de confirmar.
`[PRINT 6 — modal "Excluir exercício?"]`
`[PRINT 7 — lista após a exclusão]`

---

## 5. Funcionalidades extras  *(diferencial)*

**Figura 5 — Agenda da semana:** cada dia recebe um treino, e o checklist marca o
que já foi feito, com barra de progresso.
`[PRINT 8 — tela da Agenda com alguns dias marcados]`

**Figura 6 — Vídeo do exercício:** cartão do exercício com o botão "Ver vídeo".
`[PRINT 9 — cartão com o botão de vídeo]`

**Figura 7 — App instalado:** o ícone do TreinoFácil na tela inicial do celular e
o app aberto em tela cheia, sem as barras do navegador.
`[PRINT 10 — ícone na tela inicial]`
`[PRINT 11 — app aberto em tela cheia]`

---

## 6. Conclusão  *(opcional, mas conta pontos)*

[Escreva 1 parágrafo. Sugestões do que abordar:

- O que foi mais difícil. Ex.: fazer o navegador conversar com o Apps Script sem
  esbarrar em CORS — a solução foi enviar o POST com `Content-Type: text/plain`,
  porque `application/json` dispara uma requisição de *preflight* que o Apps
  Script não responde.
- Uma decisão de arquitetura que mudou no meio do caminho. Ex.: no começo o
  próprio Apps Script servia a interface, o que era mais simples (um link só),
  mas descobrimos que nesse formato o app não pode ser instalado: o Apps Script
  entrega a página dentro de um iframe, e o `manifest.json` só vale se estiver
  declarado na página principal. Separar a interface no GitHub Pages resolveu.
- O que aprendeu: PWA (manifest, service worker), consumo de API com `fetch`,
  planilha como banco de dados, validação em cliente e servidor.
- O que faria diferente numa próxima versão.]

---

## Roteiro para tirar os prints (passo a passo)

1. Abra o app pelo link do GitHub Pages no celular e instale-o
   (menu **⋮ → Instalar aplicativo**).
2. Para começar limpo: menu **☰ → Apagar todos os dados**.
3. **CREATE:** **+ Novo** → preencha (ex.: *Supino reto, Peito, Treino A, 4×12,
   40 kg*, e cole um link do YouTube) → **Salvar** → print do formulário e da lista.
4. **READ:** cadastre mais 2 ou 3 exercícios em treinos diferentes, mostre a
   lista, a busca e o filtro → print.
5. **UPDATE:** **Editar** num item, mude a carga (40 → 45 kg) → **Salvar** →
   print do formulário e da lista alterada.
6. **DELETE:** **Excluir** → print do modal de confirmação → confirme → print da
   lista sem o item.
7. **Agenda:** escolha treinos para 3 dias, marque 1 ou 2 como feitos → print.
8. **Planilha:** abra a planilha no computador e print das abas com os dados.
9. **App instalado:** print da tela inicial com o ícone e do app aberto.

---

## Dica para o link do Figma (se quiser garantir o item de UI/UX)

O barema cita "UI/UX (Figma)". Como o app foi feito em código, há duas saídas:

- **(Recomendado)** Deixe claro no PDF que o design foi feito diretamente em
  código, e use os próprios prints como evidência de UI/UX — paleta, tipografia,
  navegação e estados (vazio, carregando, erro) estão todos visíveis.
- **(Hedge, ~20 min)** Crie um arquivo no Figma, tecle **F**, escolha um frame de
  iPhone e cole os prints das telas (uma por frame), só para ter um link do Figma
  com permissão de visualização ativada.

Na dúvida, pergunte no fórum **"Fale com o Professor"**.
