// texpile:layout - every piece of layout/appearance memory, one versioned blob.
//
// These were once spread over five bare localStorage keys and seven settings.json fields; the
// split followed which era of the code wrote them, not any rule. The rule now: layout memory is
// renderer-only and losable (a cleared blob costs a sidebar width, nothing more), so it lives in
// localStorage - settings.json stays for what the MAIN process reads or a human might hand-edit.
//
// Reactive via one svelte store so consumers (the PDF viewer's dark-pages filter, the theme) can
// react to Preferences changes; writes are whole-blob and synchronous.
//
// NOTE: app.html's pre-paint script reads this key directly (theme, to avoid a flash); keep the
// `theme` field's name and values in step with it.

import { box } from '$lib/runes/box.svelte';

export type LayoutState = {
	v: 1;
	/** appearance choice; `resolvedMode` in lib/theme.ts turns 'system' into light/dark */
	theme: 'light' | 'dark' | 'system';
	/** the Skeleton theme on <html data-theme>: 'theme' is the bundled default, a preset name loads
	 *  /themes/<name>.css */
	themeName: string;
	viewMode: 'visual' | 'source' | 'diff';
	diffLayout: 'unified' | 'split';
	sidebarOpen: boolean;
	sidebarWidth: number;
	/** table-of-contents share of the sidebar height (0..1) */
	tocFraction: number;
	/** the timeline's share of the source control panel (0..1) */
	historyFraction: number;
	pdfPaneOpen: boolean;
	/** preview width as a fraction of window width, so it stays proportional across resizes */
	pdfPaneFraction: number;
	terminalVisible: boolean;
	terminalHeight: number;
	terminalShrink: boolean;
	/** render PDF pages inverted in dark mode */
	pdfDarkPages: boolean;
	/** editor text zoom (1 = 100%); distinct from settings.uiZoom, the whole-window factor */
	editorZoom: number;
	/** render the editor in a paper-like container */
	pageView: boolean;
	previewVisible: boolean;
};

const KEY = 'texpile:layout';

const DEFAULTS: LayoutState = {
	v: 1,
	theme: 'system',
	themeName: 'theme',
	viewMode: 'visual',
	diffLayout: 'unified',
	sidebarOpen: true,
	sidebarWidth: 256,
	tocFraction: 0.5,
	historyFraction: 0.5,
	pdfPaneOpen: false,
	pdfPaneFraction: 0.4,
	terminalVisible: false,
	terminalHeight: 240,
	terminalShrink: false,
	pdfDarkPages: true,
	editorZoom: 1,
	pageView: false,
	previewVisible: true
};

function read(): LayoutState {
	if (typeof localStorage === 'undefined') return { ...DEFAULTS };
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<LayoutState> | null;
		if (raw && raw.v === 1) return { ...DEFAULTS, ...raw, v: 1 };
	} catch {
		/* corrupted: defaults - nothing here is worth failing over */
	}
	return { ...DEFAULTS };
}

/** reactive layout state, hydrated synchronously at module load. */
export const layout = box<LayoutState>(read());

/** merge a partial update and persist it. */
export function updateLayout(partial: Partial<Omit<LayoutState, 'v'>>): void {
	const next = { ...layout.current, ...partial, v: 1 as const };
	layout.current = next;
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		/* quota or storage disabled */
	}
}
