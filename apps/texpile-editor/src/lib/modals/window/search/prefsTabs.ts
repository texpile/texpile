import { m } from '$lib/paraglide/messages';

export type PrefsTab =
	'appearance' | 'editor' | 'snippets' | 'proofing' | 'vcs' | 'collaboration' | 'toolchain' | 'integrations' | 'startup' | 'ai';

export type EditorSub = 'general' | 'latex' | 'typst';

type TabDef = { id: PrefsTab; label: () => string; desktopOnly?: true };

export const PREFS_TABS: TabDef[] = [
	{ id: 'appearance', label: () => m.prefs_appearance() },
	{ id: 'editor', label: () => m.prefs_group_editor() },
	{ id: 'snippets', label: () => m.prefs_group_snippets() },
	// named as the Spelling menu, which leads here
	{ id: 'proofing', label: () => m.prefs_group_proofing() },
	{ id: 'vcs', label: () => m.prefs_group_history(), desktopOnly: true },
	{ id: 'collaboration', label: () => m.prefs_group_collaboration() },
	{ id: 'toolchain', label: () => m.prefs_group_toolchain(), desktopOnly: true },
	{ id: 'integrations', label: () => m.prefs_group_integrations(), desktopOnly: true },
	{ id: 'startup', label: () => m.prefs_group_startup(), desktopOnly: true },
	{ id: 'ai', label: () => m.prefs_group_ai(), desktopOnly: true }
];

export const EDITOR_SUBS: { id: EditorSub; label: () => string }[] = [
	{ id: 'general', label: () => m.prefs_editor_general() },
	{ id: 'latex', label: () => m.prefs_group_latex() },
	{ id: 'typst', label: () => m.prefs_group_typst() }
];

/** the browser guest has no toolchain, Zotero, MCP server, folder to reopen or versions of its own */
export function tabUnavailable(tab: TabDef): boolean {
	return __WEB__ && tab.desktopOnly === true;
}

export function tabLabel(id: PrefsTab): string {
	return PREFS_TABS.find((t) => t.id === id)!.label();
}

export function editorSubLabel(id: EditorSub): string {
	return EDITOR_SUBS.find((s) => s.id === id)!.label();
}
