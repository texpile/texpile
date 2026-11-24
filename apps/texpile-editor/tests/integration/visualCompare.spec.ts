import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { inCanvas } from './canvas/canvasPage';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const FILE = '\\documentclass{article}\n\\begin{document}\nThe threshold is\n$$x$$\nwhere it denotes the entropy.\n\\end{document}\n';
const texpile = useTexpile({ files: { 'compare.tex': FILE } });

function git(root: string, ...args: string[]): void {
	execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
		cwd: root,
		env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
		stdio: 'ignore'
	});
}

test('the visual comparison marks a word typed since the last commit', async () => {
	const { page, root } = texpile();
	git(root, 'init', '-q');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	await expect
		.poll(() =>
			page.evaluate(async (folder) => {
				const git = await new Function(`return import('/src/lib/workspace/scm/gitStore.ts')`)();
				await git.refreshGitStatus(folder);
				return git.isGitRepo.current as boolean;
			}, root)
		)
		.toBe(true);
	const visual = new VisualEditor(page, root);
	await visual.open('compare.tex');
	await visual.caretAfter('denotes the');
	await visual.type(' measured');
	await page.keyboard.press('Control+Shift+G');
	await page.locator('button[class*="@container"]', { hasText: 'compare.tex' }).click();
	// the one tint the comparison paints in the paragraph runs from the typed word to the next one
	await expect
		.poll(() =>
			inCanvas(page, ({ probe, view }) => {
				const block = view.state.doc.resolve(probe.posOf('measured')).before(1);
				const ops = probe.drawList(block);
				const words = ops.filter((op) => op.op === 'fillText');
				const from = words.find((op) => op.text === 'measured')?.rect.x ?? NaN;
				const to = words.find((op) => op.text === 'entropy.')?.rect.x ?? NaN;
				const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
				// a tint is painted per text run: runs that touch read as one band, as the DOM editor's one span did
				const bands: { from: number; to: number }[] = [];
				for (const { rect } of ops.filter((op) => op.op === 'fillRect').sort((a, b) => a.rect.x - b.rect.x)) {
					const last = bands.at(-1);
					if (last && near(last.to, rect.x)) last.to = rect.x + rect.width;
					else bands.push({ from: rect.x, to: rect.x + rect.width });
				}
				return bands.length === 1 && near(bands[0].from, from) && near(bands[0].to, to);
			})
		)
		.toBe(true);
});
