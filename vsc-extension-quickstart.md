# Quickstart — Python Dependencies Manager

## What's in the folder

* `package.json` — extension manifest (commands, Activity Bar view, activation)
* `src/extension.ts` — entry point (stubs until MVP implementation)
* `media/icon.svg` — Activity Bar icon
* `docs/superpowers/specs/` — product design
* `README.md` — user-facing overview

## Get up and running

* `pnpm install`
* Press `F5` to open a new window with the extension loaded
* Open a folder that has (or will have) `requirements.txt` at the root
* Ensure the Python extension is installed and an interpreter is selected

## Make changes

* `src/extension.ts` — main activation and UI wiring
* `pnpm run watch` — rebuild on save
* Reload the Extension Development Host (`Ctrl+R` / `Cmd+R`) after changes

## Explore the API

* Open `node_modules/@types/vscode/index.d.ts` for the full VS Code API

## Run tests

* `pnpm test` or the Extension Tests launch config (if configured)

## Design reference

See `docs/superpowers/specs/2026-07-16-python-dependencies-manager-design.md` before implementing features.
