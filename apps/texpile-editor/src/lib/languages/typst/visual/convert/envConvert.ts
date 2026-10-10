// a call wrapping content, standing alone (`#theorem[...]`, `#align(center)[...]`): the typst
// counterpart of a LaTeX environment. The body holds full markup, so this module and the markup
// walker in converter.ts are mutually recursive; ESM live bindings make the circular import safe.
import { isCallWrapper } from '../callWrappers';
import type { SyntaxNode } from '@lezer/common';
import { buildNode } from './builders';
import { children, childOf } from './inlineConvert';
import { convertMarkup, ensureBlocks, notedBlocks, type Seg } from './converter';
import { aloneWithLabel } from './segConvert';
import { noteBlockSpan } from '$lib/editor/visual/sourceSpans';

// calls with a node or a chip of their own, and the ones that mark up a run of text rather than
// hold blocks: drawn as a box, `#underline(stroke: red)[x]` would read as something it is not. A
// figure is not here: the image and table ones are taken before this, and `#figure(kind: "thm",
// ..)[..]` is the usual way to number a theorem
const NOT_CONTAINERS = new Set([
	'bibliography',
	'box',
	'cite',
	'emph',
	'enum',
	'footnote',
	'heading',
	'hide',
	'highlight',
	'image',
	'link',
	'list',
	'lower',
	'overline',
	'quote',
	'raw',
	'ref',
	'smallcaps',
	'strike',
	'strong',
	'sub',
	'super',
	'table',
	'terms',
	'text',
	'underline',
	'upper'
]);

/** `name` or `module.name`, written plainly: a callee that is itself a call or an expression is not one */
function calleeName(callee: SyntaxNode, src: string): string | null {
	if (callee.name === 'Ident') return src.slice(callee.from, callee.to);
	if (callee.name !== 'FieldAccess') return null;
	const parts = children(callee);
	if (parts.length !== 3 || parts[1].name !== 'Dot' || parts[2].name !== 'Ident') return null;
	return calleeName(parts[0], src) == null ? null : src.slice(callee.from, callee.to);
}

function hasError(node: SyntaxNode): boolean {
	if (node.name === 'Error') return true;
	for (let c = node.firstChild; c; c = c.nextSibling) if (hasError(c)) return true;
	return false;
}

/** the name, the bytes between the parentheses (null without them) and the one content block
 *  after them, when the call has exactly that shape */
function envCallParts(call: SyntaxNode, src: string): { name: string; args: string | null; body: SyntaxNode } | null {
	if (call.name !== 'FuncCall') return null;
	const callee = call.firstChild;
	const args = callee?.nextSibling;
	if (!callee || !args || args.name !== 'Args' || args.nextSibling) return null;
	const name = calleeName(callee, src);
	// a wrapper from the snippet files is formatted text, alone on its line or not
	if (!name || NOT_CONTAINERS.has(name.slice(name.lastIndexOf('.') + 1)) || isCallWrapper(name)) return null;
	const kids = children(args);
	const body = kids[kids.length - 1];
	if (!body || body.name !== 'ContentBlock' || body.firstChild?.name !== 'LeftBracket' || body.lastChild?.name !== 'RightBracket')
		return null;
	const head = kids.slice(0, -1);
	// one trailing block: `#grid(..)[a][b]` holds two bodies, which one box cannot show
	if (head.length === 0) return { name, args: null, body };
	const open = head[0];
	const close = head[head.length - 1];
	if (open.name !== 'LeftParen' || close.name !== 'RightParen' || head.some(hasError)) return null;
	return { name, args: src.slice(open.to, close.from), body };
}

/** what the lines after `at` are indented by: a list marker counts as its width, a term as two spaces whatever its title */
function lineIndent(node: SyntaxNode, at: number, src: string): string {
	const lineStart = src.lastIndexOf('\n', at - 1) + 1;
	for (let p = node.parent; p; p = p.parent) {
		const description = p.name === 'TermItem' && p.from >= lineStart ? p.lastChild : null;
		if (description && description.from <= at)
			return lineIndent(p, p.from, src) + '  ' + src.slice(description.from, at).replace(/\S/g, ' ');
	}
	return src.slice(lineStart, at).replace(/\S/g, ' ');
}

/** a lone container call with its optional trailing `<label>` becomes a typ_env holding its body */
export function envSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const parts = call ? envCallParts(call, src) : null;
	if (!parts) return null;
	const alone = aloneWithLabel(kids, i + 2);
	if (!alone) return null;
	const open = parts.body.firstChild!;
	const close = parts.body.lastChild!;
	const markup = childOf(parts.body, 'Markup');
	const segs = markup ? convertMarkup(children(markup), src) : [];
	const from = segs.length > 0 ? segs[0].from : close.from;
	const to = segs.length > 0 ? segs[segs.length - 1].to : close.from;
	const bodyLead = src.slice(open.to, from);
	const bodyTrail = src.slice(to, close.from);
	if (/\S/.test(bodyLead + bodyTrail)) return null;
	const blocks = notedBlocks(segs);
	const body = ensureBlocks(blocks);
	// an empty body's paragraph has no bytes; it stands where they would go, so typing into it splices
	if (blocks.length === 0) noteBlockSpan(body[0], { srcFrom: close.from, srcTo: close.from, size: 1 });
	const label = alone.label ? src.slice(alone.label.from + 1, alone.label.to - 1) : null;
	// the whole gap before the label, spaces too: a header edit leaves it as it was
	const labelGap = alone.label ? src.slice(call.to, alone.label.from) : null;
	const typIndent = lineIndent(hash, hash.from, src) || null;
	const node = buildNode('typ_env', { name: parts.name, args: parts.args, label, labelGap, bodyLead, bodyTrail, typIndent }, body);
	return { seg: { blocks: [node], from: hash.from, to: (alone.label ?? call).to }, next: alone.next };
}
