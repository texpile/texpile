import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { useTexpile } from './driver/useTexpile';

const texpile = useTexpile();

test('opens the folder on its main file with no errors', async () => {
	const { page } = texpile();
	await expect(page.getByText('main.tex', { exact: true }).first()).toBeVisible();
});

test('a typed command completes in the source editor', async () => {
	const { source } = texpile();
	await source.open('main.tex');
	const rows = await source.completeAfter('\\label{sec:intro}\n', '\\topr');
	expect(rows.map((r) => r.label)).toContain('\\toprule');
});

test('typing saves the file and leaves the rest of it as it was', async () => {
	const { source } = texpile();
	await source.open('main.tex');
	const before = fs.readFileSync(source.path('main.tex'), 'utf8');
	await source.caretAfter('Speed is ');
	await source.type('fast and ');
	await expect
		.poll(() => fs.readFileSync(source.path('main.tex'), 'utf8'), { timeout: 10_000 })
		.toBe(before.replace('Speed is ', 'Speed is fast and '));
});
