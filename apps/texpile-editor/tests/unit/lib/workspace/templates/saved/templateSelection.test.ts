// Save as template's file choice and naming, on the renderer's side: which surveyed files are
// copied, which name counts as taken, and what a template opens in.
import { describe, expect, it } from 'vitest';
import {
	selectTemplateFiles,
	templateLangOf,
	templateNamed,
	templateSizeText,
	TEMPLATE_WARN_BYTES
} from '$lib/workspace/templates/saved/templateSelection';
import { universeFailureText } from '$lib/workspace/templates/universe/universeProject';
import type { UserTemplate } from '$lib/workspace/templates/templateBridge.types';

function survey(paths: Record<string, number>) {
	return { files: Object.entries(paths).map(([path, size]) => ({ path, size })), truncated: false, limit: 2000 };
}

function saved(id: string, name: string): UserTemplate {
	return { id, name, description: '', lang: 'latex', mainFile: 'main.tex', createdAt: 0 };
}

describe('selectTemplateFiles', () => {
	it('keeps the sources, figures and bibliography, and drops compile scratch', () => {
		const picked = selectTemplateFiles(
			survey({
				'main.tex': 100,
				'main.aux': 5,
				'main.log': 5,
				'main.synctex.gz': 5,
				'main.fdb_latexmk': 5,
				'chapters/intro.tex': 50,
				'refs.bib': 20,
				'figures/plot.pdf': 400,
				'figures/photo.png': 300
			}),
			'main.pdf'
		);
		expect(picked.files).toEqual(['main.tex', 'chapters/intro.tex', 'refs.bib', 'figures/plot.pdf', 'figures/photo.png']);
		expect(picked.bytes).toBe(870);
	});

	it("drops the main file's compiled PDF but not a PDF figure", () => {
		const picked = selectTemplateFiles(survey({ 'main.typ': 10, 'Main.pdf': 999, 'figures/graph.pdf': 30 }), 'main.pdf');
		expect(picked.files).toEqual(['main.typ', 'figures/graph.pdf']);
	});

	it('drops what the OS and editors leave in a folder', () => {
		const picked = selectTemplateFiles(
			survey({ 'main.tex': 1, '.DS_Store': 1, 'figs/Thumbs.db': 1, 'desktop.ini': 1, '._main.tex': 1, 'main.tex~': 1, '.latexmkrc': 1 }),
			null
		);
		expect(picked.files).toEqual(['main.tex', '.latexmkrc']);
	});
});

describe('naming', () => {
	it('finds a clash ignoring case and outer spaces, but not with the template being renamed', () => {
		const list = [saved('paper', 'Paper'), saved('lab', 'Lab report')];
		expect(templateNamed(list, '  paper ')?.id).toBe('paper');
		expect(templateNamed(list, 'Thesis')).toBeUndefined();
		expect(templateNamed(list, 'PAPER', 'paper')).toBeUndefined();
		expect(templateNamed(list, 'lab report', 'paper')?.id).toBe('lab');
	});

	it('opens a .typ main file as Typst and anything else as LaTeX', () => {
		expect(templateLangOf('main.typ')).toBe('typst');
		expect(templateLangOf('thesis/Main.TYP')).toBe('typst');
		expect(templateLangOf('main.tex')).toBe('latex');
	});

	it('writes sizes the way the dialog shows them', () => {
		expect(templateSizeText(200)).toBe('1 KB');
		expect(templateSizeText(300 * 1024)).toBe('300 KB');
		expect(templateSizeText(TEMPLATE_WARN_BYTES)).toBe('20.0 MB');
	});
});

describe('Typst Universe', () => {
	it('turns a failed download into plain words and passes anything else through', () => {
		const offline = 'failed to download package (net::ERR_INTERNET_DISCONNECTED)';
		expect(universeFailureText(offline)).not.toContain('ERR_');
		expect(universeFailureText('x is not a template')).toBe('x is not a template');
	});
});
