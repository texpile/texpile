// Texpile's side-panel fields, class for class (drawnChips/panel, table settings), so the inspector is one of its panels

/** a field's name above it */
export const FIELD_LABEL = 'text-muted mb-1.5 text-xs font-semibold';
/** a note under the fields */
export const PANEL_NOTE = 'text-muted px-3 pt-3 text-xs';

export const TEXT_FIELD =
	'border-surface-300-700 rounded-base focus:border-primary-500 h-7 w-full min-w-0 border bg-transparent px-2 text-sm outline-none';
/** a box holding a number and what it is in */
export const NUMBER_BOX = 'border-surface-300-700 rounded-base focus-within:border-primary-500 flex h-7 overflow-hidden border';
export const NUMBER_INPUT = 'min-w-0 flex-1 bg-transparent px-2 text-sm tabular-nums outline-none';
/** a name or unit inside a number box */
export const NUMBER_AFFIX = 'text-muted flex shrink-0 items-center px-2 text-xs';

/** one of a few choices, side by side */
export const SEGMENTS = 'border-surface-300-700 rounded-base flex h-7 overflow-hidden border';
export const PANEL_BUTTON =
	'border-surface-300-700 rounded-base hover:preset-tonal inline-flex h-7 items-center justify-center gap-1.5 border px-2.5 text-xs whitespace-nowrap disabled:pointer-events-none disabled:opacity-40';
/** an on or off setting, as a switch */
export const SWITCH_ROW = 'text-surface-700-300 flex h-7 w-full items-center justify-between gap-2 text-left text-xs';

export function segmentClass(on: boolean) {
	return `border-surface-300-700 min-w-0 flex-auto truncate border-l px-1.5 text-xs first:border-l-0 ${
		on ? 'bg-primary-tint text-primary-ink' : 'text-surface-700-300 hover:preset-tonal'
	}`;
}

export function switchTrack(on: boolean) {
	return `relative h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-primary-500' : 'bg-surface-300-700'}`;
}
export function switchThumb(on: boolean) {
	return `bg-surface-50 absolute top-0.5 left-0.5 size-3 rounded-full transition-transform ${on ? 'translate-x-3' : ''}`;
}
