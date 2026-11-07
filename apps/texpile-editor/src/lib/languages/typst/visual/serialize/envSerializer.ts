// how a typ_env is written: the call as the file had it, then the body inside the brackets set
// off the way the file set it off. A body whose blocks are all still the parse's own is written
// as its bytes, so renaming a theorem or changing its arguments does not rewrite the proof inside
import type { Node } from 'prosemirror-model';
import { blockOriginOf } from '$lib/editor/visual/parseOrigins';
import { codeHolderBody } from './elements/codeBodySource';

// an editor-made container opens its body on a line of its own, indented like a quote's
const DEFAULT_LEAD = '\n  ';
const DEFAULT_TRAIL = '\n';

export type EnvBodyRender = {
	/** one child, written as its block handler writes it, trailing line ends trimmed */
	child: (node: Node, parent: Node, index: number) => string;
	/** what separates two children written one after the other */
	gap: (prev: Node, next: Node) => string;
};

/** whether `text` ends on something that owns its line end: a line comment would swallow a bracket
 *  after it, and a line break is a backslash with whitespace after it (a url's slashes follow a
 *  colon, an escaped pair a backslash) */
export function ownsLineEnd(text: string): boolean {
	return /(^|[^:\\])\/\/[^\n]*$/.test(text) || /(^|[^\\])(\\\\)*\\$/.test(text);
}

export function indentAfterFirstLine(text: string, indent: string): string {
	if (!indent) return text;
	return text
		.split('\n')
		.map((l, i) => (i === 0 || l === '' ? l : indent + l))
		.join('\n');
}

export function dedentAfterFirstLine(text: string, indent: string): string {
	if (!indent) return text;
	return text
		.split('\n')
		.map((l, i) => (i > 0 && l.startsWith(indent) ? l.slice(indent.length) : l))
		.join('\n');
}

/** the call's opening, `#name(args)`, without the body */
export function envHead(node: Node): string {
	const args = typeof node.attrs.args === 'string' ? `(${node.attrs.args})` : '';
	return `#${String(node.attrs.name ?? 'block')}${args}`;
}

/**
 * The body's bytes as the file had them, when every block in it is still the one the parse made
 * there, in the parse's order. Only then: blocks moved in from another container carry that
 * container's indentation, and one of them among fresh blocks would nest wrongly
 */
function fileBody(node: Node): string | null {
	const record = node.childCount > 0 ? blockOriginOf(node.child(0))?.parse : undefined;
	if (!record || !record.verbatim || record.origins.length !== node.childCount) return null;
	let out = '';
	for (let i = 0; i < node.childCount; i++) {
		const origin = blockOriginOf(node.child(i));
		if (!origin || origin !== record.origins[i] || origin.text === undefined) return null;
		// the blocks of one construct (a list, one node per item) share its bytes
		if (origin.member > 0) continue;
		if (i > 0 && origin.pre == null) return null;
		out += (i > 0 ? origin.pre : '') + origin.text;
	}
	return out;
}

function renderedBody(node: Node, render: EnvBodyRender, indent: string): string {
	let out = '';
	let prev: Node | null = null;
	node.forEach((child, _offset, i) => {
		const text = render.child(child, node, i);
		if (!text) return;
		if (prev) out += render.gap(prev, child) + indent;
		out += indentAfterFirstLine(text, indent);
		prev = child;
	});
	return out;
}

/** the whitespace the file set the label off with, a space for a label it did not have */
export function envLabel(node: Node, fileIndent: string): string {
	if (!node.attrs.label) return '';
	const gap = typeof node.attrs.labelGap === 'string' && /^\s*$/.test(node.attrs.labelGap) ? node.attrs.labelGap : ' ';
	return `${dedentAfterFirstLine(gap, fileIndent)}<${String(node.attrs.label)}>`;
}

/**
 * A content block, `[` to `]`, written the way the file set its body off. `fileIndent` is the indentation the file put
 * before the line of the call that holds the block, which the body is written relative to. A block the editor made opens
 * on a line of its own, or on the line of the call when `compact`.
 */
export function bracketBody(node: Node, render: EnvBodyRender, fileIndent: string, compact = false): string {
	const fileLead = typeof node.attrs.bodyLead === 'string' ? node.attrs.bodyLead : null;
	const fileTrail = typeof node.attrs.bodyTrail === 'string' ? node.attrs.bodyTrail : null;
	const lead = dedentAfterFirstLine(fileLead ?? (compact ? '' : DEFAULT_LEAD), fileIndent);
	const trail = dedentAfterFirstLine(fileTrail ?? (compact ? '' : DEFAULT_TRAIL), fileIndent);
	const indent = lead.includes('\n') ? lead.slice(lead.lastIndexOf('\n') + 1) : '';
	const kept = fileBody(node);
	const body = kept != null ? dedentAfterFirstLine(kept, fileIndent) : renderedBody(node, render, indent);
	// an empty body keeps the whitespace the file had in it; an editor-made one has none
	if (!body) return `[${fileLead == null ? '' : lead + trail}]`;
	const close = !trail.includes('\n') && ownsLineEnd(body) ? '\n' : trail;
	return `[${lead}${body}${close}]`;
}

/**
 * The environment's source. `nested` says a container holds it, which indents every line after the
 * first by its own measure: the body is then written relative to the call's line, the indentation
 * the file put before the call (typIndent) taken off.
 */
export function envSource(node: Node, render: EnvBodyRender, nested: boolean): string {
	const fileIndent = nested && typeof node.attrs.typIndent === 'string' ? node.attrs.typIndent : '';
	const bodyArg = bodyArgOf(node);
	const call = bodyArg ? bodyArgCall(node, bodyArg, render, fileIndent) : `${envHead(node)}${bracketBody(node, render, fileIndent)}`;
	return `${call}${envLabel(node, fileIndent)}`;
}

type BodyArgAttr = { sep: string; tail: string };

function bodyArgOf(node: Node): BodyArgAttr | null {
	const value = node.attrs.typBodyArg as BodyArgAttr | null;
	return value && typeof value.sep === 'string' && typeof value.tail === 'string' ? value : null;
}

/** `#name(args, body)`: the separator the file had, taken off with the arguments, a comma's when they are added */
function bodyArgCall(node: Node, bodyArg: BodyArgAttr, render: EnvBodyRender, fileIndent: string): string {
	const args = typeof node.attrs.args === 'string' ? node.attrs.args : '';
	const comma = bodyArg.sep.indexOf(',');
	let sep = bodyArg.sep;
	if (!args && comma >= 0) sep = sep.slice(comma + 1).trimStart();
	else if (args && comma < 0) sep = `, ${sep.trimStart()}`;
	const tail = dedentAfterFirstLine(bodyArg.tail, fileIndent);
	return `#${String(node.attrs.name ?? 'block')}(${dedentAfterFirstLine(args + sep, fileIndent)}${codeHolderBody(node, render, fileIndent, true)}${tail})`;
}
