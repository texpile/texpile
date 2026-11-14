import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import { sourceUnitsIn } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf } from '$lib/languages/latex/parser/tree/walk/stretch';
import { tip } from '$lib/components/tooltip.svelte';
import { m } from '$lib/paraglide/messages';

const PLACEHOLDER_COMMANDS: Record<string, () => string> = {
	// sits right under the drawn title and authors, where a bare "Title" read as a field of its own
	maketitle: m.placeholder_title_block,
	tableofcontents: m.drawn_chip_typst_outline_contents,
	listoffigures: m.drawn_chip_typst_outline_figures,
	listoftables: m.drawn_chip_typst_outline_tables,
	printindex: m.placeholder_index,
	printbibliography: m.drawn_chip_bib_title
};

export function placeholderCommand(text: string): { command: string; label: string } | null {
	const t = text.trimStart();
	if (!Object.keys(PLACEHOLDER_COMMANDS).some((n) => t.startsWith('\\' + n))) return null; // cheap prefilter
	// LyX follows a command with {} to keep the space after it
	const units = sourceUnitsIn(text, bodyOf(latexTreeOf(text).topNode), (n) => BASE_PACKAGE_TABLE.macros[n]).filter(
		(u) =>
			u.piece.kind !== 'space' &&
			!(
				u.piece.kind === 'node' &&
				(u.piece.node.name === 'ParBreak' || (u.piece.node.name === 'Group' && text.slice(u.piece.from, u.piece.to) === '{}'))
			)
	);
	const name = units.length === 1 ? units[0].call?.name : null;
	if (!name) return null;
	return name in PLACEHOLDER_COMMANDS ? { command: name, label: PLACEHOLDER_COMMANDS[name]() } : null;
}

export class PlaceholderRawView implements NodeView {
	dom: HTMLElement;
	private node: Node;
	private view: EditorView;
	private getPos: () => number;
	private tipped: ReturnType<typeof tip>;

	constructor(node: Node, view: EditorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;

		const el = document.createElement('div');
		el.className = 'latex-placeholder';
		el.setAttribute('contenteditable', 'false');
		this.tipped = tip(el, node.textContent.trim());
		el.textContent = placeholderCommand(node.textContent)?.label ?? '';
		el.addEventListener('mousedown', (e) => {
			e.preventDefault();
			const pos = this.getPos();
			if (pos != null) this.view.dispatch(this.view.state.tr.setSelection(NodeSelection.create(this.view.state.doc, pos)));
		});
		this.dom = el;
	}

	update(node: Node): boolean {
		if (!placeholderCommand(node.textContent)) return false; // no longer a placeholder, recreate
		this.node = node;
		this.tipped.update(node.textContent.trim());
		return true;
	}

	destroy() {
		this.tipped.destroy();
	}

	selectNode() {
		this.dom.classList.add('latex-placeholder-selected');
	}
	deselectNode() {
		this.dom.classList.remove('latex-placeholder-selected');
	}
	stopEvent() {
		return false;
	}
	ignoreMutation() {
		return true;
	}
}
