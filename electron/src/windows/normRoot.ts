import * as path from 'node:path';

// Windows hands out the same folder with varying drive-letter case, so root identity
// must compare case-insensitively there (mirrors the renderer's workspaceStore)
export function normRoot(p: string): string {
	const s = path.resolve(p).replace(/[\\/]+$/, '');
	return process.platform === 'win32' ? s.toLowerCase() : s;
}
