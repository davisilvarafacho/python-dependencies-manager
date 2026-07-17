# Python Dependencies Manager

**Idiomas:** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

Extensión para VS Code que gestiona las dependencias Python del **`.venv` del proyecto**, al estilo del administrador de paquetes de PyCharm. Usa **dos backends con detección automática**:

- **uv** (nativo) — si `uv` está en el `PATH` **y** existe `pyproject.toml` en la raíz  
- **pip** — en caso contrario (`requirements.txt` + `python -m venv` / `pip`)

**Estado:** **v1.0.0** — release estable (+ backend uv en desarrollo). Checklist manual: [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## Qué hace

1. **Detecta el backend** automáticamente: `uv` en el PATH + `pyproject.toml` → uv nativo; si no → pip  
2. **Detecta** `requirements.txt` o `pyproject.toml` en la raíz de la carpeta abierta  
3. **Notifica** y sugiere instalar/sincronizar dependencias **solo si aún no existe `.venv`**  
4. Si no hay **`.venv`**, la **crea** (pip: intérprete de la [extensión Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python); uv: `uv venv`)  
5. Sincroniza el manifiesto: **`pip install -r requirements.txt`** o **`uv sync`**  
6. Muestra los paquetes en la **barra de actividad** (webview con búsqueda)  
7. **Instalar / desinstalar / actualizar** paquetes individuales (`pip install` / `uv add`, etc.)  
8. Tras instalar con **pip**, pregunta si se debe **actualizar `requirements.txt` con `pip freeze`** (con **uv**, `uv add` ya edita `pyproject.toml` — sin diálogo de freeze)  
9. Registros detallados en el canal **Python Dependencies Manager**

### Backend uv (detalles)

Cuando el modo uv está activo, la extensión usa la CLI **nativa** de uv:

| Operación | Comando |
|-----------|---------|
| Crear entorno | `uv venv` |
| Sincronizar dependencias | `uv sync` |
| Añadir paquete | `uv add` |
| Quitar paquete | `uv remove` |
| Actualizar paquete | `uv lock --upgrade-package` + `uv sync` |
| Listar paquetes | `uv pip list --format=json` (**única** excepción: el listado usa `uv pip`) |

## Requisitos previos

- [Visual Studio Code](https://code.visualstudio.com/) (o un fork compatible)  
- Extensión **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** instalada  
- Intérprete Python seleccionado (`Python: Select Interpreter`)  
- Módulo **venv** disponible para el flujo pip (Debian/Ubuntu: `sudo apt install python3-venv` o `python3.12-venv`)  
- Proyecto abierto como **una carpeta** (raíz con `requirements.txt` / `pyproject.toml` / `.venv`)  
- **Opcional — uv:** [uv](https://github.com/astral-sh/uv) en el `PATH` para proyectos con `pyproject.toml` (sin uv se usa el backend pip)

## Cómo usarla

### Flujo automático (proyecto nuevo)

1. Abra la carpeta del proyecto con `requirements.txt` o `pyproject.toml` en la raíz **y sin `.venv`**  
2. Aparece la notificación para instalar/sincronizar  
3. Elija:  
   - **Install** / **Sync** — crea `.venv` si falta e instala las dependencias  
   - **Not now** — no vuelve a preguntar en esta sesión  
   - **Don’t ask again** — no vuelve a preguntar en este workspace  

Si **ya existe `.venv`**, **no** se muestra la notificación. El comando manual sigue disponible.

### Vista de paquetes (instalados)

Barra de actividad → **Python Dependencies**:

- **Filtro fijo** arriba: filtra **solo** los paquetes **ya instalados** en `.venv`
- Botones **Update** / **Remove** en cada fila
- Barra de herramientas: **Refresh**, **Install Package** (+), y el comando de sync del backend activo

### Instalar paquetes (botón + / QuickPick PyPI)

Se abre con **+ Install Package** (toolbar o paleta) — **separado** del filtro de la lista:

- Búsqueda en **PyPI** (p. ej. `django-` → ≥50 resultados)
- **Última versión a la derecha**, resumen debajo
- **Selección múltiple** → Enter instala todos de una vez
- Texto libre (`name==1.0`, git, etc.)
- Después (solo pip): opción de **`pip freeze` → `requirements.txt`**

### Paleta de comandos

Categoría **Python Dependencies**:

| Comando | Descripción | Cuándo aparece |
|---------|-------------|----------------|
| `Install from requirements.txt` | Flujo pip completo (`pip install -r`) | Proyectos **sin** modo uv |
| `Sync dependencies` | Flujo uv (`uv venv` + `uv sync`) | `uv` en el PATH + `pyproject.toml` |
| `Refresh Packages` | Recarga la lista de `.venv` | Siempre |
| `Install Package` | Búsqueda PyPI multi-select + install/add | Siempre |

## Comentarios y registros

- Notificaciones de **progreso** durante venv/pip/uv  
- **View → Output → Python Dependencies Manager** (registros con marca de tiempo y alcance: `flow`, `venv`, `pip`, `uv`, `process`, etc.)

## Alcance actual (y lo que queda fuera)

**Dentro del alcance:** una sola carpeta; backends **pip** (`requirements.txt`) y **uv nativo** (`pyproject.toml` + uv en el PATH); búsqueda en PyPI; freeze opcional en pip.

**Fuera (por ahora):** monorepo, Poetry/conda, sincronización fina del manifiesto, “update all”, forzar backend por setting, UI de extras/grupos dev de workspaces uv.

Diseño MVP: [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).  
Diseño uv: [`docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md`](docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md).

## Desarrollo

```bash
pnpm install
pnpm run compile
# o: pnpm run watch
```

En VS Code: **F5** (Run Extension).

Proyecto de prueba: `fixtures/sample-project/` (con `requirements.txt`).

```bash
pnpm run lint
pnpm test
```

### Probar con F5

1. Abra **este repositorio** en VS Code  
2. `pnpm install` && `pnpm run compile`  
3. **F5** → ventana **Extension Development Host**  
4. **File → Open Folder** → `fixtures/sample-project` (no la raíz de la extensión)  
5. Extensión **Python** + **Select Interpreter**  
6. Notificación (si no hay `.venv`) o comando **Install from requirements.txt** / **Sync dependencies**  
7. Barra de actividad → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Solución de problemas

| Síntoma | Causa habitual | Qué hacer |
|---------|----------------|-----------|
| F5 se queda en preLaunchTask | tarea `watch` | F5 usa `npm: compile` |
| Vista vacía | la extensión no se activó | Abrir carpeta con `requirements.txt`/`pyproject.toml`/`.venv` o ejecutar un comando |
| Error de venv / ensurepip | falta `python3-venv` | `sudo apt install python3.12-venv` |
| Sin intérprete | extensión Python | Instalar **Python** y seleccionar intérprete |
| Proyecto pyproject pero usa pip | `uv` no está en el PATH | Instalar uv o aceptar el backend pip |
| Avisos ConfigCat en el log | VS Code / GitHub | Ignorar — no son de esta extensión |

Empaquetar:

```bash
pnpm run package
# npx @vscode/vsce package
```

## Estructura (alto nivel)

```
src/
  extension.ts              # activate, comandos, auto-prompt
  packageOps.ts             # Template Method (progreso, errores, refresh)
  packageManager/           # Strategy: detect, resolve, PipManager, UvManager
  packagesWebview.ts        # vista + búsqueda PyPI / instalados
  packageInstallQuickPick.ts
  pypiClient.ts             # índice simple + JSON de PyPI
  pipService.ts / venvService.ts / preferences.ts / ...
docs/superpowers/specs/     # diseño
docs/superpowers/plans/     # plan + checklist
media/                      # icono de la Activity Bar
fixtures/sample-project/    # proyecto de prueba
```

## Changelog

Ver [CHANGELOG.md](CHANGELOG.md).

## Licencia

MIT (campo `license` en `package.json`).
