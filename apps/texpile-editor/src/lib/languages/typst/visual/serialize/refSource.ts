// how a typ_ref is written: the plainest spelling that says everything it holds. Only a form needs
// the call; a supplement alone rides in brackets after the marker
import type { Attrs, Node } from 'prosemirror-model';

export type RefSpelling = { text: string; plain: boolean };

// a reference the file spelled otherwise (`#cite(<k>)`, `#ref(<k>, supplement: [..])`, odd spacing
// in a call), kept by node like a leaf's spans: an edit makes a new node, which is written plainly,
// while an untouched one keeps the file's spelling even when an edit beside it rewrites its run
const fileSpellings = new WeakMap<Node, string>();

/** the plainest source for these attrs, and whether it is the bare `@target` a following word could extend */
export function plainRefSpelling(attrs: Attrs): RefSpelling {
	const target = String(attrs.target ?? '');
	const supplement = typeof attrs.supplement === 'string' ? attrs.supplement : null;
	const form = typeof attrs.form === 'string' && attrs.form ? attrs.form : null;
	if (form) {
		// cite's own parameter order, so a written call reads like the documentation's
		const args = [`<${target}>`, ...(supplement != null ? [`supplement: [${supplement}]`] : []), `form: "${form}"`];
		return { text: `#cite(${args.join(', ')})`, plain: false };
	}
	if (supplement != null) return { text: `@${target}[${supplement}]`, plain: false };
	return { text: `@${target}`, plain: true };
}

/** `node`, remembered as spelled `text` in the file when that is not its plainest spelling */
export function spelledAs<T extends Node>(node: T, text: string): T {
	if (text !== plainRefSpelling(node.attrs).text) fileSpellings.set(node, text);
	return node;
}

export function typRefSpelling(node: Node): RefSpelling {
	const spelled = fileSpellings.get(node);
	// a spelling that is not the plain one is a call or a supplement: nothing reads on past its end
	return spelled != null ? { text: spelled, plain: false } : plainRefSpelling(node.attrs);
}
