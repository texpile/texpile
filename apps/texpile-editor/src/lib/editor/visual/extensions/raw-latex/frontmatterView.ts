import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { NodeSelection } from 'prosemirror-state';
import { parseLatex } from '$lib/languages/latex/parser/parser';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';

// frontmatter detection goes through the unified-latex AST, never regex. title/author/date are
// parsed with NO args so their {…} stays a group whose position gives the exact brace offsets,
// letting an edit splice back in verbatim without re-printing anything else.
const FM_KINDS = ['title', 'author', 'date'];
const FM_PARSE_OPTS = {
	documentMacros: { title: { signature: '' }, author: { signature: '' }, date: { signature: '' } }
};

type FmHit = { kind: string; inner: string; innerStart: number; innerEnd: number };

// plain text only: anything with nested macros/groups/math keeps the raw editor instead
function isPlainGroup(group: { content?: { type: string }[] }): boolean {
	return Array.isArray(group.content) && group.content.every((c) => c.type === 'string' || c.type === 'whitespace');
}

// every top-level \title/\author/\date followed (modulo whitespace) by a plain-text {…}.
// commented-out calls are comment nodes, never macros, so they're excluded for free.
function findFrontmatter(source: string): FmHit[] {
	const nodes = parseLatex(source, FM_PARSE_OPTS).content;
	const out: FmHit[] = [];
	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i];
		if (n.type !== 'macro' || !FM_KINDS.includes(n.content)) continue;
		let j = i + 1;
		while (nodes[j]?.type === 'whitespace') j++;
		const g = nodes[j];
		if (!g || g.type !== 'group' || !g.position || !isPlainGroup(g)) continue;
		out.push({
			kind: n.content,
			inner: printRaw(g.content),
			innerStart: g.position.start.offset + 1, // just after the '{'
			innerEnd: g.position.end.offset - 1 // just before the '}'
		});
	}
	return out;
}

// non-null only when the WHOLE block is exactly one simple frontmatter macro. startsWith is a
// cheap prefilter so we don't parse every raw block; the AST decides.
export function simpleFrontmatter(text: string): { kind: string; inner: string } | null {
	const t = text.trimStart();
	if (!FM_KINDS.some((k) => t.startsWith('\\' + k))) return null;
	const nodes = parseLatex(text, FM_PARSE_OPTS).content.filter((n) => n.type !== 'whitespace' && n.type !== 'parbreak');
	if (nodes.length !== 2) return null;
	const [m, g] = nodes;
	if (m.type !== 'macro' || !FM_KINDS.includes(m.content) || g.type !== 'group' || !isPlainGroup(g)) return null;
	return { kind: m.content, inner: printRaw(g.content) };
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
	const nodes = parseLatex(text, FM_PARSE_OPTS).content.filter((n) => n.type !== 'whitespace' && n.type !== 'parbreak');
	if (nodes.length !== 1 || nodes[0].type !== 'macro') return null;
	const name: string = nodes[0].content;
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
