import { m } from '$lib/paraglide/messages';

/** plain-language reason a paragraph can't take the instant path (shown in the status) */
export function whyPhrase(reason: string): string {
	switch (reason) {
		case 'spans-pages':
		case 'spans-boundary':
		case 'break-inside':
			return m.draft_reason_column_or_page();
		case 'overflow':
			return m.draft_reason_overflow();
		case 'underflow':
			return m.draft_reason_underflow();
		case 'no-line-boxes':
		case 'no-anchor-glyphs':
		case 'no-page-records':
		case 'no-synctex-page':
		case 'no-page-glyphs':
		case 'no-run-of-N':
		case 'content-mismatch':
			return m.draft_reason_locate_failed();
		case 'synctex-span>N':
		case 'line-count':
		case 'spread':
		case 'glue-gap':
			return m.draft_reason_layout_mismatch();
		// page-rtl: the page's records are in logical order, not visual, so there is nothing
		// on it the instant path can splice against
		case 'page-rtl':
		case 'cal-uncertified':
		case 'cal-typeset-failed':
		case 'cal-empty':
		case 'typeset':
			return m.draft_reason_cannot_reproduce();
		case 'command-changed':
		case 'value-changed':
			return m.draft_reason_command_changed();
		case 'no-lines':
			return m.draft_reason_nothing_to_typeset();
		default:
			return m.draft_reason_needs_recompile();
	}
}
