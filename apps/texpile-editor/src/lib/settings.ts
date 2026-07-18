// persisted app settings: userData/settings.json via the native bridge in Electron, localStorage in
// browser dev. new settings also go in the main process DEFAULT_SETTINGS so on-disk defaults match.
import { browser } from '$lib/runtime';
import { writable, get } from 'svelte/store';

export interface AppSettings {
	reopenLastFolder: boolean;
	/** autosave edits (debounced); when off the user is warned before switching files. */
	autosave: boolean;
	lastFolder: string | null;
	sidebarOpen: boolean;
	sidebarWidth: number;
	/** Harper spell-check enabled. */
	spellcheck: boolean;
	/** custom spell-check dictionary (words to ignore). */
	dictionary: string[];
	/** table-of-contents share of the sidebar height (0..1). */
	tocFraction: number;
	/** LaTeX compile command run in the terminal; {main} expands to the main file. */
	compileCommand: string;
	/** append a marker echo after the compile command to detect when it finishes. */
	compileSentinel: boolean;
	terminalVisible: boolean;
	terminalHeight: number;
	pdfPaneWidth: number;
	pdfPaneOpen: boolean;
	/** image resize snap step as a fraction of \textwidth (0.25 = 25/50/75/100%). */
	figureResizeStep: number;
	/** render PDF pages inverted in dark mode. */
	pdfDarkPages: boolean;
	/** Draft mode: preview via the incremental per-page engine extractor instead of the
	 *  terminal compile command. Requires lualatex. */
	draftMode: boolean;
	/** check the update feed (updates.texpile.com) for a newer version on launch; downloads stay click-only. */
	checkForUpdates: boolean;
	/** whole-window zoom factor (1 = 100%), applied via webContents.setZoomFactor. */
	uiZoom: number;
	/** newest changelog version the What's New modal was dismissed for. */
	whatsNewSeen: string;
	/** live math preview tooltip in source mode. */
	mathPreview: boolean;
}

/** default compile command. -interaction=nonstopmode keeps errors from parking the engine at its
 *  interactive prompt; -synctex=1 enables source<->PDF sync; -file-line-error gives file:line attribution. */
export const DEFAULT_COMPILE_COMMAND =
	'latexmk -lualatex -interaction=nonstopmode -file-line-error -synctex=1 -output-directory=output {main}';

const DEFAULTS: AppSettings = {
	reopenLastFolder: true,
	autosave: true,
	lastFolder: null,
	sidebarOpen: true,
	sidebarWidth: 256,
	spellcheck: false,
	dictionary: [],
	tocFraction: 0.5,
	compileCommand: DEFAULT_COMPILE_COMMAND,
	compileSentinel: true,
	terminalVisible: false,
	terminalHeight: 240,
	pdfPaneWidth: 480,
	pdfPaneOpen: false,
	figureResizeStep: 0.25,
	pdfDarkPages: true,
	draftMode: false,
	checkForUpdates: true,
	uiZoom: 1,
	whatsNewSeen: '',
	mathPreview: true
};

const LS_KEY = 'texpile:settings';

interface NativeSettings {
	getSettings?: () => Promise<Partial<AppSettings>>;
	setSettings?: (partial: Partial<AppSettings>) => Promise<AppSettings>;
}
function native(): NativeSettings | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: NativeSettings }).texpileNative;
}

/** reactive global settings; defaults until loadSettings() hydrates it. */
export const settings = writable<AppSettings>({ ...DEFAULTS });

// memoize the load promise, not a boolean: every caller awaits the same hydration.
// a flag flipped before the await let early callers read stale defaults.
let loadPromise: Promise<AppSettings> | null = null;

/** hydrates settings from disk (Electron) or localStorage. idempotent. */
export function loadSettings(): Promise<AppSettings> {
	if (loadPromise) return loadPromise;
	loadPromise = (async () => {
		let raw: Partial<AppSettings> = {};
		const n = native();
		if (n?.getSettings) {
			try {
				raw = await n.getSettings();
			} catch {
				/* fall back to defaults */
			}
		} else if (browser) {
			try {
				raw = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
			} catch {
				/* ignore malformed json */
			}
		}
		const merged = { ...DEFAULTS, ...raw };
		settings.set(merged);
		return merged;
	})();
	return loadPromise;
}

/** back-compat alias used by the start screen. */
export async function getSettings(): Promise<AppSettings> {
	return loadSettings();
}

function persist(next: AppSettings): void {
	const n = native();
	if (n?.setSettings) {
		n.setSettings(next).catch(() => {});
		return;
	}
	if (browser) {
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(next));
		} catch {
			/* ignore */
		}
	}
}

/** merges a partial update into the global settings and persists it immediately. */
export function updateSettings(partial: Partial<AppSettings>): void {
	const next = { ...get(settings), ...partial };
	settings.set(next);
	persist(next);
}

// hydrate at module load so the store holds real values before any UI writes,
// otherwise a saved lastFolder gets clobbered with defaults
if (browser) void loadSettings();
