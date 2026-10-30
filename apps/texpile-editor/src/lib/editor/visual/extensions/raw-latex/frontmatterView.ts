import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';
import type { SyntaxNode } from '@lezer/common';
import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { BASE_PACKAGE_TABLE } from '$lib/languages/latex/parser/signatures/packageTable';
import { sourceUnitsIn } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf } from '$lib/languages/latex/parser/tree/walk/stretch';

const FM_KINDS = ['title', 'author', 'date'];

type FmHit = { kind: string; inner: string; innerStart: number; innerEnd: number };

function topLevel(source: string): SyntaxNode[] {
	const out: SyntaxNode[] = [];
	for (let c = latexTreeOf(source).topNode.firstChild; c; c = c.nextSibling) out.push(c);
	return out;
}

function isSpace(source: string, n: SyntaxNode): boolean {
	return n.name === 'Text' && source.slice(n.from, n.to).trim() === '';
}

function commandName(source: string, n: SyntaxNode): string | null {
	return n.name === 'ControlWord' ? source.slice(n.from + 1, n.to) : null;
}

// plain text only: anything with nested macros/groups/math keeps the raw editor instead
function isPlainGroup(g: SyntaxNode): boolean {
	const close = g.lastChild;
	if (g.name !== 'Group' || close?.name !== '}') return false;
	for (let c = g.firstChild!.nextSibling; c && c.from < close.from; c = c.nextSibling)
		if (c.name !== 'Text' && c.name !== 'OpenBracket' && c.name !== 'CloseBracket') return false;
	return true;
}

function innerOf(source: string, g: SyntaxNode): string {
	return source.slice(g.from + 1, g.to - 1).replace(/\s+/g, ' ');
}

// every top-level \title/\author/\date followed (modulo whitespace) by a plain-text {…}.
function findFrontmatter(source: string): FmHit[] {
	const nodes = topLevel(source);
	const out: FmHit[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const kind = commandName(source, nodes[i]);
		if (!kind || !FM_KINDS.includes(kind)) continue;
		let j = i + 1;
		while (nodes[j] && isSpace(source, nodes[j])) j++;
		const g = nodes[j];
		if (!g || !isPlainGroup(g)) continue;
		out.push({ kind, inner: innerOf(source, g), innerStart: g.from + 1, innerEnd: g.to - 1 });
	}
	return out;
}

function meaningful(text: string): SyntaxNode[] {
	return topLevel(text).filter((n) => !isSpace(text, n) && n.name !== 'ParBreak');
}

// non-null only when the WHOLE block is exactly one simple frontmatter macro. startsWith is a
export function simpleFrontmatter(text: string): { kind: string; inner: string } | null {
	const t = text.trimStart();
	if (!FM_KINDS.some((k) => t.startsWith('\\' + k))) return null;
	const nodes = meaningful(text);
	if (nodes.length !== 2) return null;
	const kind = commandName(text, nodes[0]);
	if (!kind || !FM_KINDS.includes(kind) || !isPlainGroup(nodes[1])) return null;
	return { kind, inner: innerOf(text, nodes[1]) };
}

// the visual editor only renders the body, so \title/\author/\date living in the preamble are
// surfaced as duplicate inline fields with edits redirected back into the preamble.

/** first non-commented \title/\author/\date in the preamble, one per kind, in document order. */
export function extractPreambleFrontmatter(preamble: string): Array<{ kind: string; inner: string }> {
	const seen = new Set<string>();
	const out: Array<{ kind: string; inner: string }> = [];
	for (const h of findFrontmatter(preamble)) {
		if (seen.has(h.kind)) continue;
		seen.add(h.kind);
		out.push({ kind: h.kind, inner: h.inner });
	}
	return out;
}

/** replaces only the brace interior of the first \<kind>{…}, everything else stays byte-for-byte. no-op if not found. */
export function replacePreambleFrontmatter(preamble: string, kind: string, inner: string): string {
	const hit = findFrontmatter(preamble).find((h) => h.kind === kind);
	if (!hit) return preamble;
	return preamble.slice(0, hit.innerStart) + inner + preamble.slice(hit.innerEnd);
}

