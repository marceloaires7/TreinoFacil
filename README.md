# TreinoFácil 💪

App híbrido (**PWA**) para registrar treinos de academia — desenvolvido para a
**Atividade de Sistematização** da disciplina *Programação para Dispositivos Móveis*.

Implementa as **4 operações CRUD** com persistência local (`localStorage`), funciona
**offline** e é **instalável** em Android e iOS a partir de uma única base.

---

## Como rodar localmente

O app é só HTML/CSS/JS — mas precisa de um servidor (por causa do Service Worker).

**Opção 1 — Python (já instalado):**
```bash
cd SistematizaçãoPDM
python3 -m http.server 5500
```
Abra: <http://127.0.0.1:5500>

**Opção 2 — VS Code:** instale a extensão **Live Server**, clique com o botão direito
em `index.html` → *Open with Live Server* (porta 5500), igual ao vídeo do professor.

---

## Como publicar (gerar o link público para a entrega)

**Mais fácil — Netlify Drop (sem instalar nada):**
1. Acesse <https://app.netlify.com/drop>
2. Arraste a **pasta inteira** `SistematizaçãoPDM` para a página.
3. Em segundos sai um link público tipo `https://seu-app.netlify.app`. (Faça login p/ o link não expirar.)

**Alternativa — GitHub Pages:**
1. Crie um repositório no GitHub e suba estes arquivos.
2. *Settings → Pages → Branch: main → /(root)* → salvar.
3. O link sai em `https://seuusuario.github.io/repositorio/`.

> ⚠️ Teste o link em outro dispositivo/aba anônima antes de entregar (regra do barema).

---

## Estrutura

```
SistematizaçãoPDM/
├── index.html        # Home (boas-vindas + resumo)
├── lista.html        # Listagem (READ) + Excluir (DELETE)
├── cadastro.html     # Cadastro (CREATE)
├── editar.html       # Edição (UPDATE)
├── sobre.html        # Sobre o app
├── manifest.json     # Torna o app instalável (PWA)
├── sw.js             # Service Worker (offline)
├── css/style.css     # Design (paleta, tipografia, componentes)
├── js/
│   ├── db.js         # Camada de dados — CRUD (localStorage)
│   ├── ui.js         # Cabeçalho + menu + navegação (injetados em todas as telas)
│   ├── home.js       # Lógica da Home
│   ├── lista.js      # Lógica da Listagem + Exclusão
│   └── form.js       # Lógica do formulário (Cadastro e Edição)
└── icons/            # Ícones 192/512 (instalação)
```

## Mapa CRUD → onde acontece

| Operação | Tela            | Arquivo            |
|----------|-----------------|--------------------|
| Create   | Cadastro        | `js/form.js` → `TreinoDB.create()` |
| Read     | Listagem / Home | `js/lista.js` / `js/home.js` → `TreinoDB.getAll()` |
| Update   | Edição          | `js/form.js` → `TreinoDB.update()` |
| Delete   | Listagem        | `js/lista.js` → `TreinoDB.remove()` (com confirmação) |

---

## Identidade do projeto

- **Problema:** quem treina anota séries/repetições/cargas no papel ou no bloco de notas — vira bagunça e o histórico se perde.
- **Público-alvo:** praticantes de musculação (iniciantes e intermediários).
- **Solução:** registro centralizado e organizado dos exercícios, com listagem, edição e exclusão.
