// a call wrapping content, standing alone (`#theorem[...]`, `#align(center)[...]`): the typst
// counterpart of a LaTeX environment. The body holds full markup, so this module and the markup
// walker in converter.ts are mutually recursive; ESM live bindings make the circular import safe.
import type { SyntaxNode } from '@lezer/common';
import { buildNode, type PmNode } from './builders';
import { hasSyntaxError } from '$lib/languages/typst/knowledge/scan/syntax';
import { children, childOf } from './reading/syntaxUtils';
import { calleeName, positionalParam, wrapsContent } from './reading/callLevel';
import { codeBodyNode } from './calls/codeBody';
import { setsOnlyStyle } from './calls/styleRules';
import { convertMarkup, ensureBlocks, notedBlocks, type Seg } from './converter';
import { aloneWithLabel, lineIndent } from './reading/blockEnds';
import { noteBlockSpan } from '$lib/editor/visual/sourceSpans';

export type BodyArg = { sep: string; tail: string };

type EnvCallParts = { name: string; args: string | null; body: SyntaxNode; bodyArg: BodyArg | null };

const GAPS = new Set(['Space', 'Comma', 'LineComment', 'BlockComment']);
const CODE_BODIES = new Set(['FuncCall', 'Ident', 'FieldAccess', 'Raw', 'Str', 'Equation']);

function isBrackets(body: SyntaxNode | undefined): body is SyntaxNode {
	return body?.name === 'ContentBlock' && body.firstChild?.name === 'LeftBracket' && body.lastChild?.name === 'RightBracket';
}

function bodyInParens(call: SyntaxNode, name: string, kids: SyntaxNode[], src: string): EnvCallParts | null {
	const open = kids[0];
	const close = kids[kids.length - 1];
	if (open?.name !== 'LeftParen' || close?.name !== 'RightParen' || open === close) return null;
	const items = kids.slice(1, -1).filter((k) => !GAPS.has(k.name));
	const body = items[items.length - 1];
	if (!body || body.name === 'Named' || body.name === 'Spread') return null;
	const before = items.slice(0, -1);
	if (before.some(hasSyntaxError)) return null;
	const index = before.filter((k) => k.name !== 'Named').length;
	if (!positionalParam(call, src, index)?.content) return null;
	if (body.name === 'ContentBlock' ? !isBrackets(body) : !CODE_BODIES.has(body.name)) return null;
	const last = before[before.length - 1];
	const args = last ? src.slice(open.to, last.to) : null;
	const bodyArg = { sep: src.slice(last ? last.to : open.to, body.from), tail: src.slice(body.to, close.from) };
	return { name, args, body, bodyArg };
}

/** the name, the bytes between the parentheses (null without them) and the one content block
 *  after them, or the body given as the last argument */
function envCallParts(call: SyntaxNode, src: string): EnvCallParts | null {
	if (call.name !== 'FuncCall') return null;
	const callee = call.firstChild;
	const args = callee?.nextSibling;
	if (!callee || !args || args.name !== 'Args' || args.nextSibling) return null;
	const name = calleeName(callee, src);
	if (!name || !wrapsContent(call, src)) return null;
	const kids = children(args);
	const body = kids[kids.length - 1];
	if (!isBrackets(body)) return bodyInParens(call, name, kids, src);
	const head = kids.slice(0, -1);
	// one trailing block: `#grid(..)[a][b]` holds two bodies, which one box cannot show
	if (head.length === 0) return { name, args: null, body, bodyArg: null };
	const open = head[0];
	const close = head[head.length - 1];
	if (open.name !== 'LeftParen' || close.name !== 'RightParen' || head.some(hasSyntaxError)) return null;
	return { name, args: src.slice(open.to, close.from), body, bodyArg: null };
}

function styledBlockParts(block: SyntaxNode, src: string): EnvCallParts | null {
	return isBrackets(block) && setsOnlyStyle(block, src) ? { name: '', args: null, body: block, bodyArg: null } : null;
}

export function contentBody(body: SyntaxNode, src: string): { blocks: PmNode[]; bodyLead: string; bodyTrail: string } | null {
	const open = body.firstChild!;
	const close = body.lastChild!;
	const markup = childOf(body, 'Markup');
	const segs = markup ? convertMarkup(children(markup), src) : [];
	const from = segs.length > 0 ? segs[0].from : close.from;
	const to = segs.length > 0 ? segs[segs.length - 1].to : close.from;
	const bodyLead = src.slice(open.to, from);
	const bodyTrail = src.slice(to, close.from);
	if (/\S/.test(bodyLead + bodyTrail)) return null;
	const noted = notedBlocks(segs);
	const blocks = ensureBlocks(noted);
	// an empty body's paragraph has no bytes; it stands where they would go, so typing into it splices
	if (noted.length === 0) noteBlockSpan(blocks[0], { srcFrom: close.from, srcTo: close.from, size: 1 });
	return { blocks, bodyLead, bodyTrail };
}

type EnvBody = { blocks: PmNode[]; bodyLead: string | null; bodyTrail: string | null; code: boolean };

function envBody(body: SyntaxNode, src: string): EnvBody | null {
	if (body.name !== 'ContentBlock') return { blocks: [codeBodyNode(body, src)], bodyLead: null, bodyTrail: null, code: true };
	const content = contentBody(body, src);
	return content ? { ...content, code: false } : null;
}

export function envNode(call: SyntaxNode, src: string, at: SyntaxNode, labelNode: SyntaxNode | null): PmNode | null {
	const parts = call.name === 'ContentBlock' ? styledBlockParts(call, src) : envCallParts(call, src);
	const content = parts ? envBody(parts.body, src) : null;
	if (!parts || !content) return null;
	const label = labelNode ? src.slice(labelNode.from + 1, labelNode.to - 1) : null;
	// the whole gap before the label, spaces too: a header edit leaves it as it was
	const labelGap = labelNode ? src.slice(call.to, labelNode.from) : null;
	const typIndent = lineIndent(at, at.from, src) || null;
	const { blocks, bodyLead, bodyTrail, code } = content;
	const attrs = { name: parts.name, args: parts.args, label, labelGap, bodyLead, bodyTrail, typIndent, typBodyArg: parts.bodyArg, code };
	return buildNode('typ_env', attrs, blocks);
}

export function envSeg(kids: SyntaxNode[], i: number, src: string): { seg: Seg; next: number } | null {
	const hash = kids[i];
	const call = kids[i + 1];
	const alone = call ? aloneWithLabel(kids, i + 2, src) : null;
	const node = alone ? envNode(call, src, hash, alone.label) : null;
	if (!alone || !node) return null;
	return { seg: { blocks: [node], from: hash.from, to: (alone.label ?? call).to }, next: alone.next };
}
