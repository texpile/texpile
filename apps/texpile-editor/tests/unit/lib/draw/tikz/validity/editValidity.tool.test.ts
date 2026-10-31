// inert unless VALIDITY is set and lualatex is on the PATH: every edit the editor makes, on every kind of picture it reads,
// still typesets. VALIDITY_ONLY picks pictures by name, VALIDITY_LOG gets each edit as it is tried
import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { drawWithLualatex, hasLualatex, useLualatex } from '../../engines/lualatexEngine';
import { instrumentPicture } from '$lib/draw/tikz/source/instrument';
import { tikzLanguage as lang } from '$lib/draw/tikz/tikzLanguage';
import { pictureEdits, statementEdits } from './validityEdits';
import { FIXTURES } from './validityFixtures';

describe.skipIf(!hasLualatex || !process.env.VALIDITY)('edit validity', () => {
	useLualatex();

	/** what TeX said, or why there was no picture to give it */
	async function problems(source: string) {
		const picture = lang.readPicture(source, 0);
		if (!picture) return ['no picture'];
		const at = source.indexOf('\\begin{document}');
		try {
			const result = await drawWithLualatex(source.slice(0, at), instrumentPicture(source, picture as never));
			const ended = result.marks.some((m) => m.i === 0) || !!picture.layout;
			return [...result.errors, ...(ended ? [] : ['the picture never ended'])];
		} catch (e) {
			return [String(e)];
		}
	}

	function preambleOf(text: string) {
		return text.slice(0, text.indexOf('\\begin{document}'));
	}

	const only = process.env.VALIDITY_ONLY ? new RegExp(process.env.VALIDITY_ONLY) : null;
	it.each(FIXTURES.filter((f) => !only || only.test(f.name)))('$name', { timeout: 30 * 60 * 1000 }, async ({ name, source }) => {
		expect(await problems(source), name).toEqual([]);
		const picture = lang.readPicture(source, 0)!;
		const tried = [
			...pictureEdits(source, picture).map((e) => ({ ...e, on: 'picture' })),
			...picture.statements.flatMap((st) => statementEdits(source, picture, st).map((e) => ({ ...e, on: `${st.i} ${st.kind}` })))
		];
		// TeX keeps a preamble warm, so edits that share one go together; one the editor refuses is never made
		const edits = tried.filter(
			(e): e is typeof e & { next: string } => !!e.next && e.next !== source && !lang.brokenNeed(source, e.next, 0)
		);
		edits.sort((a, b) => preambleOf(a.next).localeCompare(preambleOf(b.next)));
		const log = process.env.VALIDITY_LOG;
		const broken: string[] = [];
		for (const { what, next, on } of edits) {
			if (log) appendFileSync(log, `${name} | ${on} ${what}\n`);
			const found = await problems(next);
			const line = found.length ? `${on} ${what}: ${found[0].split('\n')[0]}` : null;
			if (log && line) appendFileSync(log, `${name} | FAIL ${line}\n`);
			if (line) broken.push(line);
		}
		expect(broken).toEqual([]);
	});
});
