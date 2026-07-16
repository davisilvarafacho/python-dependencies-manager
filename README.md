# Python Dependencies Manager

Extensão para o VS Code que gerencia as dependências Python da **`.venv` do projeto** com **pip**, no espírito do gerenciador de pacotes do PyCharm.

**Status:** MVP implementado (sem stubs). Smoke manual: [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## O que faz (MVP)

1. **Detecta** `requirements.txt` na raiz da pasta aberta
2. **Notifica** e sugere instalar as dependências
3. Se não existir **`.venv`**, **cria** com o interpretador selecionado na [extensão Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
4. Roda **`pip install -r requirements.txt`** com barra de progresso e log no **Output Channel**
5. Mostra os pacotes instalados numa **view na Activity Bar**
6. Permite **instalar / desinstalar / atualizar** pacotes avulsos

## Pré-requisitos

- [Visual Studio Code](https://code.visualstudio.com/) (ou fork compatível com a API de extensões)
- Extensão **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** instalada **na janela Extension Development Host** (quando testar com F5)
- Um **interpretador Python** selecionado no workspace (`Python: Select Interpreter`)
- Módulo **venv** do Python disponível (Debian/Ubuntu: `sudo apt install python3-venv` ou `python3.12-venv`)
- Projeto aberto como **uma pasta** (raiz com `requirements.txt` e, se existir, `.venv`)

## Como usar

### Fluxo automático

1. Abra a pasta do projeto (com `requirements.txt` na raiz)
2. Se a extensão detectar o arquivo, aparece a notificação para instalar
3. Escolha:
   - **Install** — cria `.venv` se faltar e instala as dependências
   - **Not now** — não pergunta de novo nesta sessão
   - **Don’t ask again** — não pergunta de novo neste workspace

### View de pacotes

Na Activity Bar, abra **Python Dependencies** para:

- Ver pacotes da `.venv`
- Atualizar a lista (Refresh)
- Instalar um pacote
- Desinstalar / atualizar um pacote (menu do item)
- Reexecutar install a partir do `requirements.txt`

### Command Palette

Comandos sob a categoria **Python Dependencies**:

| Comando | Descrição |
|---------|-----------|
| `Install from requirements.txt` | Mesmo fluxo da notificação (sempre disponível) |
| `Refresh Packages` | Recarrega a lista da `.venv` |
| `Install Package` | Pede o nome/spec e roda `pip install` |

## Feedback durante operações

- **Progress notification** enquanto venv/pip rodam
- Canal de saída **Python Dependencies Manager** com o log completo (stdout/stderr)

## Escopo atual (e o que fica de fora)

**Dentro do MVP:** pasta única, só `requirements.txt` + pip + `.venv` na raiz.

**Fora do MVP (por enquanto):** monorepo, Poetry/uv/conda, sync bidirecional com o manifesto, “update all”, Webview rica.

Detalhes de design: [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).

## Desenvolvimento

```bash
pnpm install
pnpm run compile
# ou: pnpm run watch
```

No VS Code: **F5** (Run Extension) abre uma janela Extension Development Host.

Pasta de teste pronta: `fixtures/sample-project/` (tem `requirements.txt`).

```bash
pnpm run lint
pnpm test
```

### Como testar com F5 (passo a passo)

1. Abra **este repositório** no VS Code
2. `pnpm install` e `pnpm run compile`
3. **F5** → abre a janela **Extension Development Host**
4. Nessa janela: **File → Open Folder** → escolha `fixtures/sample-project` (não a raiz do repo da extensão)
5. Instale a extensão **Python** se pedir; rode **Python: Select Interpreter**
6. Deve aparecer a notificação do `requirements.txt` (ou rode **Python Dependencies: Install from requirements.txt**)
7. Activity Bar → ícone **Python Dependencies** → lista de pacotes
8. Log: **View → Output → Python Dependencies Manager**

### Se “não funciona”

| Sintoma | Causa comum | O que fazer |
|---------|-------------|-------------|
| F5 trava em “preLaunchTask” | task `watch` nunca termina | Já corrigido: F5 usa `npm: compile` |
| View vazia / extensão “morta” | não ativou | Abrir pasta com `requirements.txt`, clicar na view, ou rodar um comando da extensão |
| Erro de venv / ensurepip | falta `python3-venv` | `sudo apt install python3.12-venv` |
| Pedido de interpretador | Python extension / interpreter | Instalar **Python** e **Select Interpreter** na janela Host |
| Avisos ConfigCat no log | VS Code / GitHub / Graphite | **Não** são desta extensão — ignore |

Empacotar:

```bash
pnpm run package
# em seguida, se tiver vsce: npx @vscode/vsce package
```

## Estrutura (alta nível)

```
src/
  extension.ts          # activate / commands / auto-prompt
  installFlow.ts        # python → venv → pip install -r
  packagesTree.ts       # Activity Bar TreeView
  pipService.ts / venvService.ts / preferences.ts / ...
docs/superpowers/specs/ # design do produto
docs/superpowers/plans/ # plano + checklist manual
media/                  # ícone da Activity Bar
```

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).

## Licença

MIT (ver campo `license` no `package.json`).
