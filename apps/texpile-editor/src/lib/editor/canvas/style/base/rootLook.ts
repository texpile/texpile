import type { StyleLook } from '../../contracts/styleTypes';
import type { BaseSettings } from './baseTypes';

const PAGE_SHADOW = '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)';

/** .ProseMirror and .TexpileEditor, and the page view sheet when it is on */
export function rootLook(settings: BaseSettings): StyleLook {
	const root: StyleLook = {
		display: 'block',
		position: 'relative',
		boxSizing: 'border-box',
		whiteSpace: 'break-spaces',
		overflowWrap: 'break-word',
		fontVariantLigatures: 'none',
		fontFamily: settings.editorFont ?? 'var(--typo-base--font-family)',
		lineHeight: 'var(--leading-relaxed)',
		color: 'var(--color-surface-950-50)',
		margin: 'calc(var(--spacing) * 1)',
		maxWidth: '100%',
		// A1: room for the three caret lines a keyed move keeps above the foot, more than the DOM editor's 2rem
		paddingBottom: '4.5em'
	};
	if (!settings.pageView) return root;
	return {
		...root,
		width: '85%',
		maxWidth: '1400px',
		minHeight: '70vh',
		margin: 'calc(var(--spacing) * 8) auto',
		paddingTop: 'calc(var(--spacing) * 12)',
		paddingLeft: '8%',
		paddingRight: '8%',
		backgroundColor: 'var(--page-sheet)',
		borderRadius: 'var(--radius-base)',
		boxShadow: PAGE_SHADOW
	};
}
