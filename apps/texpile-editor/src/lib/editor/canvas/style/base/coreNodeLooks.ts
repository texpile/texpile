// the core's node types: paragraph by its container, heading by level and language, blockquote, rule
import type { StyleLook } from '../../contracts/styleTypes';
import { MARKDOWN_BREAKPOINT, type BaseSettings, type ParagraphSpacing } from './baseTypes';

const PARAGRAPH: StyleLook = { fontSize: 'var(--text-base)', lineHeight: 'var(--text-base--line-height)' };
const FLOW_MARGIN = 'calc(var(--spacing) * 3)';

const PARAGRAPH_BY_SPACING: Readonly<Record<ParagraphSpacing, StyleLook>> = {
	flow: { ...PARAGRAPH, marginBottom: FLOW_MARGIN },
	body: { ...PARAGRAPH, marginBottom: FLOW_MARGIN },
	tight: PARAGRAPH,
	list: PARAGRAPH,
	cell: PARAGRAPH,
	abstract: { ...PARAGRAPH, lineHeight: 'var(--leading-relaxed)', margin: 'calc(var(--spacing) * 2) 0' }
};
export type ParagraphLead = 'hanging' | 'inline' | null;

const FIRST_IN_DOC = 'calc(var(--spacing) * 4)';
const paragraphLooks = new Map<string, StyleLook>();

/** firstInDoc: the document's first block takes a top margin; last: a body's last paragraph keeps no bottom margin;
 *  indent is the paragraph's own \indent or \noindent;
 *  lead: the first paragraph of a description item, whose term hangs out into the item's left padding, or the one
 *  after a Typst term's name, which runs on beside it */
export function paragraphLook(
	spacing: ParagraphSpacing,
	indent: string | null,
	firstInDoc: boolean,
	lead: ParagraphLead = null,
	last = false
): StyleLook {
	const key = `${spacing}|${indent}|${firstInDoc}|${lead}|${last && spacing === 'body'}`;
	let look = paragraphLooks.get(key);
	if (!look) {
		look = { ...PARAGRAPH_BY_SPACING[spacing] };
		if (indent === 'indent') look = { ...look, textIndent: '1.5em' };
		if (indent === 'noindent') look = { ...look, position: 'relative' };
		if (firstInDoc) look = { ...look, marginTop: FIRST_IN_DOC };
		if (last && spacing === 'body') look = { ...look, marginBottom: '0px' };
		if (lead === 'hanging') look = { ...look, textIndent: 'calc(var(--spacing) * -8)' };
		if (lead === 'inline') look = { ...look, display: 'inline' };
		paragraphLooks.set(key, look);
	}
	return look;
}

const PAPER_SIZES = [1.4, 1.2, 1.05, 1, 1, 1];
const MARKDOWN_SIZES = [
	['--text-4xl', '--text-3xl'],
	['--text-3xl', '--text-2xl'],
	['--text-2xl', '--text-xl'],
	['--text-xl', '--text-lg'],
	['--text-lg', '--text-base'],
	['--text-base', '--text-sm']
] as const;
const headingLooks = new Map<string, StyleLook>();

/** level 1 to 6; Markdown prints nowhere, so it keeps web sizes that drop a step below the window breakpoint */
export function headingLook(settings: BaseSettings, level: number, firstInDoc: boolean): StyleLook {
	const at = Math.min(6, Math.max(1, level)) - 1;
	const markdown = settings.language === 'markdown';
	const narrow = settings.viewportWidth < MARKDOWN_BREAKPOINT;
	const key = `${markdown ? (narrow ? 'narrow' : 'wide') : 'paper'}|${settings.editorFont}|${at}|${firstInDoc}`;
	let look = headingLooks.get(key);
	if (!look) {
		look = {
			fontFamily: settings.editorFont ?? 'var(--typo-heading--font-family)',
			fontWeight: markdown && at >= 4 ? '500' : '600',
			lineHeight: '1.375',
			fontSize: markdown ? `var(${MARKDOWN_SIZES[at][narrow ? 1 : 0]})` : `calc(var(--text-base) * ${PAPER_SIZES[at]})`,
			marginTop: firstInDoc ? FIRST_IN_DOC : markdown ? '0px' : 'calc(var(--spacing) * 5)',
			marginBottom: 'calc(var(--spacing) * 2)'
		};
		headingLooks.set(key, look);
	}
	return look;
}

/** the heading's number, a generated part the heading view writes */
export function headingNumberLook(level: number): StyleLook {
	return {
		color: 'var(--muted-text)',
		fontWeight: level === 1 ? '700' : level >= 4 ? '500' : '600',
		marginRight: '0.5em',
		userSelect: 'none'
	};
}

export const BLOCKQUOTE_LOOK: StyleLook = {
	margin: 'calc(var(--spacing) * 4) calc(var(--spacing) * 8)',
	fontStyle: 'normal',
	padding: '0px'
};

export const RULE_LOOK: StyleLook = {
	borderTopStyle: 'solid',
	borderColor: 'var(--color-surface-200-800)',
	margin: 'calc(var(--spacing) * 6) 0px'
};
