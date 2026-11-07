import type { Node } from 'prosemirror-model';
import {
	callItemsSource,
	isCallArgs,
	typStr,
	withItem,
	type CallItem,
	type TypstSaveCore
} from '$lib/languages/typst/visual/core/document';

function plainText(node: Node): boolean {
	let plain = true;
	node.forEach((child) => {
		if (!child.isText || child.marks.length > 0) plain = false;
	});
	return plain;
}

export function headingStringBody(node: Node): boolean {
	const args = node.attrs.typCall;
	return node.type.name === 'heading' && isCallArgs(args) && args.items.some((item) => item.role === 'body' && item.string);
}

function headingCallSource(node: Node, label: string, core: TypstSaveCore): string | null {
	const args = node.attrs.typCall;
	if (!isCallArgs(args)) return null;
	const after = (args as { after?: unknown }).after === true;
	const level = Math.max(1, Number(node.attrs.level ?? 1));
	const numbered = node.attrs.numbered !== false;
	let items: CallItem[] = args.items.filter((item) => item.role !== 'unnumbered' || !numbered);
	if (!items.some((item) => item.role === 'level') && level !== 1) items = withItem(items, { role: 'level', text: 'level: ' }, -1);
	if (!numbered && !items.some((item) => item.role === 'unnumbered'))
		items = withItem(items, { role: 'unnumbered', text: 'numbering: none' }, -1);
	function body(item?: CallItem): string {
		return item?.string && plainText(node) ? typStr(node.textContent) : `[${core.bracketed(node)}]`;
	}
	function write(item: CallItem): string {
		return item.role === 'body' ? body(item) : item.role === 'level' ? item.text + level : item.text;
	}
	return `#heading${callItemsSource(args, items, write)}${after ? body() : ''}${label}`;
}

export function headingLine(node: Node, core: TypstSaveCore): string | null {
	return node.attrs.numbered === false ? null : core.line(node, core.label(node));
}

export function headingSave(node: Node, _ctx: unknown, core: TypstSaveCore): string {
	const level = Math.max(1, Number(node.attrs.level ?? 1));
	const label = core.label(node);
	const call = headingCallSource(node, label, core);
	if (call != null) return call + '\n\n';
	const line = headingLine(node, core);
	if (line == null) {
		const args = node.attrs.numbered === false ? `level: ${level}, numbering: none` : `depth: ${level}`;
		return `#heading(${args})[${core.bracketed(node)}]${label}\n\n`;
	}
	return `${'='.repeat(level)}${line ? ' ' + line : ''}${label}\n\n`;
}
