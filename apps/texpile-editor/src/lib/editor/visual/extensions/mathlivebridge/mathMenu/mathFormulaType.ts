// Changing what kind of formula an equation is, as LyX's math menu does: inline or displayed, and
// for a LaTeX display the environment that sets its lines.
import { Fragment, type Node, type NodeType } from 'prosemirror-model';
import { NodeSelection, type EditorState, type Transaction } from 'prosemirror-state';
import { generateLabel } from '$lib/editor/visual/label';
import { computeMathAttrs, detectMultilineEnvironment, toggleEnvironmentStar } from '../mathEnvironments';

/** what a LaTeX display can be set as: a plain equation, or an environment of several lines */
export type DisplayKind = 'equation' | 'align' | 'gather' | 'multline';

const PER_LINE_KINDS = ['align', 'gather'];
// the inner environments that keep a display's lines once it is a single equation
const ALIGNED_FROM = new Set(['align', 'alignat', 'flalign', 'eqnarray']);
const INNER_LINES = /^\s*\\begin\{(aligned|gathered|split)\}([\s\S]*)\\end\{\1\}\s*$/;

/** where `\\` breaks the body into lines, ignoring those inside braces and nested environments */
function topLevelLines(body: string): string[] {
	const lines: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '\\') {
			if (body.startsWith('\\begin{', i)) depth++;
			else if (body.startsWith('\\end{', i)) depth--;
			else if (body[i + 1] === '\\' && depth === 0) {
				lines.push(body.slice(start, i));
				start = i + 2;
			}
			i++;
		} else if (ch === '{') depth++;
		else if (ch === '}') depth--;
	}
	lines.push(body.slice(start));
	// a trailing \\ ends the last line, it does not start another
	if (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();
	return lines;
}

/** the kind a LaTeX display is set as, or null for one the menu does not offer (alignat, eqnarray) */
export function displayKind(node: Node): DisplayKind | null {
	const environment = node.attrs.environment as string | null;
	if (!environment) return 'equation';
	return (['align', 'gather', 'multline'] as const).find((kind) => kind === environment) ?? null;
}

/** whether an inline formula can become a display where it stands: a paragraph in a place that holds blocks */
export function canMakeDisplay(state: EditorState, pos: number): boolean {
	const $pos = state.doc.resolve(pos);
	const paragraph = $pos.parent;
	if (paragraph.type.name !== 'paragraph' || $pos.depth < 1) return false;
	const container = $pos.node($pos.depth - 1);
	const index = $pos.index($pos.depth - 1);
	return container.canReplaceWith(index, index + 1, state.schema.nodes.block_math);
}

function trimEdge(fragment: Fragment, side: 'start' | 'end'): Fragment {
	const child = side === 'start' ? fragment.firstChild : fragment.lastChild;
	if (!child?.isText) return fragment;
	const text = side === 'start' ? child.text!.replace(/^\s+/, '') : child.text!.replace(/\s+$/, '');
	const nodes: Node[] = [];
	fragment.forEach((node) => nodes.push(node));
	const at = side === 'start' ? 0 : nodes.length - 1;
	if (text) nodes[at] = child.type.schema.text(text, child.marks);
	else nodes.splice(at, 1);
	return Fragment.from(nodes);
}

function hasContent(fragment: Fragment): boolean {
	let found = false;
	fragment.forEach((node) => {
		if (!node.isText || node.text!.trim()) found = true;
	});
	return found;
}

