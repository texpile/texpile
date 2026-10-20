// The compiler's scratch must not walk into a paper's history - but the output PDF is not scratch.
// It is what was submitted and what a reviewer read, and it is what makes a version in the timeline
// openable without recompiling, so it stays with the document.
import { describe, it, expect } from 'vitest';
import { isBuildArtifact, gitignoreLines } from '$lib/workspace/buildArtifacts';

describe('isBuildArtifact', () => {
	it('catches the LaTeX sidecars', () => {
		for (const f of [
			'/ws/main.aux',
			'/ws/main.log',
			'/ws/main.fls',
			'/ws/main.fdb_latexmk',
			'/ws/main.bbl',
			'/ws/main.lof',
			'/ws/main.run.xml',
			'/ws/main.gls',
			'/ws/main.nav'
		]) {
			expect(isBuildArtifact(f), f).toBe(true);
		}
	});

	it('leaves the author’s files alone', () => {
		for (const f of ['/ws/main.tex', '/ws/refs.bib', '/ws/chapters/methods.tex', '/ws/paper.typ', '/ws/notes.md']) {
			expect(isBuildArtifact(f), f).toBe(false);
		}
	});

	// the decision this module exists to record: derived, but still part of the paper
	it('keeps the output PDF with the document, not the scratch', () => {
		expect(isBuildArtifact('/ws/main.pdf')).toBe(false);
		expect(isBuildArtifact('/ws/paper.pdf')).toBe(false);
	});

	it('keeps PDF figures too, for the same reason a *.pdf rule would be wrong', () => {
		expect(isBuildArtifact('/ws/figs/plot.pdf')).toBe(false);
		expect(isBuildArtifact('/ws/BERT_Overall.pdf')).toBe(false);
	});

	it('treats Draft mode’s scratch area as scratch, whatever is in it', () => {
		expect(isBuildArtifact('/ws/_draft/draft.pdf')).toBe(true);
		expect(isBuildArtifact('/ws/_draft/draft.log')).toBe(true);
		expect(isBuildArtifact('C:\\ws\\_draft\\draft.aux')).toBe(true);
	});

	it('matches a sidecar regardless of case', () => {
		expect(isBuildArtifact('/ws/MAIN.AUX')).toBe(true);
	});

	// git status reports the whole subtree, so classification has to hold at any depth - a chapter
	// compiled in its own folder leaves its sidecars there, not at the root
	it('classifies at any depth, on either separator', () => {
		expect(isBuildArtifact('/ws/chapters/deep/nested.aux')).toBe(true);
		expect(isBuildArtifact('C:\\ws\\chapters\\deep\\nested.fdb_latexmk')).toBe(true);
		expect(isBuildArtifact('/ws/sub/_draft/scratch.log')).toBe(true);
		expect(isBuildArtifact('/ws/chapters/deep/keep.tex')).toBe(false);
	});

	// _draft must be a whole path SEGMENT: a folder that merely starts with it is the author's
	it('does not mistake a lookalike folder for the draft area', () => {
		expect(isBuildArtifact('/ws/_drafts/chapter.tex')).toBe(false);
		expect(isBuildArtifact('/ws/my_draft/notes.tex')).toBe(false);
	});

	// the dot of run.xml and synctex.gz is literal
	it('matches a dotted extension only whole', () => {
		expect(isBuildArtifact('/ws/main.synctex.gz')).toBe(true);
		expect(isBuildArtifact('/ws/mainsynctex.gz')).toBe(false);
		expect(isBuildArtifact('/ws/main.runXxml')).toBe(false);
	});
});

describe('gitignoreLines', () => {
	it('gives a LaTeX project its sidecar patterns', () => {
		const lines = gitignoreLines('latex');
		expect(lines).toContain('*.aux');
		expect(lines).toContain('*.fdb_latexmk');
		expect(lines).toContain('*.lof');
		expect(lines).toContain('*.synctex.gz');
		expect(lines).toContain('_draft/');
	});

	// a Typst project has no sidecars, and listing LaTeX's would be noise in a file the author reads
	it('gives a Typst project only the draft area', () => {
		expect(gitignoreLines('typst').filter((l) => !l.startsWith('#'))).toEqual(['_draft/']);
	});

	// the whole point of the PDF decision: it must not be ignored, and no glob may catch it
	it('never ignores a PDF', () => {
		for (const format of ['latex', 'typst'] as const) {
			expect(gitignoreLines(format).some((l) => /pdf/i.test(l))).toBe(false);
		}
	});

	// A leading slash anchors a gitignore pattern to the file's own directory, so '/*.aux' would
	// miss chapters/main.aux entirely. Verified against real git: unanchored patterns match at any
	// depth, which is what a project with per-chapter compiles needs.
	it('writes no root-anchored pattern, so every rule applies at any depth', () => {
		for (const format of ['latex', 'typst'] as const) {
			for (const line of gitignoreLines(format)) {
				if (line.startsWith('#')) continue;
				expect(line.startsWith('/'), line).toBe(false);
			}
		}
	});
});
