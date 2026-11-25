import { faceElement, setLook } from '$lib/editor/canvas';
import { coreElement, cssColor, tippedFace, type ChipFace } from '$lib/languages/latex/visual/core';

export function colorSettingFace(color: string, source: string): ChipFace {
	const dom = coreElement('span', 'drawn-switch drawn-color-setting');
	setLook(dom, { display: 'inline-flex', alignItems: 'center', gap: '0.25em' });
	const css = cssColor(color);
	if (css) {
		const swatch = dom.appendChild(faceElement('span', 'drawn-color-swatch'));
		setLook(swatch, { width: '0.7em', height: '0.7em', borderRadius: '2px', border: '1px solid var(--faint-text)', backgroundColor: css });
	}
	dom.appendChild(faceElement('span', '', color.trim()));
	return tippedFace(dom, source);
}
