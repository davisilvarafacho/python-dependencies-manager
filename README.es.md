# Python Dependencies Manager

**Idiomas:** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

Extensión para VS Code que gestiona las dependencias Python del **`.venv` del proyecto** con **pip**, al estilo del administrador de paquetes de PyCharm.

**Estado:** MVP implementado. Checklist manual: [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## Qué hace

1. **Detecta** `requirements.txt` en la raíz de la carpeta abierta  
2. **Notifica** y sugiere instalar dependencias **solo si aún no existe `.venv`**  
3. Si no hay **`.venv`**, la **crea** con el intérprete de la [extensión Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)  
4. Asegura **pip** en el entorno (`ensurepip` si falta) y ejecuta **`pip install -r requirements.txt`**  
5. Muestra los paquetes en la **barra de actividad** (webview con búsqueda)  
6. **Instalar / desinstalar / actualizar** paquetes individuales  
7. Tras instalar un paquete, pregunta si se debe **actualizar `requirements.txt` con `pip freeze`**  
8. Registros detallados en el canal **Python Dependencies Manager**

## Requisitos previos

- [Visual Studio Code](https://code.visualstudio.com/) (o un fork compatible)  
- Extensión **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** instalada  
- Intérprete Python seleccionado (`Python: Select Interpreter`)  
- Módulo **venv** disponible (Debian/Ubuntu: `sudo apt install python3-venv` o `python3.12-venv`)  
- Proyecto abierto como **una carpeta** (raíz con `requirements.txt` / `.venv`)

## Cómo usarla

### Flujo automático (proyecto nuevo)

1. Abra la carpeta del proyecto con `requirements.txt` en la raíz **y sin `.venv`**  
2. Aparece la notificación para instalar  
3. Elija:  
   - **Install** — crea `.venv` si falta e instala las dependencias  
   - **Not now** — no vuelve a preguntar en esta sesión  
   - **Don’t ask again** — no vuelve a preguntar en este workspace  

Si **ya existe `.venv`**, **no** se muestra la notificación. El comando manual sigue disponible.

### Vista de paquetes

Barra de actividad → **Python Dependencies**:

| Situación | Comportamiento |
|-----------|----------------|
| Campo de búsqueda **vacío** | Lista los paquetes **instalados** en `.venv` |
| Campo con texto (p. ej. `django-`) | Búsqueda real en **PyPI** por nombre (≥50 resultados cuyo nombre contiene el término), versión y botón **Install** |

En instalados: botones **Update** y **Remove**.  
En la barra de la vista: **Refresh**, **Install Package**, **Install from requirements.txt**.

### Instalar paquete (QuickPick / PyPI)

- Búsqueda con debounce en PyPI  
- **Última versión a la derecha**  
- Resumen del paquete  
- Texto libre (spec `name==1.0`, git, etc.)  
- Tras la instalación: opción de **`pip freeze` → `requirements.txt`**

### Paleta de comandos

Categoría **Python Dependencies**:

| Comando | Descripción |
|---------|-------------|
| `Install from requirements.txt` | Flujo completo (siempre disponible) |
| `Refresh Packages` | Recarga la lista de `.venv` |
| `Install Package` | Búsqueda en PyPI + `pip install` |

## Comentarios y registros

- Notificaciones de **progreso** durante venv/pip  
- **View → Output → Python Dependencies Manager** (registros con marca de tiempo y alcance: `flow`, `venv`, `pip`, `process`, etc.)

## Alcance actual (y lo que queda fuera)

**Dentro del MVP:** una sola carpeta, `requirements.txt` + pip + `.venv` en la raíz, búsqueda en PyPI, freeze opcional.

**Fuera del MVP (por ahora):** monorepo, Poetry/uv/conda, sincronización fina del manifiesto, “update all”.

Diseño: [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).

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
6. Notificación (si no hay `.venv`) o comando **Install from requirements.txt**  
7. Barra de actividad → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Solución de problemas

| Síntoma | Causa habitual | Qué hacer |
|---------|----------------|-----------|
| F5 se queda en preLaunchTask | tarea `watch` | F5 usa `npm: compile` |
| Vista vacía | la extensión no se activó | Abrir carpeta con `requirements.txt`/`.venv` o ejecutar un comando |
| Error de venv / ensurepip | falta `python3-venv` | `sudo apt install python3.12-venv` |
| Sin intérprete | extensión Python | Instalar **Python** y seleccionar intérprete |
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
  installFlow.ts            # python → venv → pip install -r
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
