// what the environment header may write: a name and arguments that still read back as this
// environment, never a call the next open would turn into a code chip or a broken file
import type { Node } from 'prosemirror-model';
import { typstToProseMirror } from '../../convert/converter';
import { readTypstCall } from '../../core/reading/typstCall';

/** whether `#name(args)[..]` reads back as an environment with exactly this name and arguments */
export function envHeadReadsBack(name: string, args: string | null): boolean {
	const head = `#${name}${args == null ? '' : `(${args})`}`;
	try {
		const first = typstToProseMirror(`${head}[x]\n`).doc.firstChild;
		return first?.type.name === 'typ_env' && first.attrs.name === name && first.attrs.args === args;
	} catch {
		return false;
	}
}

export function readTypstHead(head: string): { name: string; args: string | null } | null {
	const bare = /^\s*#([^\s()[\]{}<>]+)\s*$/.exec(head);
	if (bare) return { name: bare[1], args: null };
	const call = readTypstCall(head);
	if (!call || call.open === null || call.close === null) return null;
	return { name: call.name, args: head.slice(call.open + 1, call.close) };
}

export function envHeadSource(node: Node): string {
	const args = typeof node.attrs.args === 'string' ? `(${node.attrs.args})` : '';
	const label = node.attrs.label ? ` <${node.attrs.label}>` : '';
	return `#${String(node.attrs.name ?? '')}${args}${label}`;
}

export function readEnvHead(text: string): { name: string; args: string | null; label: string | null } | null {
	const label = /\s+<([^<>\s]+)>\s*$/.exec(text);
	const head = readTypstHead(label ? text.slice(0, label.index) : text);
	if (!head || !envHeadReadsBack(head.name, head.args)) return null;
	return { ...head, label: label ? label[1] : null };
}

/** the arguments the field stands for: untouched it is what the call had, emptied it is no
 *  parentheses at all */
export function argsFromField(text: string, current: string | null): string | null {
	if (text === (current ?? '')) return current;
	return text.trim() === '' ? null : text;
}
