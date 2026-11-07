import type { Node } from 'prosemirror-model';
import {
	hasStar,
	mandatoryArgs,
	plainText,
	type ImportCall,
	type PmNode,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';

export function createRef(im: TreeImport, call: ImportCall, refType: string | null): PmNode[] {
	if (hasStar(call)) return [im.core.chip(call)];
	const label = plainText(im, mandatoryArgs(call)[0]);
	if (!label) return [im.core.chip(call)];
	let kind = refType;
	if (!kind) {
		const lower = label.toLowerCase();
		if (lower.startsWith('tab:') || lower.startsWith('table:') || lower.includes('texpile-table-')) kind = 'table';
		else if (lower.startsWith('fig:') || lower.startsWith('figure:') || lower.includes('texpile-fig-')) kind = 'figure';
		else if (lower.startsWith('eq:') || lower.startsWith('equation:') || lower.includes('texpile-eq-')) kind = 'equation';
	}
	return [im.core.node('ref', { refType: kind ?? 'reference', command: call.name }, [im.core.text(label)])];
}

export function refLatex(node: Node): string {
	return `\\${String(node.attrs.command ?? 'ref')}{${node.textContent}}`;
}
