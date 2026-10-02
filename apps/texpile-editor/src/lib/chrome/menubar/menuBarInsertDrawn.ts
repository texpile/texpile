// The menu items for what the visual editor draws in place of the source: cross-references and links to a
// label, footnotes, labels, page breaks, spaces, the abstract, the appendix, the bibliography,
// included files and source comments (Insert), and the text styles no mark gives (Format). A drawn one goes
// in as its chip and opens the chip's own panel, the way Enter opens a selected chip, so its settings are
// chosen where they are shown. Source mode writes the command.
import { Fragment, Slice, type Node as PMNode } from 'prosemirror-model';
import { NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { EditorView as CMView } from '@codemirror/view';
import { editorViewStore, templateFeaturesStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { activeFilePath, mainFile, texFiles } from '$lib/workspace/workspaceStore';
import { relativeTo } from '$lib/workspace/fileSystem';
import { drawnChipOf } from '$lib/editor/visual/extensions/drawnChips/DrawnChipView';
import { sanitizeLabel } from '$lib/editor/visual/label';
import { renderChildren } from '$lib/languages/latex/serializer/latexSerializer';
import { activeCm, cmApply, cmReplace } from '$lib/chrome/menuBarCommands';
import type { formatOf } from '$lib/workspace/documentBuffer.svelte';
import { m } from '$lib/paraglide/messages';

type Dialect = ReturnType<typeof formatOf>;

type DrawnInsertDeps = {
	dialect: () => Dialect;
	askText: (title: string, initial?: string, offered?: string[]) => Promise<string | null>;
};

// the shapes the parser gives these commands, so what goes in is what a reopen reads back: among the
// words (\quad, \cref, \footnote), a line of their own (\newpage, \medskip, \appendix, the bibliography),
// or a block of source (a comment)
type ChipShape = 'inline' | 'line' | 'block';

export const DRAWN_INSERT_ITEMS = [
	'crossref',
	'hyperref',
	'footnote',
	'label',
	'pagebreak',
	'vspace',
	'hspace',
	'abstract',
	'appendix',
	'bibliography',
	'include',
	'comment'
] as const;

// the text styles the editor draws that no mark gives (bold, italic, underline and code are marks)
export const MENU_TEXT_STYLES = {
	textsc: ['\\textsc{', '}'],
	textsf: ['\\textsf{', '}'],
	textsl: ['\\textsl{', '}'],
	fbox: ['\\fbox{', '}'],
	mbox: ['\\mbox{', '}'],
	large: ['{\\large ', '}']
} as const;

/** cleveref's command when the preamble loads it, since it stays a drawn chip with its panel; plain \ref otherwise */
function crossRefSource(): string {
	return templateFeaturesStore.current.refCommands?.includes('cref') ? '\\cref{}' : '\\ref{}';
}

function bibliographySources(): string[] {
	if (templateFeaturesStore.current.bibliography === 'biblatex') return ['\\printbibliography'];
	// bibtex reads the names from the main file's folder, so a .bib in a subfolder keeps its folder
	const folder = folderOf(mainFile.current ?? activeFilePath.current ?? '');
	const names = new Set(
		projectIntelStore.current.bibEntries.map((entry) =>
			relativeTo(folder, entry.file)
				.replace(/\\/g, '/')
				.replace(/\.bib$/i, '')
		)
	);
	return ['\\bibliographystyle{plain}', `\\bibliography{${[...names].join(',')}}`];
}

export function folderOf(path: string): string {
	return path.replace(/[\\/][^\\/]*$/, '');
}

// an \input path is read from the main file's folder and conventionally drops .tex; a Typst include is read
// from the including file's folder and keeps its extension
function includeCandidates(dialect: 'tex' | 'typ'): string[] {
	const open = activeFilePath.current;
	const from = dialect === 'tex' ? (mainFile.current ?? open) : open;
	if (!from) return [];
	const folder = folderOf(from);
	const extension = dialect === 'tex' ? /\.tex$/i : /\.typ$/i;
	return texFiles.current
		.filter((file) => extension.test(file.path) && file.path !== open && file.path !== mainFile.current)
		.map((file) => relativeTo(folder, file.path))
		.filter((path) => !/^[a-zA-Z]:|^\//.test(path))
		.map((path) => (dialect === 'tex' ? path.replace(extension, '') : path))
		.sort();
}

/** where a node just put in ended up, found by identity in the stretch that went in */
function positionOf(tr: Transaction, node: PMNode, near: number, span: number): number | null {
	let found: number | null = null;
	tr.doc.nodesBetween(Math.max(0, near - 2), Math.min(tr.doc.content.size, near + span + 4), (child, pos) => {
		if (found !== null) return false;
		if (child === node) found = pos;
		return true;
	});
	return found;
}

/** the selected words as LaTeX when they sit in one paragraph, for a command that holds them */
function selectedLatex(view: EditorView): string | null {
	const { from, to, $from, $to } = view.state.selection;
	if (from === to || !$from.sameParent($to) || !$from.parent.isTextblock) return null;
	return renderChildren(view.state.schema.nodes.paragraph.create(null, view.state.doc.slice(from, to).content), false);
}

// where what goes in lands: over the selection for a chip that holds the selected words; at the caret, past
// any selection, for what sits among the words or ends the paragraph there (a page break); after the
// paragraph the caret is in for a block of its own (a comment, an included file, the abstract), which must
// not split a sentence the way a caret in the middle of a word would
type Placement = 'selection' | 'caret' | 'after-paragraph';

/** puts the nodes in, and says where they start */
function insertAt(view: EditorView, nodes: PMNode[], placement: Placement): { tr: Transaction; from: number } {
	const { state } = view;
	const { selection } = state;
	if (placement === 'selection') return { tr: state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)), from: selection.from };
	const $at = state.doc.resolve(selection.to);
	if (placement === 'after-paragraph' && $at.parent.isTextblock) {
		// an empty paragraph is taken over; one with words keeps them and gets the block after it
		const empty = $at.parent.content.size === 0;
		const from = empty ? $at.before() : $at.after();
		return { tr: state.tr.replaceRangeWith(from, empty ? $at.after() : from, nodes[0]), from };
	}
	const tr = state.tr.setSelection(TextSelection.near($at));
	if (nodes.length === 1 && nodes[0].isBlock) tr.replaceSelectionWith(nodes[0]);
	else tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0));
	return { tr, from: selection.to };
}

