// settings.json and its IPC surface.
//
// v1: settings.json holds only machine/app configuration - what MAIN reads before a window
// exists, plus deliberate user preferences. Layout memory, personal data and per-folder state
// live in the renderer's versioned localStorage blobs; the compile surface lives in each
// folder's .texpile/config.json. The renderer migrates pre-restructure files on first load
// (see src/lib/migration) and replaces this file whole via settings:replace.
import { app, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_SETTINGS = {
	v: 1,
	reopenLastFolder: true,
	autosave: true, // off = manual save, warn before switching files
	spellcheck: false,
	checkForUpdates: true,
	uiZoom: 1, // whole-window zoom factor (webContents.setZoomFactor); the View menu adjusts it
	mathPreview: true, // live math preview tooltip in source mode
	sourceLineWrap: true, // soft-wrap long lines in Source mode
	visualMaxWidth: 768, // widest the visual editor's text column may grow, in px
	typstPreviewFollow: false,
	editorKeymap: 'default', // modal keybindings for the source editor: 'default' | 'vim' | 'emacs'
	uiLocale: 'en', // UI display language, not the LaTeX document language. Overridden per-read by
	// the detected system language until the user picks one; see systemUiLocale + readSettings.
	collabRelayUrl: 'wss://collab.texpile.com', // shared-session relay endpoint
	// Let an MCP client (Claude Code, Claude Desktop) see what the editor is showing. Off by
	// default: connecting also requires pasting a config snippet into the client, so defaulting this
	// on would open a loopback port for everyone while buying nothing until they act anyway.
	mcpEnabled: false,
	// Whether a connected client may rewrite the compile command, which is a shell command line and
	// so amounts to running anything this user can. A separate permission from mcpEnabled, and off
	// even when that is on; retargeting only the output DIRECTORY does not need it.
	mcpAllowCompileCommand: false,
	// 0 = use the channel default (mcp.PORT_DEFAULT / PORT_DEFAULT_DEV). Fixed rather than
	// ephemeral so a client config keeps working across restarts; overridable for a port clash.
	mcpPort: 0,
	openFolders: [] as string[] // folders open across windows; maintained here for session restore
};

// The UI languages we ship. Anything else, or a failed probe, falls back to English.
type UiLocale = 'en' | 'de' | 'zh-Hans' | 'zh-Hant' | 'pt-BR';
let cachedLocale: UiLocale | null = null;
/** first-run UI language from the OS. A stored uiLocale always wins (readSettings' merge order),
 *  so a deliberate choice is never overridden on a later launch. */
function systemUiLocale(): UiLocale {
	if (cachedLocale) return cachedLocale;
	let tags: string[] = [];
	try {
		// preferred-languages is in OS preference order; getLocale is the single-value fallback
		tags = app.getPreferredSystemLanguages?.() ?? [];
		if (!tags.length) tags = [app.getLocale()];
	} catch {
		/* both throw before app-ready on some platforms; stay unset and retry on the next read */
	}
	if (!tags.length) return 'en'; // uncached: this was a failed probe, not a real answer
	for (const raw of tags) {
		const tag = raw.toLowerCase();
		if (tag.startsWith('de')) return (cachedLocale = 'de');
		// the only Portuguese we ship, so pt-PT lands here rather than in English
		if (tag.startsWith('pt')) return (cachedLocale = 'pt-BR');
		// an explicit script subtag wins over region: zh-Hans-HK is Simplified despite the HK region.
		// Only when no script is present do TW/HK/MO imply Traditional; everything else is Simplified.
		if (tag.startsWith('zh')) {
			const hant = /hant/.test(tag) || (!/hans/.test(tag) && /-(tw|hk|mo)\b/.test(tag));
			return (cachedLocale = hant ? 'zh-Hant' : 'zh-Hans');
		}
		if (tag.startsWith('en')) return (cachedLocale = 'en');
		// unsupported language: keep looking, the user's next preference may be one we ship
	}
	return (cachedLocale = 'en');
}

function settingsFile(): string {
	return path.join(app.getPath('userData'), 'settings.json');
}

function storedSettings(): Record<string, unknown> {
	try {
		// tolerate a UTF-8 BOM (an externally-edited file): JSON.parse rejects it, and the silent
		// catch below would then reset EVERY setting to defaults
		return JSON.parse(fs.readFileSync(settingsFile(), 'utf8').replace(/^\uFEFF/, '')) as Record<string, unknown>;
	} catch {
		return {}; // no file yet (genuine first run) or unreadable: fall back to defaults + detection
	}
}

export function readSettings(): Record<string, unknown> {
	// detected system language fills in only until a stored/chosen uiLocale wins (spread order)
	return { ...DEFAULT_SETTINGS, uiLocale: systemUiLocale(), ...storedSettings() };
}

export function writeSettings(partial: Record<string, unknown> | undefined): Record<string, unknown> {
	const stored = storedSettings();
	const next: Record<string, unknown> = { ...DEFAULT_SETTINGS, ...stored, ...(partial || {}) };
	// never freeze the auto-detected language into the file: only a previously stored value or a
	// deliberate change (uiLocale in `partial`, from Preferences) persists, so an incidental write
	// like remembering open folders won't stop the app from following the OS language.
	if (!('uiLocale' in stored) && !(partial && 'uiLocale' in partial)) delete next.uiLocale;
	try {
		fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2));
	} catch (e) {
		console.error('Failed to write settings:', e);
	}
	// hand back the effective settings (with detection applied) so callers see a complete object
	return { ...DEFAULT_SETTINGS, uiLocale: systemUiLocale(), ...next };
}

/** write exactly what was given, no merge: the migration's deletions must stick. An object that
 *  carries no uiLocale stays without one, so OS-language detection keeps working (writeSettings'
 *  rule, preserved here by NOT spreading defaults in). */
function replaceSettings(full: Record<string, unknown>): void {
	try {
		fs.writeFileSync(settingsFile(), JSON.stringify(full, null, 2));
	} catch (e) {
		console.error('Failed to replace settings:', e);
	}
}

export function registerSettingsIpc(): void {
	ipcMain.handle('settings:get', () => readSettings());
	ipcMain.handle('settings:set', (_e, partial: Record<string, unknown>) => writeSettings(partial));
	// replace the file WHOLE - the migration's write. Merge-writes cannot delete keys, and deleting
	// keys is most of what a migration does.
	ipcMain.handle('settings:replace', (_e, full: Record<string, unknown>) => {
		if (typeof full !== 'object' || full === null || Array.isArray(full)) return;
		replaceSettings(full);
	});
}
