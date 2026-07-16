# Python Dependencies Manager

**Langues :** [Português (Brasil)](README.md) · [English](README.en.md) · [Español](README.es.md) · [Français](README.fr.md)

Extension VS Code qui gère les dépendances Python du **`.venv` du projet** avec **pip**, dans l’esprit du gestionnaire de paquets de PyCharm.

**État :** **v1.0.0** — release stable. Checklist manuelle : [docs/superpowers/plans/manual-checklist.md](docs/superpowers/plans/manual-checklist.md).

## Fonctionnalités

1. **Détecte** `requirements.txt` à la racine du dossier ouvert  
2. **Notifie** et propose d’installer les dépendances **uniquement s’il n’existe pas encore de `.venv`**  
3. Si **`.venv`** est absent, le **crée** avec l’interpréteur de l’[extension Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)  
4. Assure la présence de **pip** (`ensurepip` si besoin) et exécute **`pip install -r requirements.txt`**  
5. Affiche les paquets dans la **barre d’activité** (webview avec recherche)  
6. **Installer / désinstaller / mettre à jour** des paquets individuels  
7. Après l’installation d’un paquet, propose de **mettre à jour `requirements.txt` via `pip freeze`**  
8. Journaux détaillés dans le canal **Python Dependencies Manager**

## Prérequis

- [Visual Studio Code](https://code.visualstudio.com/) (ou un fork compatible)  
- Extension **[Python](https://marketplace.visualstudio.com/items?itemName=ms-python.python)** installée  
- Interpréteur Python sélectionné (`Python: Select Interpreter`)  
- Module **venv** disponible (Debian/Ubuntu : `sudo apt install python3-venv` ou `python3.12-venv`)  
- Projet ouvert comme **un seul dossier** (racine avec `requirements.txt` / `.venv`)

## Utilisation

### Flux automatique (nouveau projet)

1. Ouvrez le dossier du projet avec `requirements.txt` à la racine **et sans `.venv`**  
2. Une notification propose l’installation  
3. Choisissez :  
   - **Install** — crée `.venv` si besoin et installe les dépendances  
   - **Not now** — ne redemande pas pendant cette session  
   - **Don’t ask again** — ne redemande plus dans ce workspace  

Si **`.venv` existe déjà**, la notification **n’apparaît pas**. La commande manuelle reste disponible.

### Vue des paquets (installés)

Barre d’activité → **Python Dependencies** :

- **Filtre fixe** en haut : filtre **uniquement** les paquets **déjà installés** dans `.venv`
- Boutons **Update** / **Remove** sur chaque ligne
- Barre d’outils : **Refresh**, **Install Package** (+), **Install from requirements.txt**

### Installer des paquets (bouton + / QuickPick PyPI)

Ouvert via **+ Install Package** (toolbar ou palette) — **séparé** du filtre de la liste :

- Recherche **PyPI** (ex. : `django-` → ≥50 résultats)
- **Dernière version à droite**, résumé en dessous
- **Sélection multiple** → Entrée installe tout d’un coup
- Texte libre (`name==1.0`, git, etc.)
- Ensuite : option **`pip freeze` → `requirements.txt`**

### Palette de commandes

Catégorie **Python Dependencies** :

| Commande | Description |
|----------|-------------|
| `Install from requirements.txt` | Flux complet (toujours disponible) |
| `Refresh Packages` | Recharge la liste du `.venv` |
| `Install Package` | Recherche PyPI multi-sélection + `pip install` |

## Retour d’information et journaux

- Notifications de **progression** pendant venv/pip  
- **View → Output → Python Dependencies Manager** (journaux horodatés par scope : `flow`, `venv`, `pip`, `process`, etc.)

## Périmètre actuel (et hors scope)

**Dans le MVP :** un seul dossier, `requirements.txt` + pip + `.venv` à la racine, recherche PyPI, freeze optionnel.

**Hors MVP (pour l’instant) :** monorepo, Poetry/uv/conda, synchronisation fine du manifeste, « update all ».

Conception : [`docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md`](docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md).

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
6. Notification (s’il n’y a pas de `.venv`) ou commande **Install from requirements.txt**  
7. Barre d’activité → **Python Dependencies**  
8. Output → **Python Dependencies Manager**

### Dépannage

| Symptôme | Cause fréquente | Que faire |
|----------|-----------------|-----------|
| F5 bloqué sur preLaunchTask | tâche `watch` | F5 utilise `npm: compile` |
| Vue vide | extension non activée | Ouvrir un dossier avec `requirements.txt`/`.venv` ou lancer une commande |
| Erreur venv / ensurepip | `python3-venv` manquant | `sudo apt install python3.12-venv` |
| Pas d’interpréteur | extension Python | Installer **Python** et sélectionner l’interpréteur |
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
  installFlow.ts            # python → venv → pip install -r
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
