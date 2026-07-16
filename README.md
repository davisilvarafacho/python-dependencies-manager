# Python Dependencies Manager

**Idiomas:** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

Extensão para o VS Code que gerencia as dependências Python da **`.venv` do projeto** com **pip**, no espírito do gerenciador de pacotes do PyCharm.

**Status:** MVP implementado. Checklist manual: [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## O que faz

1. **Detecta** `requirements.txt` na raiz da pasta aberta
2. **Notifica** e sugere instalar as dependências **somente se ainda não existir `.venv`**
3. Se não existir **`.venv`**, **cria** com o interpretador da [extensão Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
4. Garante **pip** no ambiente (`ensurepip` se faltar) e roda **`pip install -r requirements.txt`**
5. Mostra os pacotes na **Activity Bar** (webview com busca)
6. **Instalar / desinstalar / atualizar** pacotes avulsos
7. Após instalar um pacote, pergunta se deve **atualizar o `requirements.txt` com `pip freeze`**
8. Logs detalhados no canal **Python Dependencies Manager**

## Pré-requisitos

- [Visual Studio Code](https://code.visualstudio.com/) (ou fork compatível)
- Extensão **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** instalada
- Interpretador Python selecionado (`Python: Select Interpreter`)
- Módulo **venv** disponível (Debian/Ubuntu: `sudo apt install python3-venv` ou `python3.12-venv`)
- Projeto aberto como **uma pasta** (raiz com `requirements.txt` / `.venv`)

## Como usar

### Fluxo automático (projeto novo)

1. Abra a pasta do projeto com `requirements.txt` na raiz **e sem `.venv`**
2. Aparece a notificação para instalar
3. Escolha:
   - **Install** — cria `.venv` se faltar e instala as dependências
   - **Not now** — não pergunta de novo nesta sessão
   - **Don’t ask again** — não pergunta de novo neste workspace

Se **já existir `.venv`**, a notificação **não** é exibida. O comando manual continua disponível.

### View de pacotes

Na Activity Bar → **Python Dependencies**:

| Situação | Comportamento |
|----------|----------------|
| Campo de busca **vazio** | Lista pacotes **instalados** na `.venv` |
| Campo com texto (ex.: `django-`) | Busca real no **PyPI** por nome (≥50 resultados com o termo no nome), versão e botão **Install** |

Nos instalados: botões **Update** e **Remove**.  
Na toolbar da view: **Refresh**, **Install Package**, **Install from requirements.txt**.

### Instalar pacote (QuickPick / PyPI)

- Busca com debounce no PyPI
- **Última versão à direita**
- Resumo do pacote
- Texto livre (spec `name==1.0`, git, etc.)
- Depois da instalação: opção de **`pip freeze` → `requirements.txt`**

### Command Palette

Categoria **Python Dependencies**:

| Comando | Descrição |
|---------|-----------|
| `Install from requirements.txt` | Fluxo completo (sempre disponível) |
| `Refresh Packages` | Recarrega a lista da `.venv` |
| `Install Package` | Busca PyPI + `pip install` |

## Feedback e logs

- Notificações de **progresso** durante venv/pip
- **View → Output → Python Dependencies Manager** (logs com timestamp e escopo: `flow`, `venv`, `pip`, `process`, etc.)

## Escopo atual (e o que fica de fora)

**Dentro do MVP:** pasta única, `requirements.txt` + pip + `.venv` na raiz, busca PyPI, freeze opcional.

**Fora do MVP (por enquanto):** monorepo, Poetry/uv/conda, sync fino linha a linha no manifesto, “update all”.

Design: [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).

## Desenvolvimento

```bash
pnpm install
pnpm run compile
# ou: pnpm run watch
```

No VS Code: **F5** (Run Extension).

Pasta de teste: `fixtures/sample-project/` (com `requirements.txt`).

```bash
pnpm run lint
pnpm test
```

### Testar com F5

1. Abra **este repositório** no VS Code  
2. `pnpm install` && `pnpm run compile`  
3. **F5** → janela **Extension Development Host**  
4. **File → Open Folder** → `fixtures/sample-project` (não a raiz da extensão)  
5. Extensão **Python** + **Select Interpreter**  
6. Notificação (se não houver `.venv`) ou comando **Install from requirements.txt**  
7. Activity Bar → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Solução de problemas

| Sintoma | Causa comum | O que fazer |
|---------|-------------|-------------|
| F5 trava no preLaunchTask | task `watch` | F5 usa `npm: compile` |
| View vazia | extensão não ativou | Abrir pasta com `requirements.txt`/`.venv` ou rodar um comando |
| Erro de venv / ensurepip | falta `python3-venv` | `sudo apt install python3.12-venv` |
| Sem interpretador | Python extension | Instalar **Python** e selecionar interpretador |
| Avisos ConfigCat no log | VS Code / GitHub | Ignorar — não são desta extensão |

Empacotar:

```bash
pnpm run package
# npx @vscode/vsce package
```

## Estrutura (alta nível)

```
src/
  extension.ts              # activate, commands, auto-prompt
  installFlow.ts            # python → venv → pip install -r
  packagesWebview.ts        # view + busca PyPI / lista instalados
  packageInstallQuickPick.ts
  pypiClient.ts             # índice simple + JSON do PyPI
  pipService.ts / venvService.ts / preferences.ts / ...
docs/superpowers/specs/     # design
docs/superpowers/plans/     # plano + checklist
media/                      # ícone da Activity Bar
fixtures/sample-project/    # projeto de teste
```

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).

## Licença

MIT (campo `license` no `package.json`).
