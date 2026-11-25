// slides.css as looks: the frame's 16:9 box, its titles, the theorem-like blocks and the columns
import type { StyleLook } from '$lib/editor/canvas';

export const FRAME_LOOK: StyleLook = {
	position: 'relative',
	aspectRatio: '16 / 9',
	margin: 'calc(var(--spacing) * 5) 0',
	padding: 'calc(var(--spacing) * 5) calc(var(--spacing) * 7) calc(var(--spacing) * 8)',
	border: 'var(--default-border-width) solid var(--color-surface-300-700)',
	borderRadius: 'calc(var(--radius-base) * 2)'
};
export const TITLE_SLIDE_LOOK: StyleLook = { display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' };
export const WIDE_LOOK: StyleLook = { width: '100%' };
export const SLIDE_NUMBER_LOOK: StyleLook = {
	position: 'absolute',
	right: 'calc(var(--spacing) * 3)',
	bottom: 'calc(var(--spacing) * 2)',
	fontSize: '0.7rem',
	fontVariantNumeric: 'tabular-nums',
	color: 'var(--faint-text)'
};
export const TITLE_LOOK: StyleLook = {
	margin: '0',
	fontSize: '1.45rem',
	fontWeight: '650',
	lineHeight: '1.25',
	color: 'var(--primary-ink)'
};
export const SUBTITLE_LOOK: StyleLook = {
	margin: '0',
	marginTop: 'calc(var(--spacing) * 0.5)',
	fontSize: '1.05rem',
	color: 'var(--muted-text)'
};
export const TITLE_GAP_LOOK: StyleLook = { marginBottom: 'calc(var(--spacing) * 4)' };
// the DOM's zero-height float as an overlay at the content edge: the caret stays at the line start
export function hintLook(top: string, left: string): StyleLook {
	return { position: 'absolute', top, left, color: 'var(--faint-text)', fontWeight: '400', whiteSpace: 'nowrap' };
}
export const TITLE_HINT_LOOK = hintLook('0px', '0px');
export const BLOCK_TITLE_HINT_LOOK = hintLook('calc(var(--spacing) * 1)', 'calc(var(--spacing) * 3)');

const BLOCK_COLORS: Record<string, [string, string]> = {
	block: ['var(--color-primary-500)', 'var(--primary-ink)'],
	alertblock: ['var(--color-error-500)', 'var(--error-ink)'],
	exampleblock: ['var(--color-success-500)', 'var(--success-ink)']
};

function colorsOf(kind: unknown): [string, string] {
	return BLOCK_COLORS[String(kind)] ?? BLOCK_COLORS.block;
}

// the body's inline margins and its first and last spacing, held by the block's own padding
export function blockLook(kind: unknown): StyleLook {
	return {
		margin: 'calc(var(--spacing) * 3) 0',
		padding: '0 calc(var(--spacing) * 3) calc(var(--spacing) * 2)',
		borderRadius: 'var(--radius-base)',
		overflow: 'hidden',
		backgroundColor: `color-mix(in oklab, ${colorsOf(kind)[0]} 9%, transparent)`
	};
}

export function blockTitleLook(kind: unknown): StyleLook {
	const [block, ink] = colorsOf(kind);
	return {
		position: 'relative',
		margin: '0 calc(var(--spacing) * -3) calc(var(--spacing) * 2)',
		padding: 'calc(var(--spacing) * 1) calc(var(--spacing) * 3)',
		fontWeight: '600',
		color: ink,
		backgroundColor: `color-mix(in oklab, ${block} 22%, transparent)`
	};
}

export const COLUMNS_LOOK: StyleLook = {
	display: 'flex',
	gap: 'calc(var(--spacing) * 4)',
	alignItems: 'flex-start',
	margin: 'calc(var(--spacing) * 3) 0'
};
export const COLUMN_HEAD_LOOK: StyleLook = { height: 'calc(var(--spacing) * 5)' };
