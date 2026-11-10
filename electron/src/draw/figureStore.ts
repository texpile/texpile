// The rendered pictures the figure cards show while no engine runs: one svg per picture source, in one folder
// of the app's data, the oldest dropped past a cap.
import * as fs from 'node:fs';
import * as path from 'node:path';

const KEPT = 2000;
const NAME = /^[0-9a-f]{16}$/;

export type SavedFigure = { svg: string; mtimeMs: number };

function fileOf(home: string, name: string): string {
	if (!NAME.test(name)) throw new Error('not a figure name');
	return path.join(home, `${name}.svg`);
}

export async function readFigure(home: string, name: string): Promise<SavedFigure | null> {
	const file = fileOf(home, name);
	try {
		const [svg, stat] = await Promise.all([fs.promises.readFile(file, 'utf8'), fs.promises.stat(file)]);
		return { svg, mtimeMs: stat.mtimeMs };
	} catch {
		return null;
	}
}

async function dropOldest(home: string, kept: number): Promise<void> {
	const names = (await fs.promises.readdir(home)).filter((n) => n.endsWith('.svg'));
	if (names.length <= kept) return;
	const aged = await Promise.all(
		names.map(async (n) => ({ n, at: (await fs.promises.stat(path.join(home, n)).catch(() => null))?.mtimeMs ?? 0 }))
	);
	aged.sort((a, b) => a.at - b.at);
	await Promise.all(aged.slice(0, aged.length - kept).map(({ n }) => fs.promises.rm(path.join(home, n), { force: true })));
}

export async function writeFigure(home: string, name: string, svg: string, kept = KEPT): Promise<void> {
	const file = fileOf(home, name);
	await fs.promises.mkdir(home, { recursive: true });
	await fs.promises.writeFile(file, svg, 'utf8');
	await dropOldest(home, kept);
}
