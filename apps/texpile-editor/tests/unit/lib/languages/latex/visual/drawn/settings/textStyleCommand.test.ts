import { describe, expect, it } from 'vitest';
import {
	ordinaryCommand,
	readTextStyle,
	writeOrdinary,
	writeTextStyle
} from '$lib/languages/latex/visual/extensions/drawn/settings/textStyleCommand';

describe('textStyleCommand', () => {
	it('edits a group or a style command in place', () => {
		const group = readTextStyle('{\\bf bold words}')!;
		expect(group).toMatchObject({ name: 'bf', group: true, kind: 'bold', words: 'bold words' });
		expect(writeTextStyle('{\\bf bold words}', group, group.words)).toBe('{\\bf bold words}');
		expect(writeTextStyle('{\\bf bold words}', group, 'other')).toBe('{\\bf other}');
		const command = readTextStyle('\\textsc{Ready}')!;
		expect(writeTextStyle('\\textsc{Ready}', command, 'Set')).toBe('\\textsc{Set}');
	});

	it('turns a bold or italic group into the command the editor marks', () => {
		const group = readTextStyle('{\\it words} ')!;
		expect(writeOrdinary('{\\it words} ', group, ordinaryCommand(group)!)).toBe('\\textit{words} ');
		expect(ordinaryCommand(readTextStyle('{\\sc words}')!)).toBeNull();
	});

	it('leaves two groups in one chip to the LaTeX field', () => {
		expect(readTextStyle('{\\bf a}{\\it b}')).toBeNull();
	});

	it('reads every size switch as a size', () => {
		expect(readTextStyle('{\\Large words}')).toMatchObject({ kind: 'size' });
		expect(readTextStyle('{\\footnotesize words}')).toMatchObject({ kind: 'size' });
	});
});
