// \includegraphics without an extension must resolve like the engine would (probe, .pdf first),
// it must search every directory the engine searches (the file's own, the root, \graphicspath),
// and PDF sources must be flagged so the node view renders them instead of handing a PDF to <img>
import { describe, it, expect } from 'vitest';
import { graphicExtensionsFor } from '$lib/languages/latex/knowledge/registries/graphicExtensions';
import { resolveGraphicUrl } from '$lib/editor/visual/extensions/image/graphicSrcResolve';

/** the single-directory workspace: one candidate per name */
const urlFor = (rel: string) => [`served:/${rel}`];
/** a project whose figures live in figs/, referenced from chapters/ - the \graphicspath case */
const urlsInDirs = (dirs: string[]) => (rel: string) => dirs.map((d) => `served:/${d}/${rel}`);
/** pdflatex's order */
const PDFLATEX = graphicExtensionsFor('pdflatex');
const existing = (files: string[]) => async (url: string) => files.includes(url);

describe('resolveGraphicUrl', () => {
	it('an explicit extension in a single directory is trusted without probing', async () => {
		let probes = 0;
		const r = await resolveGraphicUrl('figs/plot.png', urlFor, async () => (probes++, true), PDFLATEX);
		expect(r).toEqual({ url: 'served:/figs/plot.png', isPdf: false });
		expect(probes).toBe(0);
	});

	it('flags an explicit .pdf regardless of case', async () => {
		expect((await resolveGraphicUrl('BERT_Overall.pdf', urlFor, async () => true, PDFLATEX)).isPdf).toBe(true);
		expect((await resolveGraphicUrl('BERT_Overall.PDF', urlFor, async () => true, PDFLATEX)).isPdf).toBe(true);
	});

	it('probes an extensionless src and prefers .pdf, as pdflatex does', async () => {
		const r = await resolveGraphicUrl('BERT_Overall', urlFor, existing(['served:/BERT_Overall.pdf', 'served:/BERT_Overall.png']), PDFLATEX);
		expect(r).toEqual({ url: 'served:/BERT_Overall.pdf', isPdf: true });
	});

	it('falls through to whichever raster exists', async () => {
		const r = await resolveGraphicUrl('fig1', urlFor, existing(['served:/fig1.jpg']), PDFLATEX);
		expect(r).toEqual({ url: 'served:/fig1.jpg', isPdf: false });
	});

	it('nothing found: first candidate so the <img> error path shows not-found', async () => {
		const probed: string[] = [];
		const r = await resolveGraphicUrl('ghost', urlFor, async (u) => (probed.push(u), false), PDFLATEX);
		expect(r).toEqual({ url: 'served:/ghost', isPdf: false });
		expect(probed).toHaveLength(PDFLATEX.length);
	});

	// The bug this grew from: chapters/methods.tex says \includegraphics{sample.png}, main.tex says
	// \graphicspath{{figs/}}, and the file is figs/sample.png. Resolving against the open file's
	// directory alone requested chapters/sample.png and 403'd on a figure that exists.
	it('finds an explicit name in a later search directory, not just the first', async () => {
		const urls = urlsInDirs(['chapters', 'root', 'root/figs']);
		const r = await resolveGraphicUrl('sample.png', urls, existing(['served:/root/figs/sample.png']), PDFLATEX);
		expect(r.url).toBe('served:/root/figs/sample.png');
	});

	it('searches every directory before trying the next extension', async () => {
		// a .png in the LAST directory still beats a .jpg in the first: extension is the outer loop
		const urls = urlsInDirs(['a', 'b']);
		const r = await resolveGraphicUrl('fig', urls, existing(['served:/a/fig.jpg', 'served:/b/fig.png']), PDFLATEX);
		expect(r.url).toBe('served:/b/fig.png');
	});

	it('a .pdf anywhere in the search path beats a raster, and is flagged', async () => {
		const urls = urlsInDirs(['a', 'b']);
		const r = await resolveGraphicUrl('fig', urls, existing(['served:/a/fig.png', 'served:/b/fig.pdf']), PDFLATEX);
		expect(r).toEqual({ url: 'served:/b/fig.pdf', isPdf: true });
	});

	it('probes the extensions it is given, in that order', async () => {
		const r = await resolveGraphicUrl('fig', urlFor, existing(['served:/fig.png', 'served:/fig.jpg']), ['.jpg', '.png']);
		expect(r.url).toBe('served:/fig.jpg');
	});

	it('with several directories an explicit name IS probed, and falls back to the first', async () => {
		const urls = urlsInDirs(['a', 'b']);
		const r = await resolveGraphicUrl('gone.png', urls, async () => false, PDFLATEX);
		expect(r.url).toBe('served:/a/gone.png');
	});
});