function openPanelOfSelected(view: EditorView): void {
	function open(): void {
		requestAnimationFrame(() => {
			const { selection } = view.state;
			if (selection instanceof NodeSelection) drawnChipOf(selection.node)?.openPanel();
		});
	}
	// an in-app menu hands focus back to its trigger a tick after our item ran, and a panel opened before
	// that loses the focus it just took and closes; the next focus change is that hand-back
	if (document.querySelector('[data-scope="menu"][data-part="content"][data-state="open"]'))
		document.addEventListener('focusin', open, { capture: true, once: true });
	else open();
}

export function insertChips(sources: string[], shape: ChipShape, holdsSelection = false): void {
	const view = editorViewStore.current;
	if (!view) return;
	const { schema, selection } = view.state;
	const at = holdsSelection ? selection.from : selection.to;
	const type = shape === 'block' ? schema.nodes.raw_latex : schema.nodes.inline_latex;
	const chips = sources.map((source) => type.create(null, schema.text(source)));
	const chip = chips[chips.length - 1];
	const $at = view.state.doc.resolve(at);
	const onEmptyLine = $at.parent.isTextblock && $at.parent.content.size === 0;
	const end = holdsSelection ? selection.to : at;
	const after = view.state.doc.textBetween(end, Math.min(end + 1, view.state.doc.resolve(end).end()));
	let nodes: PMNode[] = chips;
	if (shape === 'line' && !onEmptyLine) nodes = [schema.nodes.paragraph.create(null, chips)];
	// a command name must not run into the letter after it (\quad beta, never \quadbeta); TeX drops the space
	else if (shape === 'inline' && /[a-zA-Z]$/.test(sources[sources.length - 1]) && /^[a-zA-Z]/.test(after))
		nodes = [...chips, schema.text(' ')];
	const placement: Placement = holdsSelection ? 'selection' : shape === 'block' ? 'after-paragraph' : 'caret';
	const { tr, from } = insertAt(view, nodes, placement);
	const found = positionOf(
		tr,
		chip,
		from,
		nodes.reduce((size, node) => size + node.nodeSize, 0)
	);
	if (found !== null) tr.setSelection(NodeSelection.create(tr.doc, found));
	view.dispatch(tr.scrollIntoView());
	view.focus();
	openPanelOfSelected(view);
}

