import { afterEach, describe, expect, it } from 'vitest';
import { counterBefore, isFloatEnv, resetEngineTruth, updateEngineTruth } from '$lib/draft/engineTruth';
import { decideEdit, daemonReady } from '$lib/draft/heuristics/dispatch';

afterEach(() => resetEngineTruth());

const DOC = ['\\documentclass{article}', '\\begin{document}', '\\section{One}', '', 'Alpha one two.', '\\end{document}', ''].join('\n');

describe('counterBefore', () => {
	it('returns the last snapshot strictly before the line, filtered to the edited file', () => {
		updateEngineTruth({
			mainRel: 'main.tex',
			counters: [
				{ l: 3, f: 'main.tex', s: { section: 1 } },
				{ l: 10, f: 'other.tex', s: { section: 9 } },
				{ l: 20, f: 'main.tex', s: { section: 2, footnote: 3 } }
			]
		});
		expect(counterBefore('section', 21, 'main.tex')).toBe(2);
		// the entry AT the queried line is the block's own step: excluded
		expect(counterBefore('section', 20, 'main.tex')).toBe(1);
		// other files' lines never alias into this one
		expect(counterBefore('section', 11, 'main.tex')).toBe(1);
		expect(counterBefore('footnote', 5, 'main.tex')).toBe(null);
	});
});

describe('true counter pins in dispatch', () => {
	it('a heading edit pins the counter the compile logged, not zero', () => {
		// the compile saw three earlier sections; the edited heading is the fourth
		updateEngineTruth({
			mainRel: 'main.tex',
			counters: [{ l: 2, f: 'main.tex', s: { section: 3 } }]
		});
		const src = DOC.replace('\\section{One}', '\\section{Two}');
		const d = decideEdit(DOC, src, 'main.tex');
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		// pin = value BEFORE this heading's own step, so the daemon's \section renders 4
		expect(d.text).toContain('\\setcounter{section}{3}');
		expect(d.orig).toContain('\\setcounter{section}{3}');
	});

	it('without truth the fixed fallback pin stands', () => {
		const src = DOC.replace('\\section{One}', '\\section{Two}');
		const d = decideEdit(DOC, src, 'main.tex');
		if (d.kind !== 'patch') throw new Error(d.kind);
		expect(d.text).toContain('\\setcounter{section}{0}');
	});
});

describe('engine float set', () => {
	it('an ftype@-registered env stops riding the merged path', () => {
		updateEngineTruth({ floats: new Set(['figure', 'table', 'algorithm']) });
		expect(isFloatEnv('algorithm')).toBe(true);
		expect(isFloatEnv('quote')).toBe(false);
	});

	it('the floats the common files define stand when nothing is announced', () => {
		expect(isFloatEnv('algorithm')).toBe(true);
		expect(isFloatEnv('table*')).toBe(true);
		expect(isFloatEnv('quote')).toBe(false);
	});
});

describe('engine catcode table', () => {
	it('a document that de-commented % stops treating it as one', () => {
		const cats = new Array(128).fill(12);
		cats[0x5c] = 0; // \
		cats[0x7b] = 1; // {
		cats[0x7d] = 2; // }
		cats[0x24] = 3; // $
		// no comment char at all (catcode 14 nowhere): a trailing % is just text
		updateEngineTruth({ catcodes: cats });
		expect(daemonReady('50% { of it }')).toBe(true);
		expect(daemonReady('open { brace % not a comment')).toBe(false);
	});
});
