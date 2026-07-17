import * as fs from 'fs';
import * as path from 'path';

export function requirementsTxtPath(root: string): string {
	return path.join(root, 'requirements.txt');
}

export function venvDirPath(root: string): string {
	return path.join(root, '.venv');
}

export function venvPythonPath(root: string): string {
	if (process.platform === 'win32') {
		return path.join(root, '.venv', 'Scripts', 'python.exe');
	}
	return path.join(root, '.venv', 'bin', 'python');
}

export function requirementsExists(root: string): boolean {
	try {
		return fs.statSync(requirementsTxtPath(root)).isFile();
	} catch {
		return false;
	}
}

export function pyprojectTomlPath(root: string): string {
	return path.join(root, 'pyproject.toml');
}

export function pyprojectExists(root: string): boolean {
	try {
		return fs.statSync(pyprojectTomlPath(root)).isFile();
	} catch {
		return false;
	}
}

export function venvExists(root: string): boolean {
	try {
		return fs.statSync(venvDirPath(root)).isDirectory();
	} catch {
		return false;
	}
}
