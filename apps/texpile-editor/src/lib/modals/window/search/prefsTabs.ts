import { m } from '$lib/paraglide/messages';
import type { PrefsSectionId } from './prefsRows';

export type PrefsTab =
	| 'appearance'
	| 'editor'
	| 'latex'
	| 'typst'
	| 'snippets'
	| 'proofing'
	| 'vcs'
	| 'collaboration'
	| 'toolchain'
	| 'integrations'
	| 'startup'
	| 'ai';

type TabDef = { id: PrefsTab; label: () => string; desktopOnly?: true; sections?: PrefsSectionId[] };

export const PREFS_TABS: TabDef[] = [
	{ id: 'appearance', label: () => m.prefs_appearance() },
	{ id: 'editor', label: () => m.prefs_group_editor(), sections: ['source', 'visual'] },
	{ id: 'latex', label: () => m.prefs_group_latex(), sections: ['completion', 'checks', 'folderChecks'] },
	{ id: 'typst', label: () => m.prefs_group_typst() },
	{ id: 'snippets', label: () => m.prefs_group_snippets() },
	// named as the Spelling menu, which leads here
	{ id: 'proofing', label: () => m.prefs_group_proofing(), sections: ['spellFolder', 'spellAll'] },
	{ id: 'vcs', label: () => m.prefs_group_history(), desktopOnly: true, sections: ['git', 'localHistory'] },
	{ id: 'collaboration', label: () => m.prefs_group_collaboration() },
	{ id: 'toolchain', label: () => m.prefs_group_toolchain(), desktopOnly: true },
	{ id: 'integrations', label: () => m.prefs_group_integrations(), desktopOnly: true },
	{ id: 'startup', label: () => m.prefs_group_startup(), desktopOnly: true },
	{ id: 'ai', label: () => m.prefs_group_ai(), desktopOnly: true }
];

/** the browser guest has no toolchain, Zotero, MCP server, folder to reopen or versions of its own */
export function tabUnavailable(tab: TabDef): boolean {
	return __WEB__ && tab.desktopOnly === true;
}

export function tabLabel(id: PrefsTab): string {
	return PREFS_TABS.find((t) => t.id === id)!.label();
}
