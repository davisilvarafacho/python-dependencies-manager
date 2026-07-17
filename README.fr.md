# Python Dependencies Manager

**Langues :** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

Extension VS Code qui gère les dépendances Python du **`.venv` du projet**, dans l’esprit du gestionnaire de paquets de PyCharm. Elle utilise **deux backends à détection automatique** :

- **uv** (natif) — si `uv` est dans le `PATH` **et** que `pyproject.toml` existe à la racine  
- **pip** — sinon (`requirements.txt` + `python -m venv` / `pip`)

**État :** **v1.0.0** — release stable (+ backend uv en cours). Checklist manuelle : [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## Fonctionnalités

1. **Détecte le backend** automatiquement : `uv` dans le PATH + `pyproject.toml` → uv natif ; sinon → pip  
2. **Détecte** `requirements.txt` ou `pyproject.toml` à la racine du dossier ouvert  
3. **Notifie** et propose d’installer/synchroniser les dépendances **uniquement s’il n’existe pas encore de `.venv`**  
4. Si **`.venv`** est absent, le **crée** (pip : interpréteur de l’[extension Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python) ; uv : `uv venv`)  
5. Synchronise le manifeste : **`pip install -r requirements.txt`** ou **`uv sync`**  
6. Affiche les paquets dans la **barre d’activité** (webview avec recherche)  
7. **Installer / désinstaller / mettre à jour** des paquets individuels (`pip install` / `uv add`, etc.)  
8. Après l’installation avec **pip**, propose de **mettre à jour `requirements.txt` via `pip freeze`** (avec **uv**, `uv add` modifie déjà `pyproject.toml` — pas de dialogue freeze)  
9. Journaux détaillés dans le canal **Python Dependencies Manager**

### Backend uv (détails)

Lorsque le mode uv est actif, l’extension utilise la CLI **native** d’uv :

| Opération | Commande |
|-----------|----------|
| Créer l’environnement | `uv venv` |
| Synchroniser les dépendances | `uv sync` |
| Ajouter un paquet | `uv add` |
| Supprimer un paquet | `uv remove` |
| Mettre à jour un paquet | `uv lock --upgrade-package` + `uv sync` |
| Lister les paquets | `uv pip list --format=json` (**seule** exception : le listage utilise `uv pip`) |

## Prérequis

- [Visual Studio Code](https://code.visualstudio.com/) (ou un fork compatible)  
- Extension **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** installée  
- Interpréteur Python sélectionné (`Python: Select Interpreter`)  
- Module **venv** disponible pour le flux pip (Debian/Ubuntu : `sudo apt install python3-venv` ou `python3.12-venv`)  
- Projet ouvert comme **un seul dossier** (racine avec `requirements.txt` / `pyproject.toml` / `.venv`)  
- **Optionnel — uv :** [uv](https://github.com/astral-sh/uv) dans le `PATH` pour les projets avec `pyproject.toml` (sans uv, le backend pip est utilisé)

## Utilisation

### Flux automatique (nouveau projet)

1. Ouvrez le dossier du projet avec `requirements.txt` ou `pyproject.toml` à la racine **et sans `.venv`**  
2. Une notification propose l’installation/synchronisation  
3. Choisissez :  
   - **Install** / **Sync** — crée `.venv` si besoin et installe les dépendances  
   - **Not now** — ne redemande pas pendant cette session  
   - **Don’t ask again** — ne redemande plus dans ce workspace  

Si **`.venv` existe déjà**, la notification **n’apparaît pas**. La commande manuelle reste disponible.

### Vue des paquets (installés)

Barre d’activité → **Python Dependencies** :

- **Filtre fixe** en haut : filtre **uniquement** les paquets **déjà installés** dans `.venv`
- Boutons **Update** / **Remove** sur chaque ligne
- Barre d’outils : **Refresh**, **Install Package** (+), et la commande de sync du backend actif

### Installer des paquets (bouton + / QuickPick PyPI)

Ouvert via **+ Install Package** (toolbar ou palette) — **séparé** du filtre de la liste :

- Recherche **PyPI** (ex. : `django-` → ≥50 résultats)
- **Dernière version à droite**, résumé en dessous
- **Sélection multiple** → Entrée installe tout d’un coup
- Texte libre (`name==1.0`, git, etc.)
- Ensuite (pip uniquement) : option **`pip freeze` → `requirements.txt`**

### Palette de commandes

Catégorie **Python Dependencies** :

| Commande | Description | Quand elle apparaît |
|----------|-------------|---------------------|
| `Install from requirements.txt` | Flux pip complet (`pip install -r`) | Projets **hors** mode uv |
| `Sync dependencies` | Flux uv (`uv venv` + `uv sync`) | `uv` dans le PATH + `pyproject.toml` |
| `Refresh Packages` | Recharge la liste du `.venv` | Toujours |
| `Install Package` | Recherche PyPI multi-sélection + install/add | Toujours |

## Retour d’information et journaux

- Notifications de **progression** pendant venv/pip/uv  
- **View → Output → Python Dependencies Manager** (journaux horodatés par scope : `flow`, `venv`, `pip`, `uv`, `process`, etc.)

## Périmètre actuel (et hors scope)

**Dans le périmètre :** un seul dossier ; backends **pip** (`requirements.txt`) et **uv natif** (`pyproject.toml` + uv dans le PATH) ; recherche PyPI ; freeze optionnel pour pip.

**Hors scope (pour l’instant) :** monorepo, Poetry/conda, synchronisation fine du manifeste, « update all », forcer le backend par setting, UI extras/groupes dev des workspaces uv.

Conception MVP : [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).  
Conception uv : [`docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md`](docs/superpowers/specs/2026-07-17-uv-native-package-manager-design.md).

## Développement

```bash
pnpm install
pnpm run compile
# ou : pnpm run watch
```

Dans VS Code : **F5** (Run Extension).

Projet de test : `fixtures/sample-project/` (avec `requirements.txt`).

```bash
pnpm run lint
pnpm test
```

### Tester avec F5

1. Ouvrez **ce dépôt** dans VS Code  
2. `pnpm install` && `pnpm run compile`  
3. **F5** → fenêtre **Extension Development Host**  
4. **File → Open Folder** → `fixtures/sample-project` (pas la racine de l’extension)  
5. Extension **Python** + **Select Interpreter**  
6. Notification (s’il n’y a pas de `.venv`) ou commande **Install from requirements.txt** / **Sync dependencies**  
7. Barre d’activité → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Dépannage

| Symptôme | Cause fréquente | Que faire |
|----------|-----------------|-----------|
| F5 bloqué sur preLaunchTask | tâche `watch` | F5 utilise `npm: compile` |
| Vue vide | extension non activée | Ouvrir un dossier avec `requirements.txt`/`pyproject.toml`/`.venv` ou lancer une commande |
| Erreur venv / ensurepip | `python3-venv` manquant | `sudo apt install python3.12-venv` |
| Pas d’interpréteur | extension Python | Installer **Python** et sélectionner l’interpréteur |
| Projet pyproject mais utilise pip | `uv` absent du PATH | Installer uv ou accepter le backend pip |
| Avertissements ConfigCat | VS Code / GitHub | Ignorer — ce n’est pas cette extension |

Empaqueter :

```bash
pnpm run package
# npx @vscode/vsce package
```

## Structure (vue d’ensemble)

```
src/
  extension.ts              # activate, commandes, auto-prompt
  packageOps.ts             # Template Method (progression, erreurs, refresh)
  packageManager/           # Strategy : detect, resolve, PipManager, UvManager
  packagesWebview.ts        # vue + recherche PyPI / installés
  packageInstallQuickPick.ts
  pypiClient.ts             # index simple + JSON PyPI
  pipService.ts / venvService.ts / preferences.ts / ...
docs/superpowers/specs/     # design
docs/superpowers/plans/     # plan + checklist
media/                      # icône Activity Bar
fixtures/sample-project/    # projet de test
```

## Journal des modifications

Voir [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT (champ `license` dans `package.json`).
