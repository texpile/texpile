// calls latex indent via shell
import { writeFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { shellEnvReady } from '../shell/shellEnv';

export async function formatLatex(filePath: string, text: string): Promise<{ formatted: string }> {
	if (!filePath) throw new Error('Missing path');
	await shellEnvReady();
	const dir = dirname(filePath);
	const tempFile = join(dir, `.texpile-format-${Date.now()}-${Math.random().toString(36).slice(2)}.tex`);
	const logFile = join(dir, 'indent.log');
	try {
		await writeFile(tempFile, text, 'utf-8');
		const stdout = await new Promise<string>((res, rej) => {
			execFile('latexindent', [tempFile], { cwd: dir, timeout: 20000, maxBuffer: 20 * 1024 * 1024 }, (err, out, stderr) => {
				if (err) {
					if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
						rej(new Error('latexindent was not found on PATH. It ships with most LaTeX distributions (TeX Live, MiKTeX).'));
					} else {
						rej(new Error(stderr?.trim() || err.message));
					}
					return;
				}
				res(out);
			});
		});
		if (!stdout.trim()) throw new Error('latexindent produced no output.');
		return { formatted: stdout };
	} finally {
		await rm(tempFile, { force: true }).catch(() => {});
		await rm(logFile, { force: true }).catch(() => {});
	}
}
