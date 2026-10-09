// Persisted app settings: userData/settings.json via the native bridge in Electron, localStorage
// in browser dev. New settings also go in the main process DEFAULT_SETTINGS so on-disk defaults
// match.
//
// v1 holds ONLY what earns a place in a machine-global, human-readable file the MAIN process can
// read before a window exists: session restore, locale, MCP, update checks, and deliberate user
// preferences. Everything else moved in the storage restructure - layout memory to
// texpile:layout, personal data to texpile:users, per-folder state to texpile:workspaces, and the
// whole compile surface (command, outputs, toggles) to each folder's .texpile/config.json.
import { browser } from '$lib/runtime';
import { box } from '$lib/runes/box.svelte';
import { setLocale as setParaglideLocale } from '$lib/paraglide/runtime';
import { migrateSettingsObject } from '$lib/migration/settings';
import type { EnglishVariant } from '$lib/editor/spellcheck/config/grammarRules';
import type { SpellLanguage } from '$lib/editor/spellcheck/languages/spellLanguages';

export type AppSettings = {
	/** settings.json's own shape version; absent means pre-restructure and triggers migration */
	v: 1;
	reopenLastFolder: boolean;
	/** Harper spell-check enabled. */
	spellcheck: boolean;
	/** the English that spelling and grammar follow; '' = the system's own */
	englishVariant: '' | EnglishVariant;
	/** the language spelling is checked in when a document names none and its folder chose none */
	spellLanguage: SpellLanguage;
	/** grammar rules the user turned on or off; a rule not here follows its default (grammarRules.ts) */
	grammarRules: Record<string, boolean>;
	/** check the update feed (updates.texpile.com) for a newer version on launch; downloads stay click-only. */
	checkForUpdates: boolean;
	/** let an MCP client (Claude Code, Claude Desktop) read what the editor is showing. Off by
	 * default: connecting also needs a config snippet pasted into the client, so defaulting this on
	 * would open a loopback port for everyone while buying nothing until they act anyway. */
	mcpEnabled: boolean;
	/**
	 * Let a connected MCP client REWRITE the compile command outright.
	 *
	 * Separate from mcpEnabled, and off even when that is on, because it is a different kind of
	 * permission: the compile command is a shell command line, so a client that can set it can run
	 * anything this user can. Everything else the server exposes reads state or moves the window.
	 *
	 * Retargeting the OUTPUT DIRECTORY does not need this - that path goes through
	 * sanitizeOutputDir and can only ever change where the build lands.
	 */
	/** whole-window zoom factor (1 = 100%), applied via webContents.setZoomFactor. */
	uiZoom: number;
	/** the window's grounds let the blurred desktop through. Text and content stay solid. */
	transparentWindow: boolean;
	/** newest changelog version the What's New modal was dismissed for. */
	whatsNewSeen: string;
	/** live math preview tooltip in source mode. */
	mathPreview: boolean;
	/** the floating Comment button offered over a selection, in BOTH editors. */
	commentPill: boolean;
	/** soft-wrap long lines in Source mode instead of scrolling horizontally. */
	sourceLineWrap: boolean;
	/** paragraphs in the visual editor fill the column edge to edge, with words split where that helps. */
	visualJustify: boolean;
	/** long words may split at line ends in justified text. The hyphens are drawn, never written to the file. */
	visualHyphenate: boolean;
	/** formatting, tables and Markdown from other apps are converted on paste; off pastes their plain text */
	smartPaste: boolean;
	/** the Typst preview scrolls to follow the caret. Off by default, as in tinymist. A pane
	 *  behavior about YOUR caret, which is why it stays here and not in the project's config. */
	typstPreviewFollow: boolean;
	/** the Zotero citation picker (Insert menu, palette, topbar). On by default: it only probes
	 *  Zotero when invoked, so leaving it available costs nothing until it is used. */
	zoteroEnabled: boolean;
	/** Cite by DOI or arXiv ID (context menus, palette). On by default: nothing leaves the machine
	 *  until someone looks an ID up, and then only that ID, to doi.org. */
	citeByDoiEnabled: boolean;
	/** modal keybindings for the source editor and code blocks. */
	editorKeymap: 'default' | 'vim' | 'emacs';
	/** UI display language. Not the LaTeX document language (see DocumentLanguage). */
	uiLocale: 'en' | 'zh-Hans' | 'zh-Hant' | 'de' | 'pt-BR';
	/** shared-session relay endpoint (ws:// or wss://); the self-hosted-relay escape hatch. */
	collabRelayUrl: string;
	/** folders open across windows; maintained by the MAIN process for session restore.
	 *  read-only here: renderers never write it. */
	openFolders: string[];
	/** MCP port override (0 = channel default); a hand-edit escape hatch for port clashes. */
	mcpPort: number;
	/** the agent Refine runs, alone in the list; empty or null = none chosen yet. Main reads it, see electron/src/ai */
	refineAgents: ('claude' | 'codex' | 'agy' | 'custom')[] | null;
	/** the command line for Refine's custom agent; the prompt goes on its stdin */
	aiAgentCommand: string;
	/** each preset agent's --model for Refine, one of the ids it lists; missing or '' = its own default */
	aiAgentModels: Record<string, string>;
	/** the agent the dock's Agent tab talks to over ACP, of those it offers; '' until one is picked. Main reads it, see
	 *  electron/src/ai/acp */
	agentPanel: '' | 'codex' | 'claude' | 'opencode' | 'copilot' | 'gemini' | 'custom';
	/** the agents the Agent tab's menu offers; null = the ones installed, [] = the tab turned off */
	agentPanelAgents: ('codex' | 'claude' | 'opencode' | 'copilot' | 'gemini' | 'custom')[] | null;
	/** the command line when agentPanel is 'custom'; it speaks ACP on its input and output */
	agentPanelCommand: string;
	/** folders searched before PATH; per machine, so never in a project's config */
	toolDirs: string[];
	/** look for co-authors' new versions every few minutes while the window is in front (VS Code's
	 *  git.autofetch, on by default here: a writer's conflicts come from editing before a Sync) */
	checkForNewVersions: boolean;
	/** Local History: a copy of each file as it is saved, kept in the app's data. On by default: it
	 *  is the only way back to text written since the last version, and costs nothing until needed. */
	localHistory: boolean;
};

