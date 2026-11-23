import { faceElement, setLook } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '$lib/languages/latex/visual/core';
import { m } from '$lib/paraglide/messages';

export function pauseFace(source: string): ChipFace {
	const dom = faceElement('span', 'drawn-pause', m.slide_pause());
	setLook(dom, {
		display: 'inline-block',
		padding: '0 0.5em',
		borderRadius: '999px',
		fontSize: '0.65rem',
		lineHeight: '1.6',
		letterSpacing: '0.04em',
		textTransform: 'uppercase',
		color: 'var(--faint-text)',
		backgroundColor: 'color-mix(in srgb, var(--color-surface-500) 14%, transparent)',
		verticalAlign: '0.1em'
	});
	return tippedFace(dom, source, { character: true });
}
