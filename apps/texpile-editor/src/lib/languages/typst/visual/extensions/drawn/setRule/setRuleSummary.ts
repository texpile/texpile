// a set rule in a few words (Page · A4 · 2.5cm margins, Text · Libertinus Serif · 11pt · en): what it sets, and the
// settings its panel has fields for; a value only Typst can show is left out of the words
import type { SetField } from './setRuleFields';
import { fieldValue, type SetRule } from './setRuleCall';
import { m } from '$lib/paraglide/messages';

type Shown = (text: string) => string | null;

const TARGET_LABELS = {
	page: m.drawn_chip_typst_set_page,
	text: m.drawn_chip_typst_set_text,
	par: m.drawn_chip_typst_set_par,
	heading: m.drawn_chip_typst_set_heading,
	document: m.drawn_chip_typst_set_document,
	'math.equation': m.drawn_chip_typst_set_equation
} as const;

/** a4 as A4, us-letter as US Letter */
function paperName(paper: string): string {
	if (/^[abc]\d+$/i.test(paper)) return paper.toUpperCase();
	return paper
		.split('-')
		.map((word) => (word === 'us' || word === 'jis' || word === 'iso' ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
		.join(' ');
}

function numbered(pattern: string): string {
	return pattern ? m.drawn_chip_typst_numbered({ pattern }) : m.drawn_chip_typst_unnumbered();
}

const WORDS: Record<string, Shown> = {
	paper: paperName,
	margin: (margin) => (margin === 'auto' ? null : m.drawn_chip_typst_margins({ margin })),
	columns: (count) => (count === '1' ? null : m.drawn_chip_typst_columns({ count })),
	numbering: numbered,
	font: (font) => font,
	size: (size) => size,
	lang: (lang) => lang,
	justify: (justify) => (justify === 'true' ? m.drawn_chip_typst_justified() : null),
	leading: (leading) => m.drawn_chip_typst_leading({ leading }),
	'first-line-indent': (indent) => m.drawn_chip_typst_indent({ indent }),
	title: (title) => title,
	author: (author) => author
};

function words(rule: SetRule, field: SetField): string | null {
	const value = fieldValue(rule, field);
	if (!value.given || value.code || (!value.text && field.kind !== 'numbering')) return null;
	return WORDS[field.name]?.(value.text.replace(/\s+/g, ' ').trim()) ?? null;
}

export function setRuleTargetLabel(rule: SetRule): string {
	return TARGET_LABELS[rule.target]();
}

/** the target's name, then what the rule sets that the panel shows */
export function setRuleSummary(rule: SetRule): string[] {
	const parts = rule.fields.map((field) => words(rule, field)).filter((part): part is string => part !== null);
	return [setRuleTargetLabel(rule), ...parts];
}