/** the inline formula at `pos` as a display in the same paragraph, the text around it kept on either side */
export function makeDisplay(state: EditorState, pos: number): Transaction | null {
	if (!canMakeDisplay(state, pos)) return null;
	const inline = state.doc.nodeAt(pos);
	if (inline?.type.name !== 'inline_math') return null;
	const $pos = state.doc.resolve(pos);
	const paragraph = $pos.parent;
	const offset = $pos.parentOffset;
	const before = trimEdge(paragraph.content.cut(0, offset), 'end');
	const after = trimEdge(paragraph.content.cut(offset + inline.nodeSize), 'start');
	const hasBefore = hasContent(before);
	const hasAfter = hasContent(after);
	const { schema } = state;
	const display = schema.nodes.block_math.create(
		// a LaTeX display inside a paragraph stays inside it; Typst has no such thing and starts a new one
		{ inParagraph: hasBefore, continuesAfter: hasAfter },
		schema.text(inline.textContent.trim() || ' ')
	);
	const blocks: Node[] = [];
	if (hasBefore) blocks.push(paragraph.type.create(paragraph.attrs, before));
	blocks.push(display);
	if (hasAfter) blocks.push(paragraph.type.create(null, after));
	const start = $pos.before();
	const tr = state.tr.replaceWith(start, $pos.after(), blocks);
	const at = start + (hasBefore ? blocks[0].nodeSize : 0);
	return tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
}

/** why a display cannot be inline: its lines, or references pointing at its label; null when it can */
export function inlineBlocker(state: EditorState, pos: number): 'lines' | 'referenced' | null {
	const display = state.doc.nodeAt(pos);
	if (!display) return null;
	// markdown reads $$ back with no environment attr, so its text is asked too
	if (display.attrs.environment || detectMultilineEnvironment(display.textContent)) return 'lines';
	if (display.type.spec.mathSyntax === 'typst' && typstLines(display.textContent)) return 'lines';
	const label = display.attrs.label as string | null;
	if (label && referenced(state.doc, label)) return 'referenced';
	return null;
}

function referenced(doc: Node, label: string): boolean {
	let found = false;
	doc.descendants((node) => {
		if (found) return false;
		if (node.type.name === 'typ_ref' && node.attrs.target === label) found = true;
		if (node.type.name === 'ref' && node.textContent === label) found = true;
	});
	return found;
}

/** whether Typst math breaks into lines: a `\` line break or a `&` outside every call and string */
function typstLines(src: string): boolean {
	let depth = 0;
	let inString = false;
	for (let i = 0; i < src.length; i++) {
		const ch = src[i];
		if (inString) {
			if (ch === '\\') i++;
			else if (ch === '"') inString = false;
		} else if (ch === '"') inString = true;
		else if ('([{'.includes(ch)) depth++;
		else if (')]}'.includes(ch)) depth--;
		else if (depth === 0 && ch === '&') return true;
		else if (ch === '\\') {
			if (depth === 0 && (i + 1 === src.length || /\s/.test(src[i + 1]))) return true;
			i++;
		}
	}
	return false;
}

function inlineNode(type: NodeType, text: string): Node {
	return type.create(null, type.schema.text(text.trim() || ' '));
}

/** the display at `pos` as an inline formula: back in the paragraph it was set from, or in one of its own */
export function makeInline(state: EditorState, pos: number): Transaction | null {
	const display = state.doc.nodeAt(pos);
	if (display?.type.name !== 'block_math' || inlineBlocker(state, pos)) return null;
	const { schema } = state;
	const inline = inlineNode(schema.nodes.inline_math, display.textContent);
	const $pos = state.doc.resolve(pos);
	const index = $pos.index();
	const container = $pos.parent;
	const previous = index > 0 ? container.child(index - 1) : null;
	const next = index + 1 < container.childCount ? container.child(index + 1) : null;
	const joinsBefore = display.attrs.inParagraph === true && previous?.type.name === 'paragraph';
	const joinsAfter = display.attrs.continuesAfter === true && next?.type.name === 'paragraph';
	const space = schema.text(' ');
	let content = Fragment.from(inline);
	let from = pos;
	let to = pos + display.nodeSize;
	let attrs: Node['attrs'] | null = null;
	if (joinsBefore) {
		content = previous.content.append(Fragment.from([space, inline]));
		from -= previous.nodeSize;
		attrs = previous.attrs;
	}
	if (joinsAfter) {
		content = content.append(Fragment.from(space)).append(next.content);
		to += next.nodeSize;
	}
	const paragraph = schema.nodes.paragraph.create(attrs, content);
	const tr = state.tr.replaceWith(from, to, paragraph);
	const at = from + 1 + (joinsBefore ? previous.content.size + 1 : 0);
	return tr.setSelection(NodeSelection.create(tr.doc, at)).scrollIntoView();
}

