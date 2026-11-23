import type { StyleLook } from '$lib/editor/canvas';
import type { CellAlign, CellEdges, RuleWeight } from '../rules/tableRules';

export const DEFAULT_CELL_MIN_WIDTH = 100;

const RULE = 'var(--color-surface-950-50)';
const GUIDE = 'var(--color-surface-300-700)';
const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
const WEIGHTS: Record<RuleWeight, { width: string; style: string }> = {
	light: { width: '1px', style: 'solid' },
	heavy: { width: '2px', style: 'solid' },
	double: { width: '3px', style: 'double' }
};

export const WRAPPER_LOOK: StyleLook = { position: 'relative', margin: 'calc(var(--spacing) * 4) 0' };
export const CHROME_LOOK: StyleLook = { display: 'flex', flexDirection: 'column' };
export const TOOLS_LOOK: StyleLook = {
	position: 'absolute',
	top: '0px',
	right: '0px',
	zIndex: '1',
	display: 'flex',
	alignItems: 'center',
	gap: 'calc(var(--spacing) * 1)'
};
export const CONTENT_LOOK: StyleLook = {
	display: 'flex',
	flexDirection: 'column',
	maxWidth: '100%',
	overflowX: 'auto',
	overflowY: 'auto',
	gap: 'calc(var(--spacing) * 2)'
};
export const CAPTION_LOOK: StyleLook = {
	textAlign: 'center',
	padding: '0 calc(var(--spacing) * 8)',
	cursor: 'text',
	minHeight: 'calc(var(--spacing) * 6)'
};
export const CAPTION_PREFIX_LOOK: StyleLook = { fontWeight: '600', color: 'var(--muted-text)', marginRight: '0.25em' };
export const NOTES_LOOK: StyleLook = {
	fontSize: '0.75rem',
	marginTop: 'calc(var(--spacing) * 2)',
	color: 'var(--muted-text)',
	fontStyle: 'italic',
	padding: 'calc(var(--spacing) * 1) calc(var(--spacing) * 2)',
	borderRadius: 'var(--radius-base)',
	cursor: 'text',
	minHeight: 'calc(var(--spacing) * 6)'
};
export const GRID_HOLDER_LOOK: StyleLook = { pointerEvents: 'none', overflow: 'visible', margin: '0px', padding: '0px' };
export const SELECTED_CELL_LOOK: StyleLook = {
	position: 'absolute',
	top: '0px',
	right: '0px',
	bottom: '0px',
	left: '0px',
	zIndex: '2',
	pointerEvents: 'none',
	backgroundColor: 'var(--editor-selection)'
};

const SIDE_MARGINS: Record<CellAlign, StyleLook> = {
	left: {},
	center: { marginLeft: 'auto', marginRight: 'auto' },
	right: { marginLeft: 'auto' }
};

/** the table element: fixed layout, the width the columns state or the column's; `natural`: the side of one as wide as its cells */
export function gridLook(width: { fixed: boolean; total: number } | null, natural: CellAlign | null, inFloat: boolean): StyleLook {
	return {
		pointerEvents: 'auto',
		tableLayout: 'fixed',
		overflow: 'hidden',
		margin: inFloat ? '0px' : 'calc(var(--spacing) * 4) 0',
		...(natural ? { width: 'auto', ...SIDE_MARGINS[natural] } : {}),
		// a table whose cells state no widths fills the column, as the DOM editor's w-full did
		...(!natural && !width?.fixed ? { width: '100%' } : {}),
		...(width ? { [width.fixed ? 'width' : 'minWidth']: `${width.total}px` } : {})
	};
}

type CellOptions = { printed: boolean; header: boolean; edges: CellEdges | null; guide: boolean };

/** a cell as it prints: its own rules as solid sides, a dashed guide on the others that shows under the pointer or around the caret */
export function cellLook({ printed, header, edges, guide }: CellOptions): StyleLook {
	const base: Record<string, string> = {
		position: 'relative',
		verticalAlign: 'top',
		minWidth: `${DEFAULT_CELL_MIN_WIDTH}px`,
		padding: 'calc(var(--spacing) * 1) calc(var(--spacing) * 2)'
	};
	if (!printed) {
		Object.assign(base, { border: '1px solid var(--color-surface-200-800)', fontWeight: header ? '600' : 'inherit' });
		return base;
	}
	const rules: Record<(typeof SIDES)[number], RuleWeight | null> = {
		Top: edges?.top ?? null,
		Bottom: edges?.bottom ?? null,
		Left: edges?.left ? 'light' : null,
		Right: edges?.right ? 'light' : null
	};
	for (const side of SIDES) {
		const weight = rules[side] && WEIGHTS[rules[side]];
		base[`border${side}Width`] = weight?.width ?? '1px';
		base[`border${side}Style`] = weight?.style ?? 'dashed';
		base[`border${side}Color`] = weight ? RULE : guide ? GUIDE : 'transparent';
	}
	base.fontWeight = 'inherit';
	if (edges?.align) base.textAlign = edges.align;
	return base;
}

/** the guide under the pointer: the sides that print no rule, as the hover delta of a cell */
export function cellHoverLook(edges: CellEdges | null): StyleLook {
	const rules: Record<(typeof SIDES)[number], unknown> = { Top: edges?.top, Bottom: edges?.bottom, Left: edges?.left, Right: edges?.right };
	return Object.fromEntries(SIDES.filter((side) => !rules[side]).map((side) => [`border${side}Color`, GUIDE]));
}
