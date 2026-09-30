// The Insert menu's Typst items: references, breaks and spaces, document parts and Typst source. What the visual editor
// draws goes in as its chip and opens the chip's panel, as the LaTeX items do; a cross-reference types the @ that opens
// the reference picker; source mode writes the Typst. Included files and comments stay with the LaTeX items
import { TextSelection } from 'prosemirror-state';
import { editorViewStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { activeFilePath } from '$lib/workspace/workspaceStore';
import { sanitizeLabel } from '$lib/editor/visual/label';
import { typStr } from '$lib/languages/typst/visual/serialize/typstInline';
import { activeCm, cmReplace, insertNode } from '$lib/chrome/menuBarCommands';
import { symbolPicker } from '$lib/editor/symbols/symbolPicker.svelte';
import { typstSymbolSet } from '$lib/languages/typst/symbols/typstSymbolSet';
import { cmOnOwnLine, folderOf, insertChips } from './menuBarInsertDrawn';
import { m } from '$lib/paraglide/messages';

export const TYPST_INSERT_ITEMS = [
	'crossref',
	'label',
	'footnote',
	'pagebreak',
	'vspace',
	'hspace',
	'outline',
	'bibliography',
	'rawtypst',
	'inlinetypst'
] as const;

// drawn in the text (a footnote, a horizontal space) or as a block of its own, as the converter reads them back
const CHIPS: Record<string, { source: string; block: boolean }> = {
	footnote: { source: '#footnote[]', block: false },
	pagebreak: { source: '#pagebreak()', block: true },
	vspace: { source: '#v(1em)', block: true },
	hspace: { source: '#h(1em)', block: false },
	outline: { source: '#outline()', block: true }
};

type TypstInsertDeps = {
	askText: (title: string, initial?: string, offered?: string[]) => Promise<string | null>;
};

/** the relative path from `dir` to `file`; null on another drive */
function pathFrom(dir: string, file: string): string | null {
	const from = dir.replace(/[\\/]+$/, '').split(/[\\/]/);
	const to = file.split(/[\\/]/);
	let common = 0;
	while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
	return common ? [...from.slice(common).map(() => '..'), ...to.slice(common)].join('/') : null;
}

/** the project's bibliography files as a Typst file reads them, relative to it and with their extension */
function bibliographySource(): string {
	const open = activeFilePath.current;
	const files = [...new Set(projectIntelStore.current.bibEntries.map((entry) => entry.file))]
		.map((file) => (open ? pathFrom(folderOf(open), file) : file))
		.filter((path): path is string => path !== null && !/^[a-zA-Z]:|^\//.test(path))
		.sort();
	if (files.length <= 1) return `#bibliography(${typStr(files[0] ?? 'refs.bib')})`;
	return `#bibliography((${files.map(typStr).join(', ')}))`;
}

/** the @ the reference picker opens on, typed at the caret past any selection, as the other items go in */
function typeReferenceMarker(): void {
	const view = editorViewStore.current;
	if (!view) return;
	const at = view.state.selection.to;
	const tr = view.state.tr.insertText('@', at);
	view.dispatch(tr.setSelection(TextSelection.create(tr.doc, at + 1)).scrollIntoView());
	view.focus();
}

/** the Typst items above, in either mode; false for any other item */
export function makeTypstInserts(deps: TypstInsertDeps): (value: string) => Promise<boolean> {
	async function askLabel(): Promise<string | null> {
		const name = sanitizeLabel((await deps.askText(m.menubar_prompt_label_name(), '')) ?? '');
		return name || null;
	}

	async function inSource(value: string): Promise<void> {
		const cm = activeCm();
		if (!cm) return;
		const chip = CHIPS[value];
		if (value === 'footnote') return cmReplace(cm, '#footnote[', ']');
		if (chip) return chip.block ? cmOnOwnLine(cm, chip.source) : cmReplace(cm, chip.source);
		if (value === 'crossref') return cmReplace(cm, '@');
		if (value === 'bibliography') return cmOnOwnLine(cm, bibliographySource());
		if (value === 'label') {
			const name = await askLabel();
			if (name) cmReplace(cm, `<${name}>`);
		}
	}

	async function inVisual(value: string): Promise<void> {
		const chip = CHIPS[value];
		if (chip) return insertChips([chip.source], chip.block ? 'block' : 'inline');
		if (value === 'crossref') return typeReferenceMarker();
		if (value === 'bibliography') return insertChips([bibliographySource()], 'block');
		if (value === 'rawtypst') return insertNode((state) => state.schema.nodes.raw_latex.create(null, state.schema.text('#lorem(20)')));
		if (value === 'inlinetypst')
			return insertNode((state) => state.schema.nodes.inline_latex.create(null, state.schema.text('#sym.arrow.r')));
		if (value === 'label') {
			const name = await askLabel();
			if (name) insertChips([`<${name}>`], 'inline');
		}
	}

	return async (value) => {
		// the picker inserts where the caret is, in either mode
		if (value === 'symbolpicker') {
			await symbolPicker.show(typstSymbolSet);
			return true;
		}
		if (!(TYPST_INSERT_ITEMS as readonly string[]).includes(value)) return false;
		if (activeCm()) await inSource(value);
		else await inVisual(value);
		return true;
	};
}
