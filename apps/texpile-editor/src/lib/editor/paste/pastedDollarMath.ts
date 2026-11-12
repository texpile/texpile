// Math a chat app left as text in its page becomes math: `$x$`, `\(x\)`, `$$x$$` lines and `\[x\]`.
// A chat app that does not typeset math draws the underscore pairs inside a formula as emphasis, so an
// emphasis that starts or ends inside a formula goes back to its two underscores first.
import { closesInOneLine } from '$lib/languages/markdown/syntax/mathSyntax';

const OPAQUE = 'code, pre, kbd, samp, script, style, img, .inline-math, .block-math';
const INLINE = /^(A|ABBR|B|BDI|BDO|CITE|DEL|EM|FONT|I|INS|MARK|S|SMALL|SPAN|STRIKE|STRONG|SUB|SUP|U)$/;
const OBJECT = '￼';
// Pandoc's rule: no space inside either dollar, and none followed by a digit, so "$5 and $10" stays prices
const INLINE_MATH = /(?<![\\$])\$(?![\s$])((?:\\.|[^$\\\n￼])+?)(?<![\s\\])\$(?![\d$])|\\\(([^\n￼]+?)\\\)/g;
const DISPLAY_DELIMITERS = [
	['$$', '$$'],
	['\\[', '\\]']
];

type Formula = { start: number; end: number; display: boolean; content: string };
type EmphasisSpan = { el: Element; open: number; close: number };
// `nodes[i]` is the text node (with `offsets[i]` its offset) or the `<br>` that wrote char i
type FlatText = { text: string; nodes: (Node | null)[]; offsets: number[]; emphasis: EmphasisSpan[] };

function flatten(root: ParentNode): FlatText {
	const flat: FlatText = { text: '', nodes: [], offsets: [], emphasis: [] };
	function push(char: string, node: Node | null, offset: number): void {
		flat.text += char;
		flat.nodes.push(node);
		flat.offsets.push(offset);
	}
	function walk(parent: ParentNode): void {
		for (const child of parent.childNodes) {
			if (child.nodeType === 3) {
				const value = child.textContent ?? '';
				for (let i = 0; i < value.length; i++) push(value[i] === '\n' ? ' ' : value[i], child, i);
			} else if (child.nodeType === 1) {
				const el = child as Element;
				if (el.matches(OPAQUE)) push(OBJECT, null, 0);
				else if (el.nodeName === 'BR') push('\n', el, 0);
				else if (INLINE.test(el.nodeName)) {
					const open = flat.text.length;
					walk(el);
					if (/^(EM|I)$/.test(el.nodeName)) flat.emphasis.push({ el, open, close: flat.text.length });
				} else {
					push('\n', null, 0);
					push('\n', null, 0);
				}
			}
		}
	}
	walk(root);
	return flat;
}

function displayAt(lines: string[], i: number, lineStart: number): (Formula & { lastLine: number }) | null {
	const lead = lines[i].length - lines[i].trimStart().length;
	const trimmed = lines[i].trim();
	for (const [open, close] of DISPLAY_DELIMITERS) {
		if (!trimmed.startsWith(open)) continue;
		const rest = trimmed.slice(open.length);
		const start = lineStart + lead;
		if (open === '$$' ? closesInOneLine(rest) : trimmed.length > 4 && trimmed.endsWith(close)) {
			return { start, end: start + trimmed.length, display: true, content: rest.slice(0, -close.length).trim(), lastLine: i };
		}
		let end = lineStart;
		for (let j = i; j < lines.length; end += lines[j++].length + 1) {
			if (j > i && !lines[j].trim()) break;
			if (j > i && lines[j].trimEnd().endsWith(close)) {
				const stop = end + lines[j].trimEnd().length;
				return {
					start,
					end: stop,
					display: true,
					content: lines
						.slice(i, j + 1)
						.join('\n')
						.trim()
						.slice(open.length, -close.length)
						.trim(),
					lastLine: j
				};
			}
		}
	}
	return null;
}

function findFormulas(text: string): Formula[] {
	const formulas: Formula[] = [];
	const lines = text.split('\n');
	let lineStart = 0;
	for (let i = 0; i < lines.length; i++) {
		const display = displayAt(lines, i, lineStart);
		if (display && !display.content.includes(OBJECT) && display.content) {
			formulas.push(display);
			for (let j = i; j <= display.lastLine; j++) lineStart += lines[j].length + 1;
			i = display.lastLine;
			continue;
		}
		for (const m of lines[i].matchAll(INLINE_MATH)) {
			const start = lineStart + m.index;
			formulas.push({ start, end: start + m[0].length, display: false, content: m[1] ?? m[2] });
		}
		lineStart += lines[i].length + 1;
	}
	return formulas;
}