export function insertOne(node: PMNode, caretInside = false): void {
	const view = editorViewStore.current;
	if (!view) return;
	const { tr, from } = insertAt(view, [node], node.isBlock ? 'after-paragraph' : 'caret');
	const found = positionOf(tr, node, from, node.nodeSize);
	if (found !== null && caretInside) tr.setSelection(TextSelection.near(tr.doc.resolve(found + 1)));
	view.dispatch(tr.scrollIntoView());
	view.focus();
}

/** a Format menu value `style:<name>` as the text either side of the words it styles */
function styleOf(value: string): readonly [string, string] | null {
	const name = value.startsWith('style:') ? value.slice(6) : '';
	return name in MENU_TEXT_STYLES ? MENU_TEXT_STYLES[name as keyof typeof MENU_TEXT_STYLES] : null;
}

/** a block of source after the line the caret is on, as the visual editor puts one after its paragraph */
export function cmAfterLine(cm: CMView, text: string, caret = text.length): void {
	const line = cm.state.doc.lineAt(cm.state.selection.main.to);
	const lead = line.text.trim() ? '\n' : '';
	const at = line.text.trim() ? line.to : line.from;
	cmApply(cm, {
		changes: { from: at, to: line.text.trim() ? at : line.to, insert: lead + text },
		selection: { anchor: at + lead.length + caret }
	});
}

/** a command that stands on a line of its own in the source, the caret `caret` characters into it */
export function cmOnOwnLine(cm: CMView, text: string, caret = text.length): void {
	const { state } = cm;
	const { from, to } = state.selection.main;
	const before = /\S/.test(state.sliceDoc(state.doc.lineAt(from).from, from)) ? '\n' : '';
	const after = /\S/.test(state.sliceDoc(to, state.doc.lineAt(to).to)) ? '\n' : '';
	cmApply(cm, { changes: { from, to, insert: before + text + after }, selection: { anchor: from + before.length + caret } });
}

