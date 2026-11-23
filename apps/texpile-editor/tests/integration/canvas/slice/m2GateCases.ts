// the M2 gate's documents (docs/) and the rows the DOM editor answered for each walk (canvas/p0-dom, 3 tries each, all equal)
export type GateStart = { needle?: string; end?: boolean; cellText?: string };
/** rows: the DOM editor's; canvas: the rows where the canvas follows a listed rule instead, and why */
export type GateWalk = { id: string; start: GateStart; keys: string[]; rows: string[]; canvas?: Record<number, string>; why?: string };
export type GateCase = {
	file: string;
	/** drawn before the heading's words, before them once a section goes in above, and the display's number (none in Markdown) */
	numbers: { heading: string[]; next: string[]; equation: string | null };
	/** a needle in the paragraph holding the chip and the formula, its inline atoms, and whether the chip is drawn */
	paragraph: string;
	atoms: string[];
	drawnChip: boolean;
	/** the paragraph's source line, which a copy puts on the clipboard */
	copiedLine: string;
	raw: { start: GateStart; typed: string };
	walks: GateWalk[];
};

export const GATE_CASES: GateCase[] = [
	{
		file: 'slice-tex/main.tex',
		numbers: { heading: ['1'], next: ['2'], equation: '(1)' },
		paragraph: 'in the middle of its words',
		atoms: ['inline_latex', 'inline_math'],
		drawnChip: true,
		copiedLine:
			'A paragraph with a note\\footnote{The note.} and the formula $E = mc^2$ in the middle of its words, long enough to wrap across the column of the pane.',
		raw: { start: { needle: '\\foo{bar}', end: true }, typed: ' \\bar' },
		walks: [
			{
				id: 'chip-arrows',
				start: { needle: 'a note', end: true },
				keys: ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft'],
				rows: ['start text 35 35', 'ArrowRight text 57 57', 'ArrowRight text 58 58', 'ArrowLeft text 57 57', 'ArrowLeft text 35 35']
			},
			{
				id: 'chip-extend',
				start: { needle: 'a note', end: true },
				keys: ['Shift+ArrowRight', 'Shift+ArrowRight', 'ArrowLeft'],
				rows: ['start text 35 35', 'Shift+ArrowRight text 35 57', 'Shift+ArrowRight text 35 58', 'ArrowLeft text 35 35']
			},
			{
				id: 'chip-words',
				start: { needle: 'a note', end: true },
				keys: ['Control+ArrowRight', 'Control+ArrowLeft', 'Control+Shift+ArrowRight'],
				rows: ['start text 35 35', 'Control+ArrowRight text 57 57', 'Control+ArrowLeft text 35 35', 'Control+Shift+ArrowRight text 57 61'],
				canvas: { '3': 'Control+Shift+ArrowRight node 35 57' },
				why: "W11's CHIP_RULE: a word extend over a drawn chip selects it, as over \\ref and \\cite; the DOM editor's range end landed in the chip's text (awaiting Louis, 04-m2.md W11)"
			},
			{
				id: 'formula-right',
				start: { needle: 'the formula ', end: true },
				keys: ['ArrowRight'],
				rows: ['start text 74 74', 'ArrowRight node 74 84']
			},
			{ id: 'formula-left', start: { needle: ' in the middle' }, keys: ['ArrowLeft'], rows: ['start text 84 84', 'ArrowLeft node 74 84'] },
			{
				id: 'formula-extend',
				start: { needle: 'the formula ', end: true },
				keys: ['Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowLeft'],
				rows: ['start text 74 74', 'Shift+ArrowRight text 74 84', 'Shift+ArrowRight text 74 85', 'Shift+ArrowLeft node 74 84']
			},
			{
				id: 'formula-extend-left',
				start: { needle: ' in the middle' },
				keys: ['Shift+ArrowLeft', 'Shift+ArrowLeft'],
				rows: ['start text 84 84', 'Shift+ArrowLeft text 84 74', 'Shift+ArrowLeft text 84 73']
			},
			{
				id: 'formula-word-right',
				start: { needle: 'the formula ', end: true },
				keys: ['Control+ArrowRight'],
				rows: ['start text 74 74', 'Control+ArrowRight text 84 84']
			},
			{
				id: 'formula-word-left',
				start: { needle: ' in the middle' },
				keys: ['Control+ArrowLeft'],
				rows: ['start text 84 84', 'Control+ArrowLeft text 74 74']
			},
			{
				id: 'display-into',
				start: { needle: 'of the pane.', end: true },
				keys: ['ArrowRight'],
				rows: ['start text 163 163', 'ArrowRight node 164 196']
			},
			{
				id: 'table-tab',
				start: { cellText: 'a' },
				keys: ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Shift+ArrowLeft'],
				rows: [
					'start text 217 217',
					'Tab text 222 223',
					'Tab text 227 228',
					'Tab text 234 235',
					'Shift+Tab text 227 228',
					'ArrowRight text 234 234',
					'ArrowRight text 235 235',
					'ArrowLeft text 234 234',
					'Shift+ArrowLeft text 234 234'
				]
			},
			{
				id: 'table-down',
				start: { cellText: 'b' },
				keys: ['ArrowDown', 'ArrowDown'],
				rows: ['start text 222 222', 'ArrowDown text 239 239', 'ArrowDown text 256 256']
			},
			{ id: 'table-up', start: { cellText: 'a' }, keys: ['ArrowUp'], rows: ['start text 217 217', 'ArrowUp text 212 212'] }
		]
	},
	{
		file: 'slice-typ/main.typ',
		numbers: { heading: ['1.'], next: ['2.'], equation: '(1)' },
		paragraph: 'in the middle of its words',
		atoms: ['inline_latex', 'inline_math'],
		drawnChip: true,
		copiedLine:
			'A paragraph with a note#footnote[The note.] and the formula $E = m c^2$ in the middle of its words, long enough to wrap across the column of the pane.',
		raw: { start: { needle: 'node((0, 0), [A])', end: true }, typed: ' x' },
		walks: [
			{
				id: 'chip-arrows',
				start: { needle: 'a note', end: true },
				keys: ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft'],
				rows: [
					'start text 104 104',
					'ArrowRight text 126 126',
					'ArrowRight text 127 127',
					'ArrowLeft text 126 126',
					'ArrowLeft text 104 104'
				]
			},
			{
				id: 'chip-extend',
				start: { needle: 'a note', end: true },
				keys: ['Shift+ArrowRight', 'Shift+ArrowRight', 'ArrowLeft'],
				rows: ['start text 104 104', 'Shift+ArrowRight text 104 126', 'Shift+ArrowRight text 104 127', 'ArrowLeft text 104 104']
			},
			{
				id: 'chip-words',
				start: { needle: 'a note', end: true },
				keys: ['Control+ArrowRight', 'Control+ArrowLeft', 'Control+Shift+ArrowRight'],
				rows: [
					'start text 104 104',
					'Control+ArrowRight text 126 126',
					'Control+ArrowLeft text 104 104',
					'Control+Shift+ArrowRight text 126 130'
				],
				canvas: { '3': 'Control+Shift+ArrowRight node 104 126' },
				why: "W11's CHIP_RULE: a word extend over a drawn chip selects it, as over \\ref and \\cite; the DOM editor's range end landed in the chip's text (awaiting Louis, 04-m2.md W11)"
			},
			{
				id: 'formula-right',
				start: { needle: 'the formula ', end: true },
				keys: ['ArrowRight'],
				rows: ['start text 143 143', 'ArrowRight node 143 154']
			},
			{
				id: 'formula-left',
				start: { needle: ' in the middle' },
				keys: ['ArrowLeft'],
				rows: ['start text 154 154', 'ArrowLeft node 143 154']
			},
			{
				id: 'formula-extend',
				start: { needle: 'the formula ', end: true },
				keys: ['Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowLeft'],
				rows: ['start text 143 143', 'Shift+ArrowRight text 143 154', 'Shift+ArrowRight text 143 155', 'Shift+ArrowLeft node 143 154']
			},
			{
				id: 'formula-extend-left',
				start: { needle: ' in the middle' },
				keys: ['Shift+ArrowLeft', 'Shift+ArrowLeft'],
				rows: ['start text 154 154', 'Shift+ArrowLeft text 154 143', 'Shift+ArrowLeft text 154 142']
			},
			{
				id: 'formula-word-right',
				start: { needle: 'the formula ', end: true },
				keys: ['Control+ArrowRight'],
				rows: ['start text 143 143', 'Control+ArrowRight text 154 154']
			},
			{
				id: 'formula-word-left',
				start: { needle: ' in the middle' },
				keys: ['Control+ArrowLeft'],
				rows: ['start text 154 154', 'Control+ArrowLeft text 143 143']
			},
			{
				id: 'display-into',
				start: { needle: 'of the pane.', end: true },
				keys: ['ArrowRight'],
				rows: ['start text 233 233', 'ArrowRight node 234 262']
			},
			{
				id: 'table-tab',
				start: { cellText: 'a' },
				keys: ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Shift+ArrowLeft'],
				rows: [
					'start text 267 267',
					'Tab text 272 273',
					'Tab text 277 278',
					'Tab text 284 285',
					'Shift+Tab text 277 278',
					'ArrowRight text 284 284',
					'ArrowRight text 285 285',
					'ArrowLeft text 284 284',
					'Shift+ArrowLeft text 284 284'
				]
			},
			{
				id: 'table-down',
				start: { cellText: 'b' },
				keys: ['ArrowDown', 'ArrowDown'],
				rows: ['start text 272 272', 'ArrowDown text 289 289', 'ArrowDown text 306 306']
			}
		]
	},
	{
		file: 'slice-md/README.md',
		numbers: { heading: [], next: [], equation: null },
		paragraph: 'in the middle of its words',
		atoms: ['inline_latex', 'inline_latex', 'inline_math'],
		drawnChip: false,
		copiedLine:
			'A paragraph with a raw chip <kbd>Ctrl</kbd> and the formula $E = mc^2$ in the middle of its words, long enough to wrap across the column of the pane.',
		raw: { start: { needle: '<b>Raw</b>', end: true }, typed: ' x' },
		walks: [
			{
				id: 'chip-arrows',
				start: { needle: 'a raw chip ', end: true },
				keys: ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft'],
				rows: ['start text 40 40', 'ArrowRight text 41 41', 'ArrowRight text 42 42', 'ArrowLeft text 41 41', 'ArrowLeft text 40 40']
			},
			{
				id: 'chip-extend',
				start: { needle: 'a raw chip ', end: true },
				keys: ['Shift+ArrowRight', 'Shift+ArrowRight', 'ArrowLeft'],
				rows: ['start text 40 40', 'Shift+ArrowRight text 40 47', 'Shift+ArrowRight text 40 48', 'ArrowLeft text 40 40'],
				canvas: { '1': 'Shift+ArrowRight text 40 41', '2': 'Shift+ArrowRight text 40 42' },
				why: "W9 M3: a source chip is no island yet, so a range end enters it; the DOM editor's CodeMirror island kept the end out"
			},
			{
				id: 'formula-right',
				start: { needle: 'the formula ', end: true },
				keys: ['ArrowRight'],
				rows: ['start text 76 76', 'ArrowRight node 76 86']
			},
			{ id: 'formula-left', start: { needle: ' in the middle' }, keys: ['ArrowLeft'], rows: ['start text 86 86', 'ArrowLeft node 76 86'] },
			{
				id: 'formula-extend',
				start: { needle: 'the formula ', end: true },
				keys: ['Shift+ArrowRight', 'Shift+ArrowRight', 'Shift+ArrowLeft'],
				rows: ['start text 76 76', 'Shift+ArrowRight text 76 86', 'Shift+ArrowRight text 76 87', 'Shift+ArrowLeft node 76 86']
			},
			{
				id: 'formula-extend-left',
				start: { needle: ' in the middle' },
				keys: ['Shift+ArrowLeft', 'Shift+ArrowLeft'],
				rows: ['start text 86 86', 'Shift+ArrowLeft text 86 76', 'Shift+ArrowLeft text 86 75']
			},
			{
				id: 'formula-word-right',
				start: { needle: 'the formula ', end: true },
				keys: ['Control+ArrowRight'],
				rows: ['start text 76 76', 'Control+ArrowRight text 86 86']
			},
			{
				id: 'formula-word-left',
				start: { needle: ' in the middle' },
				keys: ['Control+ArrowLeft'],
				rows: ['start text 86 86', 'Control+ArrowLeft text 76 76']
			},
			{
				id: 'display-into',
				start: { needle: 'of the pane.', end: true },
				keys: ['ArrowRight'],
				rows: ['start text 165 165', 'ArrowRight node 166 198']
			},
			{
				id: 'table-tab',
				start: { cellText: 'a' },
				keys: ['Tab', 'Tab', 'Tab', 'Shift+Tab', 'ArrowRight', 'ArrowRight', 'ArrowLeft', 'Shift+ArrowLeft'],
				rows: [
					'start text 202 202',
					'Tab text 207 208',
					'Tab text 212 213',
					'Tab text 219 220',
					'Shift+Tab text 212 213',
					'ArrowRight text 219 219',
					'ArrowRight text 220 220',
					'ArrowLeft text 219 219',
					'Shift+ArrowLeft text 219 219'
				]
			},
			{
				id: 'table-down',
				start: { cellText: 'b' },
				keys: ['ArrowDown', 'ArrowDown'],
				rows: ['start text 207 207', 'ArrowDown text 224 224', 'ArrowDown text 241 241']
			}
		]
	}
];
