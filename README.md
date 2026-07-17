# Python Dependencies Manager

**Idiomas:** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

Extensão para o VS Code que gerencia as dependências Python da **`.venv` do projeto**, no espírito do gerenciador de pacotes do PyCharm. Usa **dois backends com detecção automática**:

- **uv** (nativo) — se `uv` estiver no `PATH` **e** existir `pyproject.toml` na raiz
- **pip** — caso contrário (`requirements.txt` + `python -m venv` / `pip`)

**Status:** **v1.0.0** — release estável (+ backend uv em desenvolvimento). Checklist manual: [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## O que faz

1. **Detecta o backend** automaticamente: `uv` no PATH + `pyproject.toml` → uv nativo; senão → pip  
2. **Detecta** `requirements.txt` ou `pyproject.toml` na raiz da pasta aberta  
3. **Notifica** e sugere instalar/sincronizar dependências **somente se ainda não existir `.venv`**  
4. Se não existir **`.venv`**, **cria** (pip: interpretador da [extensão Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python); uv: `uv venv`)  
5. Sincroniza o manifesto: **`pip install -r requirements.txt`** ou **`uv sync`**  
6. Mostra os pacotes na **Activity Bar** (webview com busca)  
7. **Instalar / desinstalar / atualizar** pacotes avulsos (`pip install` / `uv add`, etc.)  
8. Após instalar com **pip**, pergunta se deve **atualizar o `requirements.txt` com `pip freeze`** (com **uv**, `uv add` já edita o `pyproject.toml` — sem diálogo de freeze)  
9. Logs detalhados no canal **Python Dependencies Manager**

### Backend uv (detalhes)

Quando o modo uv está ativo, a extensão usa a CLI **nativa** do uv:

| Operação | Comando |
|----------|---------|
| Criar ambiente | `uv venv` |
| Sincronizar dependências | `uv sync` |
| Adicionar pacote | `uv add` |
| Remover pacote | `uv remove` |
| Atualizar pacote | `uv lock --upgrade-package` + `uv sync` |
| Listar pacotes | `uv pip list --format=json` (**única** exceção: listagem usa `uv pip`) |

## Pré-requisitos

- [Visual Studio Code](https://code.visualstudio.com/) (ou fork compatível)
- Extensão **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** instalada
- Interpretador Python selecionado (`Python: Select Interpreter`)
- Módulo **venv** disponível para o fluxo pip (Debian/Ubuntu: `sudo apt install python3-venv` ou `python3.12-venv`)
- Projeto aberto como **uma pasta** (raiz com `requirements.txt` / `pyproject.toml` / `.venv`)
- **Opcional — uv:** [uv](https://github.com/astral-sh/uv) no `PATH` para projetos com `pyproject.toml` (sem uv, o backend pip é usado)

## Como usar

### Fluxo automático (projeto novo)

1. Abra a pasta do projeto com `requirements.txt` ou `pyproject.toml` na raiz **e sem `.venv`**
2. Aparece a notificação para instalar/sincronizar
3. Escolha:
   - **Install** / **Sync** — cria `.venv` se faltar e instala as dependências
   - **Not now** — não pergunta de novo nesta sessão
   - **Don’t ask again** — não pergunta de novo neste workspace

Se **já existir `.venv`**, a notificação **não** é exibida. O comando manual continua disponível.

### View de pacotes (instalados)

Na Activity Bar → **Python Dependencies**:

- **Filtro fixo** no topo: filtra **apenas** os pacotes **já instalados** na `.venv`
- Botões **Update** / **Remove** em cada linha
- Toolbar: **Refresh**, **Install Package** (+), e o comando de sync do backend ativo

### Instalar pacotes (botão + / QuickPick PyPI)

Aberto pelo **+ Install Package** (toolbar ou Command Palette) — **separado** do filtro da lista:

- Busca no **PyPI** (ex.: `django-` → ≥50 resultados)
- **Última versão à direita**, resumo abaixo
- **Seleção múltipla** (marque vários) → Enter instala todos de uma vez
- Texto livre (`name==1.0`, git, etc.)
- Depois (somente pip): opção de **`pip freeze` → `requirements.txt`**

### Command Palette

Categoria **Python Dependencies**:

| Comando | Descrição | Quando aparece |
|---------|-----------|----------------|
| `Install from requirements.txt` | Fluxo pip completo (`pip install -r`) | Projetos **sem** modo uv |
| `Sync dependencies` | Fluxo uv (`uv venv` + `uv sync`) | `uv` no PATH + `pyproject.toml` |
| `Refresh Packages` | Recarrega a lista da `.venv` | Sempre |
| `Install Package` | Busca PyPI multi-select + install/add | Sempre |

## Feedback e logs

- Notificações de **progresso** durante venv/pip/uv
- **View → Output → Python Dependencies Manager** (logs com timestamp e escopo: `flow`, `venv`, `pip`, `uv`, `process`, etc.)

## Escopo atual (e o que fica de fora)

**Dentro do escopo:** pasta única; backends **pip** (`requirements.txt`) e **uv nativo** (`pyproject.toml` + uv no PATH); busca PyPI; freeze opcional no pip.

**Fora (por enquanto):** monorepo, Poetry/conda, sync fino linha a linha no manifesto, “update all”, forçar backend por setting, workspaces uv com extras/dev groups na UI.

Design MVP: [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).  
Design uv: [`docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md`](docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md).

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
6. Notificação (se não houver `.venv`) ou comando **Install from requirements.txt** / **Sync dependencies**  
7. Activity Bar → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Solução de problemas

| Sintoma | Causa comum | O que fazer |
|---------|-------------|-------------|
| F5 trava no preLaunchTask | task `watch` | F5 usa `npm: compile` |
| View vazia | extensão não ativou | Abrir pasta com `requirements.txt`/`pyproject.toml`/`.venv` ou rodar um comando |
| Erro de venv / ensurepip | falta `python3-venv` | `sudo apt install python3.12-venv` |
| Sem interpretador | Python extension | Instalar **Python** e selecionar interpretador |
| Projeto pyproject mas usa pip | `uv` não está no PATH | Instalar uv ou aceitar o backend pip |
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
  packageOps.ts             # Template Method (progress, erros, refresh)
  packageManager/           # Strategy: detect, resolve, PipManager, UvManager
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
