import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas } from './canvas/canvasPage';

function hasProgram(name: string): boolean {
	try {
		execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' });
		return true;
	} catch {
		return false;
	}
}

test.skip(!hasProgram('lualatex') || !hasProgram('synctex'), 'needs lualatex and synctex on PATH');

const MAIN = '\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\nBefore.\n\n\\input{part}\n\nAfter.\n\n\\end{document}\n';
const PART =
	'\\begin{tikzpicture}\n  \\node[draw] (a) at (0,0) {A};\n  \\node[draw] (b) at (3,0) {B};\n  \\draw[->] (a) -- (b);\n\\end{tikzpicture}\n';

const texpile = useTexpile({
	files: { 'paper.tex': MAIN, 'part.tex': PART, '.texpile/config.json': JSON.stringify({ v: 1, main: 'paper.tex' }) }
});

// into output/, where the default compile command writes
function compile(root: string): void {
	fs.mkdirSync(path.join(root, 'output'), { recursive: true });
	execFileSync('lualatex', ['-synctex=1', '-interaction=nonstopmode', '-no-shell-escape', '-output-directory=output', 'paper.tex'], {
		cwd: root,
		stdio: 'ignore'
	});
}

test('a picture in an input file shows as the compiled PDF prints it, and keeps that picture until its source changes', async () => {
	const { page, root } = texpile();
	compile(root);
	const visual = new VisualEditor(page, root);
	await visual.open('part.tex');
	// the card's picture: what it was drawn from and its size, or its placeholder's words
	const card = () =>
		inCanvas(page, ({ probe }) => {
			const picture = probe.query('.figure-card .compiled-picture')[0];
			return {
				source: picture?.attrs['data-source'] ?? null,
				width: picture?.rect.width ?? 0,
				height: picture?.rect.height ?? 0,
				words: probe.query('.figure-card')[0]?.text ?? ''
			};
		});
	await expect.poll(async () => (await card()).source, { timeout: 60_000 }).toBe('pdf');
	const crop = await card();
	expect(crop.width).toBeGreaterThan(80);
	expect(crop.height).toBeGreaterThan(20);

	// the file saved after the compile, its picture as it was: the card had nothing to show until the next compile
	const later = new Date(Date.now() + 60_000);
	fs.utimesSync(path.join(root, 'part.tex'), later, later);
	await visual.open('paper.tex');
	await visual.open('part.tex');
	await expect.poll(async () => (await card()).source, { timeout: 60_000 }).toBe('drawing');

	fs.writeFileSync(path.join(root, 'part.tex'), PART.replace('{B}', '{C}'));
	const laterStill = new Date(later.getTime() + 60_000);
	fs.utimesSync(path.join(root, 'part.tex'), laterStill, laterStill);
	await expect.poll(async () => (await card()).words).toContain('TikZ figure');
	expect((await card()).source).toBeNull();
});
