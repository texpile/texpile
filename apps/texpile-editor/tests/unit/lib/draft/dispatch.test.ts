import { describe, expect, it } from 'vitest';
import { decideEdit, daemonReady, repairForPreview } from '$lib/draft/heuristics/dispatch';

// The compound-alignment rules: an exact patch never advances the baseline, so "type in a
// paragraph, then open a new one" must read as ONE merged engine typeset (prev + \par +
// new), never a JS-placed splice -- indent and spacing are the engine's to decide.
const DOC = [
	'\\documentclass{article}',
	'\\begin{document}',
	'Alpha one two three.',
	'',
	'Beta four five six.',
	'\\end{document}',
	''
].join('\n');

describe('decideEdit compound alignment', () => {
	it('rides a clean-baseline insert on the previous block (engine-true spacing)', () => {
		const src = DOC.replace('Beta four', 'Fresh inserted paragraph.\n\nBeta four');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Alpha one two three.');
		expect(d.text).toBe('Alpha one two three.\n\\par Fresh inserted paragraph.');
	});

	it('rides an env-anchored insert on the whole environment (engine supplies the indent)', () => {
		const doc = DOC.replace('Alpha one two three.', 'Alpha one two three.\n\n\\begin{quote}\nquoted words\n\\end{quote}');
		const src = doc.replace('\nBeta four', '\n\\noindent Fresh flush paragraph.\n\nBeta four');
		const d = decideEdit(doc, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('\\begin{quote}\nquoted words\n\\end{quote}');
		// the typed \noindent ships verbatim; the ENGINE executes it after the real \par
		expect(d.text).toBe('\\begin{quote}\nquoted words\n\\end{quote}\n\\par \\noindent Fresh flush paragraph.');
	});

	it('rides a heading insert on the previous block (typing from scratch is headings + prose)', () => {
		const src = DOC.replace('Beta four', '\\section{Fresh}\n\nBeta four');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Alpha one two three.');
		// the heading ships verbatim inside the merged unit; its number is the engine's
		// (deterministic via the daemon counter reset) and certifies via the reconcile
		expect(d.text).toBe('Alpha one two three.\n\\par \\section{Fresh}');
	});

	it('still sends a float insert to the full pass', () => {
		const src = DOC.replace('Beta four', '\\begin{table}\nx\n\\end{table}\n\nBeta four');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('structural');
	});

	it('merges a pending edit + adjacent new paragraph into ONE patch (no alternation)', () => {
		const src = DOC.replace('Alpha one two three.', 'Alpha one x two three.\n\nFresh inserted paragraph.');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Alpha one two three.');
		expect(d.text).toBe('Alpha one x two three.\n\\par Fresh inserted paragraph.');
	});

	it('rides a NEW list item on the previous item as one re-wrapped list typeset', () => {
		const doc = DOC.replace('Beta four five six.', '\\begin{itemize}\n\\item First point.\n\\item Second point.\n\\end{itemize}');
		const src = doc.replace('\\item Second point.', '\\item Second point.\n\\item Third point typed now.');
		const d = decideEdit(doc, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('\\par\\begin{itemize}\\item Second point.\\end{itemize}');
		expect(d.text).toBe('\\par\\begin{itemize}\\item Second point.\n\\item Third point typed now.\\end{itemize}');
		expect(d.listItem).toBe(true);
	});

	it('rides a DELETED list item on the previous item in reverse', () => {
		const doc = DOC.replace('Beta four five six.', '\\begin{itemize}\n\\item First point.\n\\item Second point.\n\\end{itemize}');
		const src = doc.replace('\n\\item Second point.', '');
		const d = decideEdit(doc, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('\\par\\begin{itemize}\\item First point.\n\\item Second point.\\end{itemize}');
		expect(d.text).toBe('\\par\\begin{itemize}\\item First point.\\end{itemize}');
	});

	it('keeps a first-item insert (no sibling item above) on the full pass', () => {
		const doc = DOC.replace('Beta four five six.', '\\begin{itemize}\n\\item Only point.\n\\end{itemize}');
		const src = doc.replace('\\begin{itemize}\n\\item Only point.', '\\begin{itemize}\n\\item Fresh first.\n\\item Only point.');
		expect(decideEdit(doc, src).kind).toBe('structural');
	});

	it('rides an insert at the very top of the body on the NEXT block', () => {
		const src = DOC.replace('Alpha one two three.', 'Opening paragraph typed first.\n\nAlpha one two three.');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Alpha one two three.');
		expect(d.text).toBe('Opening paragraph typed first.\n\\par Alpha one two three.');
	});

	it('rides an insert under a float on the NEXT block (the float cannot carry it)', () => {
		const doc = DOC.replace('Alpha one two three.', '\\begin{table}\nx\n\\end{table}');
		const src = doc.replace('\nBeta four', '\nUnder the table now.\n\nBeta four');
		const d = decideEdit(doc, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Beta four five six.');
		expect(d.text).toBe('Under the table now.\n\\par Beta four five six.');
	});

	it('rides a delete of the FIRST paragraph on the next block in reverse', () => {
		const src = DOC.replace('Alpha one two three.\n\n', '');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Alpha one two three.\n\\par Beta four five six.');
		expect(d.text).toBe('Beta four five six.');
	});

	it('rides a pure delete on the previous block (engine computes the closed-up height)', () => {
		const src = DOC.replace('\n\nBeta four five six.', '');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Alpha one two three.\n\\par Beta four five six.');
		expect(d.text).toBe('Alpha one two three.');
	});

	it('sends delete-compounds and wide edits to the full pass', () => {
		// delete + pending edit: the two-splice form alternated visually; full pass is honest
		const del = decideEdit(DOC, DOC.replace('Alpha one two three.', 'Alpha one x two three.').replace('\nBeta four five six.', ''));
		expect(del.kind).toBe('structural');
		// two edited paragraphs + an insert is beyond any compound: plain structural
		const wide = decideEdit(DOC, DOC.replace('Alpha one two three.', 'Alpha X.\n\nNew para.').replace('Beta four five six.', 'Beta Y.'));
		expect(wide.kind).toBe('structural');
	});

	it('ships the float alignment with a confined tabular (daemon records carry the centering)', () => {
		const float = [
			'\\begin{table}[h]',
			'\\centering',
			'\\begin{tabular}{ll}',
			'a & b \\\\',
			'\\end{tabular}',
			'\\caption{Cap.}',
			'\\end{table}'
		].join('\n');
		const doc = DOC.replace('Beta four five six.', float);
		const d = decideEdit(doc, doc.replace('a & b', 'a & bx'));
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.floatInner).toBe(true);
		expect(d.floatTabular).toBe(true);
		expect(d.orig).toBe('\\centering\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}');
		expect(d.text).toBe('\\centering\\begin{tabular}{ll}\na & bx \\\\\n\\end{tabular}');
	});

	it('confines a cell edit after a nested tabular to the outer tabular', () => {
		const float = [
			'\\begin{table}[h]',
			'\\begin{tabular}{ll}',
			'\\begin{tabular}{c}n\\end{tabular} & b \\\\',
			'c & d \\\\',
			'\\end{tabular}',
			'\\caption{Cap.}',
			'\\end{table}'
		].join('\n');
		const doc = DOC.replace('Beta four five six.', float);
		const d = decideEdit(doc, doc.replace('c & d', 'c & dx'));
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.floatTabular).toBe(true);
		expect(d.text.endsWith('c & dx \\\\\n\\end{tabular}')).toBe(true);
	});

	it('attaches a run-in head across a blank line (TeX holds the box until prose starts)', () => {
		const doc = DOC.replace('Alpha one two three.', '\\paragraph{Runin Title}\n\nAlpha one two three.');
		const d = decideEdit(doc, doc.replace('Alpha one', 'Alpha xone'));
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		// head + prose are ONE unit; the blank line is stripped from the daemon's text
		expect(d.orig).toContain('\\paragraph{Runin Title}\nAlpha one two three.');
		expect(d.orig).not.toContain('\n\n');
	});

	it('keeps text around a mid-paragraph comment line as ONE paragraph (TeX does not break there)', () => {
		const doc = DOC.replace('Alpha one two three.', 'Alpha one two three.\n%a commented-out sentence sits here\nStill alpha, continued.');
		const d = decideEdit(doc, doc.replace('continued.', 'continuedx.'));
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.orig).toBe('Alpha one two three.\n%a commented-out sentence sits here\nStill alpha, continued.');
		// the comment line ships verbatim; the engine's catcodes render it invisible
		expect(d.text).toContain('continuedx.');
	});

	it('still treats a comment line BETWEEN paragraphs as an inert boundary', () => {
		const doc = DOC.replace('\nBeta four', '\n%note between paragraphs\n\nBeta four');
		const d = decideEdit(doc, doc.replace('%note between', '%notex between'));
		expect(d.kind).toBe('boundary');
	});

	it('routes a preamble edit to the boundary pass (nothing on a page to patch)', () => {
		const d = decideEdit(DOC, DOC.replace('{article}', '[11pt]{article}'));
		expect(d.kind).toBe('boundary');
	});

	it('confines a caption edit even when the caption nests braces two deep', () => {
		const float = [
			'\\begin{table}[h]',
			'\\begin{tabular}{ll}',
			'a & b \\\\',
			'\\end{tabular}',
			'\\caption{Scores for {\\tt {\\small BERT}} runs.}',
			'\\end{table}'
		].join('\n');
		const doc = DOC.replace('Beta four five six.', float);
		const d = decideEdit(doc, doc.replace('runs.', 'runsx.'));
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.floatInner).toBe(true);
		expect(d.floatTabular).toBe(false);
		expect(d.text).toContain('\\caption{Scores for {\\tt {\\small BERT}} runsx.}');
		expect(d.text).not.toContain('tabular');
	});

	it('flags a command entering the paragraph so the patch certifies via reconcile', () => {
		const cmd = decideEdit(DOC, DOC.replace('Alpha one', 'Alpha \\noindent one'));
		expect(cmd.kind).toBe('patch');
		if (cmd.kind === 'patch') expect(cmd.cmdChanged).toBe(true);
		// pure prose typing (and our own \par joiner) keeps the exact tier
		const prose = decideEdit(DOC, DOC.replace('Alpha one', 'Alpha xone'));
		expect(prose.kind).toBe('patch');
		if (prose.kind === 'patch') expect(prose.cmdChanged).toBe(false);
		const merged = decideEdit(DOC, DOC.replace('Beta four', 'Fresh inserted paragraph.\n\nBeta four'));
		expect(merged.kind).toBe('patch');
		if (merged.kind === 'patch') expect(merged.cmdChanged).toBe(false);
	});
});

