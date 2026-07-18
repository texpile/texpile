import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { decideEdit } from '$lib/draft/dispatch';

// exact storm phase-2 state: intro paragraph extended (pending patch) + first junk
// paragraph typed before \section{Switching -- must merge into ONE patch
it('storm phase-2 state merges', () => {
	const base = fs.readFileSync(path.resolve(__dirname, '../../../live/fixtures/tut/main.tex'), 'utf8');
	const target = 'basics to get you started.';
	const extended = base.replace(target, target + ' waawfwaf awwfawfawfawf');
	const lines = extended.split('\n');
	const li = lines.findIndex((l) => l.includes('\\section{Switching'));
	const withJunk = [...lines.slice(0, li), 'waf', '', ...lines.slice(li)].join('\n');
	const d = decideEdit(base, withJunk);
	expect(d.kind).toBe('patch');
	if (d.kind === 'patch') expect(d.text).toContain('\\par waf');
});