// one `_` before and after the emphasis, which is then unwrapped
function restoreUnderscores(flat: FlatText, formulas: Formula[]): boolean {
	function inside(at: number): boolean {
		return formulas.some((f) => at > f.start && at < f.end);
	}
	let changed = false;
	for (const { el, open, close } of flat.emphasis) {
		if (open === close || !(inside(open) || inside(close))) continue;
		const doc = el.ownerDocument;
		el.before(doc.createTextNode('_'));
		el.after(doc.createTextNode('_'));
		el.replaceWith(...el.childNodes);
		changed = true;
	}
	return changed;
}

function setBoundary(range: Range, flat: FlatText, index: number, atStart: boolean): void {
	const node = flat.nodes[index]!;
	if (node.nodeType === 3) {
		if (atStart) range.setStart(node, flat.offsets[index]);
		else range.setEnd(node, flat.offsets[index] + 1);
	} else if (atStart) range.setStartBefore(node);
	else range.setEndAfter(node);
}

function isBlank(el: Element): boolean {
	return !el.textContent!.trim() && !el.querySelector('img, code, .inline-math, .block-math');
}

// the neighbor that is not an empty text node, which a split leaves behind
function solidSibling(from: ChildNode | null, next: boolean): ChildNode | null {
	let node = from;
	while (node?.nodeType === 3 && !node.textContent) node = next ? node.nextSibling : node.previousSibling;
	return node;
}

function dropEdgeBreaks(el: Element): void {
	for (let last = solidSibling(el.lastChild, false); last?.nodeName === 'BR'; last = solidSibling(el.lastChild, false)) last.remove();
	for (let first = solidSibling(el.firstChild, true); first?.nodeName === 'BR'; first = solidSibling(el.firstChild, true)) first.remove();
}

// the block out of any emphasis or link around it, which are split in two beside it
function hoistBlock(block: Element, root: ParentNode): void {
	while (block.parentNode !== root) {
		const parent = block.parentNode as Element;
		const rest = parent.cloneNode(false) as Element;
		while (block.nextSibling) rest.append(block.nextSibling);
		parent.after(block, rest);
		if (isBlank(rest)) rest.remove();
	}
}

function placeBlock(block: Element, root: Element | DocumentFragment): void {
	hoistBlock(block, root);
	for (const side of [solidSibling(block.previousSibling, false), solidSibling(block.nextSibling, true)])
		if (side?.nodeName === 'BR') side.remove();
	if (root.nodeName !== 'P') return;
	const paragraph = root as Element;
	const after = paragraph.ownerDocument.createElement('p');
	while (block.nextSibling) after.append(block.nextSibling);
	paragraph.after(block);
	dropEdgeBreaks(paragraph);
	if (isBlank(paragraph)) paragraph.remove();
	dropEdgeBreaks(after);
	if (!isBlank(after)) block.after(after);
}

function convertFormula(flat: FlatText, formula: Formula, root: Element | DocumentFragment): void {
	const doc = root.ownerDocument;
	const range = doc.createRange();
	setBoundary(range, flat, formula.start, true);
	setBoundary(range, flat, formula.end - 1, false);
	range.deleteContents();
	const math = doc.createElement(formula.display ? 'div' : 'span');
	math.className = formula.display ? 'block-math' : 'inline-math';
	math.textContent = formula.content;
	range.insertNode(math);
	if (formula.display) placeBlock(math, root);
}

function convertRoot(root: Element | DocumentFragment): void {
	if (!/\$|\\[([]/.test(root.textContent ?? '')) return;
	let flat = flatten(root);
	let formulas = findFormulas(flat.text);
	if (restoreUnderscores(flat, formulas)) {
		root.normalize();
		flat = flatten(root);
		formulas = findFormulas(flat.text);
	}
	for (const formula of formulas.reverse()) convertFormula(flat, formula, root);
}

/** `$…$`, `\(…\)`, `$$…$$` and `\[…\]` written as text in the pasted page, as math */
export function convertDollarMath(container: DocumentFragment | Element): void {
	const roots: (Element | DocumentFragment)[] = [container];
	for (const el of container.querySelectorAll('*')) {
		if (!INLINE.test(el.nodeName) && !el.closest(OPAQUE)) roots.push(el);
	}
	for (const root of roots) if (root === container || container.contains(root)) convertRoot(root);
}

// a template keeps a fragment of table cells, which a document body would drop
export function convertDollarMathHtml(html: string): string {
	if (!/\$|\\[([]/.test(html)) return html;
	const template = new DOMParser().parseFromString('', 'text/html').createElement('template');
	template.innerHTML = html;
	convertDollarMath(template.content);
	return template.innerHTML;
}
