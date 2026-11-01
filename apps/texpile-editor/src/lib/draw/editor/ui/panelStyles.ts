export const FIELD_LABEL = 'text-muted mb-1.5 text-xs font-semibold';
export const PANEL_NOTE = 'text-muted px-3 pt-3 text-xs';

export const TEXT_FIELD =
	'border-surface-300-700 rounded-base focus:border-primary-500 h-7 w-full min-w-0 border bg-transparent px-2 text-sm outline-none';
export const NUMBER_BOX = 'border-surface-300-700 rounded-base focus-within:border-primary-500 flex h-7 overflow-hidden border';
export const NUMBER_INPUT = 'min-w-0 flex-1 bg-transparent px-2 text-sm tabular-nums outline-none';
export const NUMBER_AFFIX = 'text-muted flex shrink-0 items-center px-2 text-xs';

export const SEGMENTS = 'border-surface-300-700 rounded-base flex h-7 overflow-hidden border';
export const PANEL_BUTTON =
	'border-surface-300-700 rounded-base hover:preset-tonal inline-flex h-7 items-center justify-center gap-1.5 border px-2.5 text-xs whitespace-nowrap disabled:pointer-events-none disabled:opacity-40';
export const CANVAS_PILL = 'bg-surface-50-950 border-surface-200-800 rounded-container flex items-center gap-0.5 border p-0.5 shadow-lg';
export const CANVAS_TEXT_BUTTON =
	'rounded-base hover:preset-tonal flex h-7 shrink-0 items-center gap-1 px-2 text-xs whitespace-nowrap transition-colors';
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