/** default compile command. -cd runs the compile in the main file's own directory, so a main file in
 *  a subfolder resolves its \input siblings (TeX resolves those against the working directory, and
 *  the terminal's is the workspace root); it is a no-op when the main file is at the root.
 *  -interaction=nonstopmode keeps errors from parking the engine at its interactive prompt;
 *  -synctex=1 enables source<->PDF sync; -file-line-error gives file:line attribution. */
export const DEFAULT_COMPILE_COMMAND =
	'latexmk -cd -lualatex -interaction=nonstopmode -file-line-error -synctex=1 -output-directory=output {main}';

/** the hosted blind relay; users can point at their own, and the share/join dialogs reset to this */
export const DEFAULT_COLLAB_RELAY_URL = 'wss://collab.texpile.com';

const DEFAULTS: AppSettings = {
	v: 1,
	reopenLastFolder: true,
	spellcheck: false,
	englishVariant: '',
	spellLanguage: 'en',
	grammarRules: {},
	checkForUpdates: true,
	mcpEnabled: false,
	uiZoom: 1,
	transparentWindow: false,
	whatsNewSeen: '',
	mathPreview: true,
	commentPill: true,
	sourceLineWrap: true,
	visualJustify: true,
	visualHyphenate: true,
	smartPaste: true,
	typstPreviewFollow: false,
	zoteroEnabled: true,
	citeByDoiEnabled: true,
	editorKeymap: 'default',
	uiLocale: 'en',
	collabRelayUrl: DEFAULT_COLLAB_RELAY_URL,
	openFolders: [],
	mcpPort: 0,
	refineAgents: null,
	aiAgentCommand: '',
	aiAgentModels: {},
	agentPanel: '',
	agentPanelAgents: null,
	agentPanelCommand: '',
	toolDirs: [],
	checkForNewVersions: true,
	localHistory: true
};

const LS_KEY = 'texpile:settings';

type NativeSettings = {
	/** the settings main already had when it made this window; saves a round trip before mount */
	bootstrap?: { settings?: Record<string, unknown> };
	getSettings?: () => Promise<Partial<AppSettings>>;
	setSettings?: (partial: Partial<AppSettings>) => Promise<AppSettings>;
	replaceSettings?: (full: Record<string, unknown>) => Promise<void>;
};
function nativeBridge(): NativeSettings | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: NativeSettings }).texpileNative;
}

