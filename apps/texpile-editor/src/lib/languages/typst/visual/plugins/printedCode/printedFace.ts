import { faceElement, setLook } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '$lib/languages/typst/visual/core';
import { readPrinted } from './printedCall';

export function printedFace(source: string): ChipFace | null {
	const read = readPrinted(source);
	if (!read) return null;
	const { use, text, block } = read;
	const dom = faceElement(block ? 'pre' : 'code', '', text);
	if (block)
		setLook(dom, {
			margin: '0.75rem 0',
			padding: '0.75rem',
			fontSize: '0.95em',
			borderRadius: 'var(--radius-base)',
			backgroundColor: 'var(--color-surface-200-800)',
			overflowX: 'auto'
		});
	return tippedFace(dom, use.source, { line: block });
}
