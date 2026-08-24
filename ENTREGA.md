# Modelo do PDF de Entrega — TreinoFácil

> Preencha os campos entre **[colchetes]**, cole os prints onde indicado e
> exporte este documento como **PDF** (no Word/Google Docs: Arquivo → Baixar/Exportar como PDF).
> Segue a ordem exata pedida no enunciado.

---

## 1. Capa / Identificação  *(máx. 1 página)*

- **Nome do app:** TreinoFácil
- **Aluno(s):** [SEU NOME COMPLETO] — [matrícula, se houver]
- **Disciplina:** Programação para Dispositivos Móveis — Turma B (0426)
- **Professor:** Romes Heriberto Pires de Araújo
- **Problema resolvido:** quem treina costuma anotar séries, repetições e cargas no papel
  ou no bloco de notas do celular. Isso vira bagunça, o histórico se perde e fica difícil
  acompanhar a evolução nos treinos.
- **Público-alvo:** praticantes de musculação (iniciantes e intermediários) que querem
  organizar a rotina e acompanhar o progresso de forma simples.

---

## 2. Links do Projeto  *(teste os dois antes de enviar!)*

- **App funcional (PWA):** [COLE AQUI o link do Netlify/GitHub Pages]
- **Design / UI:** [COLE AQUI o link do Figma — opcional, ver observação abaixo]

> **Observação (importante):** este app foi construído no formato **PWA** (HTML/CSS/JS),
> o mesmo caminho demonstrado pelo professor no vídeo de apoio (app "FotoFiltro"). Nesse
> formato, **a interface foi desenhada diretamente em código**, então o próprio app
> funcional já é a prova de UI/UX (paleta, tipografia e navegação). Se quiser também
> entregar um link do Figma, veja a dica no fim deste documento.

---

## 3. Relatório de Testes  *(prints das 4 operações CRUD)*

> Tire os prints com o app rodando (no celular ou no navegador). Cada figura precisa de legenda.

**Figura 1 — Operação CREATE (Criar):** tela de Cadastro preenchida e, em seguida, o novo
exercício já aparecendo na listagem.
`[PRINT 1 — formulário preenchido]`
`[PRINT 2 — item salvo aparecendo na lista]`

**Figura 2 — Operação READ (Ler):** tela de Listagem exibindo os exercícios cadastrados
(mostre também a busca/filtro por grupo muscular funcionando).
`[PRINT 3 — listagem com vários itens]`

**Figura 3 — Operação UPDATE (Atualizar):** tela de Edição com os dados de um exercício e a
lista já refletindo a alteração depois de salvar.
`[PRINT 4 — formulário de edição]`
`[PRINT 5 — item alterado na lista]`

**Figura 4 — Operação DELETE (Excluir):** o diálogo de **confirmação** ao excluir e a lista
sem o item depois de confirmar.
`[PRINT 6 — modal "Excluir exercício?"]`
`[PRINT 7 — lista após a exclusão]`

**(Extra) Figura 5 — App instalável / responsivo:** print do app instalado na tela inicial
ou rodando em tela de celular (comprova o "app híbrido").
`[PRINT 8 — app instalado / tela do celular]`

---

## 4. Conclusão  *(opcional, mas conta pontos)*

[Escreva 1 parágrafo: o que foi mais difícil (ex.: implementar o CRUD com persistência,
deixar o design coeso), o que você aprendeu (PWA, manifest, service worker, localStorage,
princípios de UI/UX mobile) e o que faria diferente numa próxima versão.]

---

## Roteiro para tirar os prints (passo a passo)

1. Abra o app pelo link público (ou `http://127.0.0.1:5500`).
2. Se já houver dados, abra o menu (☰) → **Apagar todos os dados** para começar limpo.
3. **CREATE:** toque em **+ Novo** → preencha (ex.: *Supino reto, Peito, Segunda, 4×12, 40kg*) → **Salvar** → print do form e da lista.
4. **READ:** na aba **Treinos**, cadastre mais 1–2 e mostre a lista + a busca/filtro → print.
5. **UPDATE:** toque em **Editar** num item, mude a carga (ex.: 40 → 45kg) → **Salvar** → print do form e da lista alterada.
6. **DELETE:** toque em **Excluir** → print do modal de confirmação → confirme → print da lista sem o item.
7. (Extra) Instale o app: no Chrome do celular, menu → *Adicionar à tela inicial* → print.

---

## Dica para o link do Figma (se quiser garantir o item de 25%)

O barema cita "UI/UX (Figma)". Como você foi pelo PWA, há duas saídas válidas:

- **(Recomendado)** Deixe claro no PDF que o design foi feito em código (PWA), como no vídeo
  do professor, e use os próprios prints como evidência de UI/UX. O app coeso já demonstra
  paleta, tipografia e navegação.
- **(Hedge, ~20 min)** Crie um arquivo no Figma, tecle **F** → escolha um frame de iPhone,
  e cole os prints das 4 telas (uma por frame) só para ter um "link do Figma" com permissão
  de visualização ativada. Não precisa redesenhar — é só documentar.

Se tiver dúvida sobre qual caminho o professor aceita, pergunte no fórum **"Fale com o Professor"**.
