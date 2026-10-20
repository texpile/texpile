import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

function newestChange(dir: string): number {
	return fs
		.readdirSync(dir, { recursive: true, withFileTypes: true })
		.filter((e) => e.isFile())
		.reduce((t, e) => Math.max(t, fs.statSync(path.join(e.parentPath, e.name)).mtimeMs), 0);
}

// rebuilt only when electron/src changed, so a second run started meanwhile does not find dist half written
export default function buildElectron(): void {
	const repo = path.resolve(import.meta.dirname, '../../../../..');
	// electron downloads its binary on first use: once here, so two workers do not race to write and run it
	createRequire(path.join(repo, 'package.json'))('electron');
	const built = path.join(repo, 'electron/dist/app.js');
	if (fs.existsSync(built) && fs.statSync(built).mtimeMs > newestChange(path.join(repo, 'electron/src'))) return;
	execFileSync(process.execPath, [path.join(repo, 'scripts/build-electron.mjs'), '--dev'], { cwd: repo, stdio: 'inherit' });
}
