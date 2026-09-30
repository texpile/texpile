// the set rules the editor draws, and the arguments each one's panel has a field for; anything else a rule sets is kept
// as written. `hint` is what Typst uses when the argument is left out
export const SET_TARGETS = ['page', 'text', 'par', 'heading', 'document', 'math.equation'] as const;
export type SetTarget = (typeof SET_TARGETS)[number];

/**
 * how a field reads and writes its argument: `string` a quoted string, `names` one or a list of them, `content` a
 * string or markup in brackets, `length` a length as typed, `boolean` a switch, `integer` a count, `numbering` a
 * numbering pattern (none, the default, reads as empty)
 */
export type FieldKind = 'string' | 'names' | 'content' | 'length' | 'boolean' | 'integer' | 'numbering';

export type SetField = { name: string; kind: FieldKind; suggestions?: readonly string[]; hint?: string };

const NUMBERING: SetField = { name: 'numbering', kind: 'numbering', hint: 'none' };

export const SET_FIELDS: Record<SetTarget, readonly SetField[]> = {
	page: [
		{ name: 'paper', kind: 'string', suggestions: ['a4', 'a5', 'a3', 'us-letter', 'us-legal'], hint: 'a4' },
		{ name: 'margin', kind: 'length', suggestions: ['2cm', '2.5cm', '1in', 'auto'], hint: 'auto' },
		{ name: 'columns', kind: 'integer', suggestions: ['1', '2', '3'], hint: '1' },
		{ ...NUMBERING, suggestions: ['1', '1 / 1', 'i', '- 1 -'] }
	],
	text: [
		{
			name: 'font',
			kind: 'string',
			suggestions: ['Libertinus Serif', 'New Computer Modern', 'DejaVu Sans Mono'],
			hint: 'Libertinus Serif'
		},
		{ name: 'size', kind: 'length', suggestions: ['10pt', '11pt', '12pt'], hint: '11pt' },
		{ name: 'lang', kind: 'string', suggestions: ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl', 'zh', 'ja'], hint: 'en' }
	],
	par: [
		{ name: 'justify', kind: 'boolean' },
		{ name: 'leading', kind: 'length', suggestions: ['0.65em', '0.8em', '1em'], hint: '0.65em' },
		{ name: 'first-line-indent', kind: 'length', suggestions: ['1em', '1.5em', '2em'], hint: '0pt' }
	],
	heading: [{ ...NUMBERING, suggestions: ['1.', '1.1', '1.a', 'I.', 'A.'] }],
	document: [
		{ name: 'title', kind: 'content' },
		{ name: 'author', kind: 'names' }
	],
	'math.equation': [{ ...NUMBERING, suggestions: ['(1)', '(1.1)', '1.', '[1]'] }]
};

export function isSetTarget(name: string): name is SetTarget {
	return (SET_TARGETS as readonly string[]).includes(name);
}
