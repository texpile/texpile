// a command that only names a color for what is around it (\cellcolor, \rowcolor, \pagecolor): the color, small and muted
import { cssColor, faceElement, tippedFace, type ChipFace } from '$lib/languages/latex/visual/core';
import './colorSetting.css';

export function colorSettingFace(color: string, source: string): ChipFace {
	const dom = faceElement('span', 'drawn-switch drawn-color-setting');
	const css = cssColor(color);
	if (css) {
		const swatch = faceElement('span', 'drawn-color-swatch');
		swatch.style.background = css;
		dom.append(swatch);
	}
	dom.append(color.trim());
	return tippedFace(dom, source);
}