/** the Insert menu's items above, in either mode; false for any other item */
export function makeDrawnInserts(deps: DrawnInsertDeps): (value: string) => Promise<boolean> {
	async function askLabel(): Promise<string | null> {
		const name = sanitizeLabel((await deps.askText(m.menubar_prompt_label_name(), '')) ?? '');
		return name || null;
	}

	async function askInclude(dialect: 'tex' | 'typ'): Promise<string | null> {
		const path = (await deps.askText(m.menubar_prompt_include_file(), '', includeCandidates(dialect)))?.trim();
		return path || null;
	}

	async function inSource(cm: CMView, value: string, dialect: Dialect): Promise<void> {
		const style = styleOf(value);
		if (style) return cmReplace(cm, style[0], style[1]);
		if (dialect === 'typ') {
			if (value === 'comment') cmAfterLine(cm, '// ');
			else if (value === 'include') {
				const path = await askInclude('typ');
				if (path) cmAfterLine(cm, `#include "${path}"`);
			}
			return;
		}
		switch (value) {
			case 'crossref':
				return cmReplace(cm, crossRefSource().slice(0, -1), '}');
			case 'hyperref': {
				// the selected words become the link's text, the caret goes where the label is written
				const { from, to } = cm.state.selection.main;
				const text = cm.state.sliceDoc(from, to);
				return cmApply(cm, { changes: { from, to, insert: `\\hyperref[]{${text}}` }, selection: { anchor: from + '\\hyperref['.length } });
			}
			case 'footnote':
				return cmReplace(cm, '\\footnote{', '}');
			case 'label': {
				const name = await askLabel();
				if (name) cmReplace(cm, `\\label{${name}}`);
				return;
			}
			case 'pagebreak':
				return cmOnOwnLine(cm, '\\newpage');
			case 'vspace':
				return cmOnOwnLine(cm, '\\medskip');
			case 'hspace':
				// a space after it, or \quad runs into the next word
				return cmReplace(cm, '\\quad ');
			case 'abstract':
				return cmAfterLine(cm, '\\begin{abstract}\n\n\\end{abstract}', '\\begin{abstract}\n'.length);
			case 'appendix':
				return cmOnOwnLine(cm, '\\appendix');
			case 'bibliography':
				return cmOnOwnLine(cm, bibliographySources().join('\n'));
			case 'include': {
				const path = await askInclude('tex');
				if (path) cmAfterLine(cm, `\\input{${path}}`);
				return;
			}
			case 'comment':
				return cmAfterLine(cm, '% ');
		}
	}

	async function inVisual(value: string, dialect: Dialect): Promise<void> {
		const view = editorViewStore.current;
		if (!view) return;
		const { schema } = view.state;
		const style = styleOf(value);
		if (style) {
			const words = selectedLatex(view);
			return insertChips([style[0] + (words ?? '') + style[1]], 'inline', words !== null);
		}
		if (dialect === 'typ') {
			if (value === 'comment') insertChips(['// '], 'block');
			else if (value === 'include') {
				const path = await askInclude('typ');
				if (path) insertOne(schema.nodes.includedoc.create({ path, command: 'typst' }));
			}
			return;
		}
		switch (value) {
			case 'crossref':
				return insertChips([crossRefSource()], 'inline');
			case 'hyperref': {
				const words = selectedLatex(view);
				return insertChips([`\\hyperref[]{${words ?? ''}}`], 'inline', words !== null);
			}
			case 'footnote':
				return insertChips(['\\footnote{}'], 'inline');
			case 'label': {
				const name = await askLabel();
				if (name) insertOne(schema.nodes.label.create({ name }));
				return;
			}
			case 'pagebreak':
				return insertChips(['\\newpage'], 'line');
			case 'vspace':
				return insertChips(['\\medskip'], 'line');
			case 'hspace':
				return insertChips(['\\quad'], 'inline');
			case 'abstract':
				return insertOne(schema.nodes.abstract.create({ sourceForm: 'env' }, schema.nodes.paragraph.create()), true);
			case 'appendix':
				return insertChips(['\\appendix'], 'line');
			case 'bibliography':
				return insertChips(bibliographySources(), 'line');
			case 'include': {
				const path = await askInclude('tex');
				if (path) insertOne(schema.nodes.includedoc.create({ path, command: 'input' }));
				return;
			}
			case 'comment':
				return insertChips(['% '], 'block');
		}
	}

	return async (value) => {
		const ours = (DRAWN_INSERT_ITEMS as readonly string[]).includes(value) || styleOf(value) !== null;
		if (!ours) return false;
		const dialect = deps.dialect();
		if (dialect === 'md' || (dialect === 'typ' && value !== 'include' && value !== 'comment')) return true;
		const cm = activeCm();
		if (cm) await inSource(cm, value, dialect);
		else await inVisual(value, dialect);
		return true;
	};
}
