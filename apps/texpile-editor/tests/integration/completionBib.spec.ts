import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import fs from 'node:fs';
import { labels, probe } from './driver/completionHelpers';

const texpile = useTexpile();

const SPEED = 'Speed is';

test('cite: a key added to refs.bib on disk is offered', async () => {
	const { source } = texpile();
	const file = source.path('refs.bib');
	const original = fs.readFileSync(file, 'utf8');
	try {
		fs.writeFileSync(file, `${original}\n@misc{zzfresh2026,\n  title = {Fresh},\n  year = {2026}\n}\n`);
		await expect
			.poll(async () => labels(await probe(source, { file: 'main.tex', anchor: SPEED, typed: ' \\cite{zzfr' })), { timeout: 20_000 })
			.toContain('zzfresh2026');
	} finally {
		fs.writeFileSync(file, original);
	}
});
