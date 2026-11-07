import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
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
	await expect(page.locator('.texpile-diff-added')).toHaveText(['measured ']);
	await expect(page.locator('.texpile-diff-removed')).toHaveCount(0);
});
