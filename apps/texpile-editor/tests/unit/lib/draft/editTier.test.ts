import { describe, expect, it } from 'vitest';
import { editTier } from '$lib/draft/heuristics/eligibility/editTier';

// Three tiers, decided by where the text moved. `text` may adopt and skip the compile;
// `interior` renders from the engine but always reconciles (the text can also reach a
// running head or a later use); `structural` recompiles. The second half of `interior`
// -- does the edit change the band's own ink -- is the ENGINE's call (bandChanged), so a
// value edit classified interior here still refuses at the patcher.

describe('text: only top-level prose moved', () => {
	it('plain typing', () => {
		expect(editTier('The quick fox.', 'The quick brown fox.')).toBe('text');
	});
	it('prose around an unchanged command', () => {
		expect(editTier('See \\ref{fig:a} now.', 'See \\ref{fig:a} right now.')).toBe('text');
	});
	it('content inside a comment', () => {
		expect(editTier('a % old\nb', 'a % new note\nb')).toBe('text');
	});
});

describe('interior: text moved inside unchanged structure', () => {
	it('a heading title', () => {
		expect(editTier('\\section{Alpha}', '\\section{Alpxha}')).toBe('interior');
	});
	it('an emphasised span, growth and whitespace included', () => {
		expect(editTier('a \\emph{word} b', 'a \\emph{two words now} b')).toBe('interior');
	});
	it('inline math content', () => {
		expect(editTier('value $a + b$ here', 'value $a + d$ here')).toBe('interior');
	});
	it('an argument that never becomes ink -- the ENGINE refuses it, not this tier', () => {
		expect(editTier('\\gdef\\ver{2.0} x', '\\gdef\\ver{3.0} x')).toBe('interior');
		expect(editTier('\\vspace{10pt} x', '\\vspace{100pt} x')).toBe('interior');
	});
});

describe('structural: the parse itself moved', () => {
	it('a star is structure, blanked or not', () => {
		expect(editTier('\\section{Alpha}', '\\section*{Alpha}')).toBe('structural');
	});
	it('a command appearing', () => {
		expect(editTier('plain words', 'plain \\textbf{words}')).toBe('structural');
	});
	it('a math span appearing', () => {
		expect(editTier('value here', 'value $x$ here')).toBe('structural');
	});
	it('a comment appearing, whose trailing % rejoins words', () => {
		expect(editTier('prose\nmore', 'prose %\nmore')).toBe('structural');
	});
	it('an unreadable block, which must never equal another unreadable one', () => {
		expect(editTier('', '')).toBe('structural');
	});
});
