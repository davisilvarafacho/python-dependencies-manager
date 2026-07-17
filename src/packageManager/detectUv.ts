import { spawnSync } from 'child_process';

export type UvPresenceChecker = () => boolean;

/** Synchronous PATH check for the `uv` binary. */
export function isUvOnPath(): boolean {
	const isWin = process.platform === 'win32';
	const result = spawnSync(isWin ? 'where' : 'which', ['uv'], {
		encoding: 'utf8',
		shell: false,
	});
	return result.status === 0 && Boolean((result.stdout || '').trim());
}