/** the body of a LaTeX display without the environment it is set in */
function displayBody(node: Node): string {
	const source = node.textContent;
	if (!node.attrs.environment) return source;
	return source.replace(/^\s*\\begin\{[^}]*\}(\{[^}]*\})?/, '').replace(/\\end\{[^}]*\}\s*$/, '');
}

/** the LaTeX display at `pos` set as `kind`, its numbering and labels carried over */
export function setDisplayKind(state: EditorState, pos: number, kind: DisplayKind): Transaction | null {
	const display = state.doc.nodeAt(pos);
	if (display?.type.name !== 'block_math' || displayKind(display) === kind) return null;
	const numbered = display.attrs.numbered === true;
	const environment = display.attrs.environment as string | null;
	const lineLabels = (display.attrs.lineLabels as string[]) ?? [];
	const firstLabel = (display.attrs.label as string | null) || lineLabels.find(Boolean) || null;
	let body = displayBody(display);
	let source: string;
	let attrs: Record<string, unknown>;
	if (kind === 'equation') {
		const lines = topLevelLines(body);
		if (lines.length > 1) {
			const inner = environment && ALIGNED_FROM.has(environment) ? 'aligned' : 'gathered';
			body = `\\begin{${inner}}${body}\\end{${inner}}`;
		}
		source = body;
		// numbered, it gets a label to be referenced by, as setDisplayNumbered gives one
		const label = numbered ? (firstLabel ?? generateLabel('equation')) : display.attrs.label;
		attrs = { ...display.attrs, environment: null, lineLabels: [], label };
	} else {
		const inner = INNER_LINES.exec(body);
		if (!environment && inner) body = inner[2];
		const name = numbered ? kind : `${kind}*`;
		source = `\\begin{${name}}${body}\\end{${name}}`;
		const computed = computeMathAttrs(source);
		attrs = { ...display.attrs, ...computed, label: null, lineLabels: [] };
		if (PER_LINE_KINDS.includes(kind)) {
			// a display of one label holds it in `label` alone when this menu set it (a multline read
			// from a file has it in lineLabels too), and the first line takes it
			const kept = lineLabels.length > 0 ? lineLabels : [firstLabel ?? ''];
			attrs.lineLabels = computed.lineLabels.map((fresh, i) => kept[i] || (numbered ? fresh : ''));
		} else attrs.label = numbered ? (firstLabel ?? generateLabel('equation')) : null;
	}
	const tr = state.tr.replaceWith(pos, pos + display.nodeSize, display.type.create(attrs, state.schema.text(source)));
	return tr.setSelection(NodeSelection.create(tr.doc, pos));
}

/** a LaTeX display numbered or not: the star on its environment, and a label for a numbered one to be referenced by */
export function setDisplayNumbered(state: EditorState, pos: number, numbered: boolean): Transaction | null {
	const display = state.doc.nodeAt(pos);
	if (display?.type.name !== 'block_math') return null;
	const environment = display.attrs.environment as string | null;
	const attrs: Record<string, unknown> = { ...display.attrs, numbered };
	const perLine = !!environment && ['align', 'gather', 'alignat', 'eqnarray'].includes(environment);
	if (numbered && !perLine && !display.attrs.label) attrs.label = generateLabel('equation');
	const source = display.textContent;
	const starred = environment ? toggleEnvironmentStar(source, !numbered) : source;
	if (starred === source) return state.tr.setNodeMarkup(pos, undefined, attrs);
	return state.tr.replaceWith(pos, pos + display.nodeSize, display.type.create(attrs, state.schema.text(starred)));
}
