import { faceElement, tippedFace, type ChipFace } from '../chipFace';
import '../definitions/definitions.css';

export type SettingLine = { target: string; values: string[] };

export function settingLines(settings: readonly SettingLine[]): SettingLine[] {
	const lines: SettingLine[] = [];
	for (const { target, values } of settings) {
		const last = lines[lines.length - 1];
		if (last && last.target === target && last.values.length === 1 && values.length === 1)
			last.values = [`${last.values[0]}, ${values[0]}`];
		else lines.push({ target, values: [...values] });
	}
	return lines;
}

export function settingRow(line: SettingLine): HTMLElement {
	const row = faceElement('span', 'drawn-setting');
	row.appendChild(faceElement('span', 'drawn-setting-target', line.target));
	for (const value of line.values) row.appendChild(document.createTextNode(` - ${value}`));
	return row;
}

export function settingsFace(settings: readonly SettingLine[], hint: string): ChipFace {
	const dom = faceElement('span', 'drawn-settings');
	for (const line of settingLines(settings)) dom.appendChild(settingRow(line));
	return tippedFace(dom, hint, { line: true });
}