describe('mid-typing math balance', () => {
	it('treats unclosed \\( and \\[ as not ready, like an odd $', () => {
		expect(daemonReady('open \\(x + y')).toBe(false);
		expect(daemonReady('open \\[x + y')).toBe(false);
		expect(daemonReady('closed \\(x + y\\) fine')).toBe(true);
		expect(daemonReady('a stray closer \\) alone')).toBe(false);
		// \\[2pt] is a line break argument, not display math
		expect(daemonReady('broken line \\\\[2pt] more')).toBe(true);
	});

	it('repairs \\( in nesting order with $ and braces', () => {
		expect(repairForPreview('\\(x + \\textbf{y')).toBe('\\(x + \\textbf{y\n}\\)');
		expect(repairForPreview('mismatch \\(x }')).toBeNull();
	});

	it('rides a mid-math NEW paragraph on the merged run as a transient', () => {
		const src = DOC.replace('Beta four', 'The identity $e^{i\\pi\n\nBeta four');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.transient).toBe(true);
		// buildPatch repaired the merged text: closers in nesting order on their own line
		expect(d.text).toBe('Alpha one two three.\n\\par The identity $e^{i\\pi\n}$');
	});

	it('rides a mid-heading state on the merged run as a transient', () => {
		const src = DOC.replace('Beta four', '\\section{Openin\n\nBeta four');
		const d = decideEdit(DOC, src);
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.transient).toBe(true);
	});

	it('holds a half-typed brace in an abstract as a transient patch of the abstract alone', () => {
		const doc = DOC.replace('Alpha one two three.', '\\begin{abstract}\nWe study things.\n\\end{abstract}\n\nAlpha one two three.');
		const d = decideEdit(doc, doc.replace('study', 'study {'));
		expect(d.kind).toBe('patch');
		if (d.kind !== 'patch') return;
		expect(d.transient).toBe(true);
		expect(d.endLine - d.line).toBe(2);
	});
});
