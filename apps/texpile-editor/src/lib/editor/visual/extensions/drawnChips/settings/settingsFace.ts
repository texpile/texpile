import type { FaceElement } from '$lib/editor/canvas';
import { tippedFace, type ChipFace } from '../chipFace';
import { chipElement } from '../looks/chipLooks';

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

export function settingRow(line: SettingLine): FaceElement {
	const row = chipElement('span', 'drawn-setting');
	row.appendChild(chipElement('span', 'drawn-setting-target', line.target));
	for (const value of line.values) row.append(` - ${value}`);
	return row;
}

export function settingsFace(settings: readonly SettingLine[], hint: string): ChipFace {
	const dom = chipElement('span', 'drawn-settings');
	for (const line of settingLines(settings)) dom.appendChild(settingRow(line));
	return tippedFace(dom, hint, { line: true });
}
