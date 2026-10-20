// The visual doc on screen stays mounted while a re-parse of newer source runs (a source-mode edit,
// then back to visual). Node views settling on that mount dispatched a transaction, which
// serialized the OLD doc over the newer texSource and dropped the queued autosave of it.
import { describe, it, expect, vi } from 'vitest';
import { noParse } from '$lib/editor/visual/parseOrigins';
import { DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { Fragment, type Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { documentPackages, filePackageNames } from '$lib/languages/latex/intellisense/packages/loadedPackages';

function parsedWith(text: string): ParsedLatexFile {
	return {
		doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
		preamble: '\\documentclass{article}\n\\begin{document}\n',
		postamble: '\\end{document}\n',
		hadDocumentEnv: true,
		warnings: [],
		map: { leaves: [], blocks: [] },
		origins: noParse()
	};
}

function makeBuffer() {
	const scheduleSave = vi.fn();
	const buffer = new DocumentBuffer({
		scheduleSave,
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	return { buffer, scheduleSave };
}

describe('DocumentBuffer.onVisualChange while a re-parse is in flight', () => {
	it('ignores transactions from the stale doc', () => {
		const { buffer, scheduleSave } = makeBuffer();
		const old = parsedWith('old');
		buffer.openTex('C:/ws/main.tex', 'ORIGINAL', '\n');
		buffer.adoptParsed(old, 'ORIGINAL');

		buffer.onTexInput('NEWER SOURCE'); // source mode edit, autosave queued for it
		scheduleSave.mockClear();
		buffer.visualStale = true; // the host started re-parsing NEWER SOURCE; `old` is still mounted

		buffer.onVisualChange(old.doc); // a node view settling on the stale mount
		expect(buffer.texSource).toBe('NEWER SOURCE');
		expect(scheduleSave).not.toHaveBeenCalled();
	});

	it('serializes again once the re-parse has been adopted', () => {
		const { buffer, scheduleSave } = makeBuffer();
		buffer.openTex('C:/ws/main.tex', 'ORIGINAL', '\n');
		buffer.adoptParsed(parsedWith('old'), 'ORIGINAL');
		buffer.onTexInput('NEWER SOURCE');
		buffer.visualStale = true;

		const fresh = parsedWith('newer');
		buffer.adoptParsed(fresh, 'NEWER SOURCE');
		expect(buffer.visualStale).toBe(false);
		scheduleSave.mockClear();
		buffer.onVisualChange(parsedWith('newer edited').doc);
		expect(buffer.texSource).toContain('newer edited');
		expect(scheduleSave).toHaveBeenCalledTimes(1);
	});
});

// The visual fast path asks whether the mounted doc already serializes to the current source. It
// used to ask the PARSER's last parsed source, which a visual edit never moves: an external revert
// back to exactly that text then read as "nothing to rebuild", left the edited doc mounted, and the
// next keystroke wrote it back over the version that had replaced it.
describe('DocumentBuffer.lastDocSource follows the mounted doc, not the last parse', () => {
	it('stops matching the source once the visual doc has been edited', () => {
		const { buffer } = makeBuffer();
		buffer.openTex('C:/ws/main.tex', 'ORIGINAL', '\n');
		buffer.adoptParsed(parsedWith('as saved'), 'ORIGINAL');
		expect(buffer.lastDocSource).toBe(buffer.texSource); // freshly parsed: nothing to rebuild

		buffer.onVisualChange(parsedWith('edited').doc);
		buffer.texSource = 'ORIGINAL'; // an external revert adopted over the edited buffer
		expect(buffer.lastDocSource).not.toBe(buffer.texSource);
	});
});

// the file's text got the edit the moment it was made; the undo that takes it back to the saved
// text must reach it too, or the text (and everyone sharing it) keeps the edit
it('folds an edit undone back to the saved text into the file text', () => {
	const scheduleSave = vi.fn();
	const buffer = new DocumentBuffer({
		scheduleSave,
		writeNow: () => {},
		rebuildVisual: () => {},
		isVisualMode: () => true,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
	buffer.openTex('C:/ws/main.tex', 'ORIGINAL', '\n');
	buffer.adoptParsed(parsedWith('as saved'), 'ORIGINAL');
	buffer.onVisualChange(parsedWith('as saved').doc);
	const saved = buffer.texSource;
	buffer.diskBaseline = saved;
	buffer.onVisualChange(parsedWith('edited').doc);
	const edited = buffer.texSource;
	expect(scheduleSave).toHaveBeenLastCalledWith('C:/ws/main.tex', edited, saved);
	buffer.onVisualChange(parsedWith('as saved').doc);
	expect(scheduleSave).toHaveBeenLastCalledWith('C:/ws/main.tex', saved, edited);
});

describe('DocumentBuffer.verifyForWrite', () => {
	const SRC = '\\documentclass{article}\n\\begin{document}\nAlpha   one.\n\nBeta two.\n\\end{document}\n';
	function withCheck(reparse: (text: string) => Promise<PMNode | null>) {
		const noteSaveRewrite = vi.fn();
		const noteSaveUnchecked = vi.fn();
		const buffer = new DocumentBuffer({
			scheduleSave: () => {},
			writeNow: () => {},
			rebuildVisual: () => {},
			isVisualMode: () => true,
			noteLocalEdit: () => {},
			clearPendingAnchor: () => {},
			reparse,
			noteSaveRewrite,
			noteSaveUnchecked
		});
		const parsed = parseLatexFile(SRC);
		buffer.openTex('C:/ws/main.tex', SRC, '\n');
		buffer.adoptParsed(parsed, SRC);
		const child = parsed.doc.child(1);
		const kids: PMNode[] = [];
		parsed.doc.forEach((c, _o, k) =>
			kids.push(k === 1 ? child.type.create(child.attrs, child.type.schema.text('Beta changed.'), child.marks) : c)
		);
		buffer.onVisualChange(parsed.doc.copy(Fragment.fromArray(kids)));
		return { buffer, noteSaveRewrite, noteSaveUnchecked };
	}

	it('says when the file could not be parsed in time, and keeps it as written', async () => {
		const { buffer, noteSaveRewrite, noteSaveUnchecked } = withCheck(() => Promise.resolve(null));
		const text = buffer.texSource;
		expect(await buffer.verifyForWrite('C:/ws/main.tex', text)).toBeNull();
		expect(noteSaveUnchecked).toHaveBeenCalledWith('C:/ws/main.tex');
		expect(noteSaveRewrite).not.toHaveBeenCalled();
	});

	it('keeps a file that reads back as the document', async () => {
		const { buffer, noteSaveRewrite } = withCheck((text) => Promise.resolve(parseLatexFile(text).doc));
		const text = buffer.texSource;
		expect(text).toContain('Alpha   one.\n\nBeta changed.');
		expect(await buffer.verifyForWrite('C:/ws/main.tex', text)).toBeNull();
		expect(noteSaveRewrite).not.toHaveBeenCalled();
	});

	it('rewrites the changed block and follows with its buffers when the file does not', async () => {
		const empty = parseLatexFile('\\documentclass{article}\n\\begin{document}\nNothing.\n\\end{document}\n').doc;
		const { buffer, noteSaveRewrite } = withCheck(() => Promise.resolve(empty));
		const text = buffer.texSource;
		const written = await buffer.verifyForWrite('C:/ws/main.tex', text);
		expect(written).not.toBeNull();
		expect(buffer.texSource).toBe(written);
		expect(buffer.lastDocSource).toBe(written);
		expect(noteSaveRewrite).toHaveBeenCalledWith(2, expect.stringMatching(/reopen/));
	});

	it('does not check text that is not the document\u2019s own serialization', async () => {
		const reparse = vi.fn(() => Promise.resolve(null));
		const { buffer } = withCheck(reparse);
		buffer.onTexInput('typed in source mode');
		expect(await buffer.verifyForWrite('C:/ws/main.tex', 'typed in source mode')).toBeNull();
		expect(reparse).not.toHaveBeenCalled();
	});
});

describe('the menus a document narrows from its packages', () => {
	it('narrow once the packages load, though the document was edited meanwhile', async () => {
		const { buffer } = makeBuffer();
		const parsed = { ...parsedWith('text'), preamble: '\\documentclass{article}\n\\usepackage{natbib}\n\\begin{document}\n' };
		buffer.openTex('C:/ws/main.tex', 'SOURCE', '\n');
		buffer.adoptParsed(parsed, 'SOURCE');
		buffer.onVisualChange(parsedWith('text and more').doc);
		await filePackageNames(parsed.preamble);
		await new Promise((r) => setTimeout(r, 0));
		expect(templateFeaturesStore.current.citationVariants).toContain('citep');
	});

	it('narrow from the preamble as it is when the packages load', async () => {
		const { buffer } = makeBuffer();
		const preamble = '\\documentclass{article}\n\\usepackage{natbib,cleveref}\n\\title{A}\n\\begin{document}\n';
		buffer.openTex('C:/ws/main.tex', 'SOURCE', '\n');
		buffer.adoptParsed({ ...parsedWith('text'), preamble }, 'SOURCE');
		buffer.editFrontmatter('title', 'B');
		await filePackageNames(preamble);
		await new Promise((r) => setTimeout(r, 0));
		expect(templateFeaturesStore.current.citationVariants).toContain('citep');
		expect(templateFeaturesStore.current.refCommands).toContain('cref');
	});

	it('read only what the file loads, not the rest of the project', async () => {
		const { buffer } = makeBuffer();
		const preamble = '\\documentclass{report}\n\\usepackage{natbib}\n\\begin{document}\n';
		const before = projectIntelStore.current;
		projectIntelStore.current = { ...before, packages: [{ name: 'biblatex', options: [] }] };
		buffer.openTex('C:/ws/talk.tex', 'SOURCE', '\n');
		buffer.adoptParsed({ ...parsedWith('text'), preamble }, 'SOURCE');
		await filePackageNames(preamble);
		await new Promise((r) => setTimeout(r, 0));
		projectIntelStore.current = before;
		expect(templateFeaturesStore.current.citationVariants).toContain('citep');
		expect(templateFeaturesStore.current.bibliography).toBe('bibtex');
	});

	it('names cross references from the options cleveref loads with', async () => {
		const { buffer } = makeBuffer();
		const preamble = '\\documentclass{article}\n\\usepackage[noabbrev]{cleveref}\n\\begin{document}\n';
		buffer.openTex('C:/ws/main.tex', 'SOURCE', '\n');
		buffer.adoptParsed({ ...parsedWith('text'), preamble }, 'SOURCE');
		await documentPackages(preamble);
		await new Promise((r) => setTimeout(r, 0));
		expect(templateFeaturesStore.current.crossRefNames?.cref.subfigure).toEqual(['figure', 'figures']);
	});
});