// structural commands that produce output but have nothing to edit (\maketitle, \printbibliography, ...):
// rendered as a subtle selectable placeholder; the node keeps its content so it round-trips verbatim.
const PLACEHOLDER_COMMANDS: Record<string, string> = {
	// sits right under the editable title and author fields, where a bare "Title" read as an
	// empty field of its own
	maketitle: 'Title block',
	tableofcontents: 'Contents',
	listoffigures: 'List of figures',
	listoftables: 'List of tables',
	printindex: 'Index',
	printbibliography: 'Bibliography'
};

export function placeholderCommand(text: string): { command: string; label: string } | null {
	const t = text.trimStart();
	if (!Object.keys(PLACEHOLDER_COMMANDS).some((n) => t.startsWith('\\' + n))) return null; // cheap prefilter
	const units = sourceUnitsIn(text, bodyOf(latexTreeOf(text).topNode), (n) => BASE_PACKAGE_TABLE.macros[n]).filter(
		(u) => u.piece.kind !== 'space' && !(u.piece.kind === 'node' && u.piece.node.name === 'ParBreak')
	);
	const name = units.length === 1 ? units[0].call?.name : null;
	if (!name) return null;
	return name in PLACEHOLDER_COMMANDS ? { command: name, label: PLACEHOLDER_COMMANDS[name] } : null;
}

export class PlaceholderRawView implements NodeView {
	dom: HTMLElement;
	private node: Node;
	private view: EditorView;
	private getPos: () => number;

	constructor(node: Node, view: EditorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;

		const el = document.createElement('div');
		el.className = 'latex-placeholder';
		el.setAttribute('contenteditable', 'false');
		el.title = node.textContent.trim(); // hover shows the underlying command
		el.textContent = placeholderCommand(node.textContent)?.label ?? '';
		// click selects the whole node (so backspace can delete it) rather than editing
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
		return true;
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

export class FrontmatterRawView implements NodeView {
	dom: HTMLElement;
	private input: HTMLInputElement;
	private node: Node;
	private view: EditorView;
	private getPos: () => number;
	private kind: string;

	constructor(node: Node, view: EditorView, getPos: () => number) {
		this.node = node;
		this.view = view;
		this.getPos = getPos;
		const fm = simpleFrontmatter(node.textContent)!;
		this.kind = fm.kind;

		const wrapper = document.createElement('div');
		wrapper.className = `frontmatter-block frontmatter-${fm.kind}`;
		wrapper.setAttribute('contenteditable', 'false');

		if (fm.kind !== 'title') {
			const label = document.createElement('span');
			label.className = 'frontmatter-label';
			label.textContent = fm.kind;
			wrapper.appendChild(label);
		}

		const input = document.createElement('input');
		input.className = 'frontmatter-input';
		input.value = fm.inner;
		input.placeholder = fm.kind === 'title' ? 'Document title' : fm.kind;
		input.spellcheck = false;
		input.addEventListener('input', () => this.commit(input.value));
		wrapper.appendChild(input);

		this.input = input;
		this.dom = wrapper;
	}

	// rewrites the block's text to \kind{value}; round-trips verbatim through the serializer
	private commit(value: string) {
		const pos = this.getPos();
		if (pos == null) return;
		const from = pos + 1;
		const to = pos + this.node.nodeSize - 1;
		const text = `\\${this.kind}{${value}}`;
		this.view.dispatch(this.view.state.tr.replaceWith(from, to, this.view.state.schema.text(text)));
	}

	update(node: Node): boolean {
		const fm = simpleFrontmatter(node.textContent);
		// no longer a simple frontmatter macro: let ProseMirror recreate the view as raw CodeMirror
		if (!fm || fm.kind !== this.kind) return false;
		this.node = node;
		if (document.activeElement !== this.input && this.input.value !== fm.inner) this.input.value = fm.inner;
		return true;
	}

	// ProseMirror moved the selection into this node (e.g. arrow keys): put focus in the field
	setSelection() {
		this.input.focus();
	}

	stopEvent(event: Event): boolean {
		return event.target === this.input;
	}

	ignoreMutation(): boolean {
		return true; // the node view owns its DOM
	}
}