/** reactive global settings; defaults until loadSettings() hydrates it. */
export const settings = box<AppSettings>({ ...DEFAULTS });

// memoize the load promise, not a boolean: every caller awaits the same hydration.
// a flag flipped before the await let early callers read stale defaults.
let loadPromise: Promise<AppSettings> | null = null;

/** hydrates settings from disk (Electron) or localStorage. idempotent. */
export function loadSettings(): Promise<AppSettings> {
	if (loadPromise) return loadPromise;
	loadPromise = (async () => {
		let raw: Record<string, unknown> = {};
		const n = nativeBridge();
		const snapshot = n?.bootstrap?.settings;
		if (snapshot && Object.keys(snapshot).length) {
			raw = snapshot;
		} else if (n?.getSettings) {
			try {
				raw = (await n.getSettings()) as Record<string, unknown>;
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
		// pre-restructure settings migrate here, in the ONE place settings hydrate: the slimmed
		// object replaces the file whole (merge-writes cannot delete keys), and this run continues
		// on the migrated shape.
		const migrated = migrateSettingsObject(raw);
		if (migrated) {
			raw = migrated;
			if (n?.replaceSettings) n.replaceSettings(migrated).catch(() => {});
			else if (browser) {
				try {
					localStorage.setItem(LS_KEY, JSON.stringify(migrated));
				} catch {
					/* ignore */
				}
			}
		}
		const merged = { ...DEFAULTS, ...(raw as Partial<AppSettings>), v: 1 as const };
		settings.current = merged;
		// reload:false: this runs before main.ts mounts the app, so nothing has rendered
		// the base locale yet and there's nothing to correct with a reload.
		applyUiLocale(merged.uiLocale, { reload: false });
		return merged;
	})();
	return loadPromise;
}

/** syncs Paraglide's runtime locale and <html lang> to match a uiLocale value. reload defaults
 *  to true (Paraglide's default): none of the app's message() calls are reactive in place, so
 *  a locale switch after the app has already rendered needs a full reload to take effect. */
export function applyUiLocale(locale: AppSettings['uiLocale'], opts?: { reload?: boolean }): void {
	if (typeof document !== 'undefined') document.documentElement.lang = locale;
	setParaglideLocale(locale, opts);
}

/** back-compat alias used by the start screen. */
export async function getSettings(): Promise<AppSettings> {
	return loadSettings();
}

// send ONLY the changed fields: the main process merges them into settings.json, so two
// windows writing different settings can't clobber each other's fields with stale copies
function persist(patch: Partial<AppSettings>): void {
	const n = nativeBridge();
	if (n?.setSettings) {
		n.setSettings(patch).catch(() => {});
		return;
	}
	if (browser) {
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(settings.current));
		} catch {
			/* ignore */
		}
	}
}

/** merges a partial update into the global settings and persists it immediately. */
export function updateSettings(partial: Partial<AppSettings>): void {
	settings.current = { ...settings.current, ...partial };
	persist(partial);
}

/** updateSettings, resolved once main has taken the change, for a setting main itself acts on */
export async function updateSettingsSettled(partial: Partial<AppSettings>): Promise<void> {
	settings.current = { ...settings.current, ...partial };
	const n = nativeBridge();
	if (n?.setSettings) await n.setSettings(partial).catch(() => {});
	else persist(partial);
}

/**
 * Deliberately NOT routed through updateSettings: flipping this also has to start or stop the
 * loopback MCP server, which only the main process can do, and main persists the setting itself as
 * part of that. Writing it here too would just race main's own write.
 *
 * Applied optimistically so the switch responds, and rolled back if main could not bind the port.
 */
export async function setMcpEnabled(enabled: boolean): Promise<void> {
	const api = (window as unknown as { texpileNative?: { mcpSetEnabled?: (v: boolean) => Promise<unknown> } }).texpileNative;
	const before = settings.current.mcpEnabled;
	settings.current = { ...settings.current, mcpEnabled: enabled };
	try {
		await api?.mcpSetEnabled?.(enabled);
	} catch (e) {
		console.error('Failed to change AI assistant access:', e);
		settings.current = { ...settings.current, mcpEnabled: before };
	}
}

// hydrate at module load so the store holds real values before any UI writes
if (browser) void loadSettings();
