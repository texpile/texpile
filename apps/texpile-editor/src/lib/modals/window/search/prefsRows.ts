// Every setting row in Preferences: where it lives and what it says. The panels render their rows from here and search
// reads the same list, so a row cannot be on screen without being searchable.
import { m } from '$lib/paraglide/messages';
import { settings } from '$lib/settings';
import { isDesktop } from '$lib/workspace/fileSystem';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { canKeepLocalHistory } from '$lib/workspace/localHistory/localHistory.svelte';
import { openSpelling } from '$lib/editor/spellcheck/languages/folderLanguageMenu';
import { LATEX_CHECK_IDS, type LatexCheckId } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { checkName, checkNote } from '$lib/languages/latex/intellisense/checks/checkTexts';
import type { PrefsTab } from './prefsTabs';

const SECTIONS = {
	source: () => m.prefs_group_source(),
	visual: () => m.prefs_group_visual(),
	completion: () => m.prefs_group_completion(),
	checks: () => m.prefs_group_checks(),
	folderChecks: () => m.prefs_checks_this_folder(),
	packages: () => m.prefs_group_packages(),
	spellFolder: () => m.prefs_spell_this_folder(),
	spellAll: () => m.prefs_spell_all_folders(),
	git: () => m.prefs_group_git(),
	localHistory: () => m.prefs_group_local_history()
} satisfies Record<string, () => string>;

export type PrefsSectionId = keyof typeof SECTIONS;

export function sectionLabel(id: PrefsSectionId): string {
	return SECTIONS[id]();
}

/** a section is on screen while one of its rows is */
export function sectionShown(tab: PrefsTab, id: PrefsSectionId): boolean {
	return PREFS_ROWS.some((r) => r.tab === tab && r.section === id && (r.shown?.() ?? true));
}

export type PrefsRowDef = {
	id: string;
	tab: PrefsTab;
	section?: PrefsSectionId;
	label: () => string;
	note?: () => string;
	/** false while the row is not on screen, so search does not offer it */
	shown?: () => boolean;
};

function hasFolder(): boolean {
	return !!workspaceRoot.current;
}

function grammarShown(): boolean {
	return settings.current.spellLanguage === 'en' || openSpelling.current?.choice.language === 'en';
}

const STATIC_ROWS = [
	{ id: 'appearance-mode', tab: 'appearance', label: () => m.prefs_mode(), note: () => m.prefs_appearance_hint() },
	{ id: 'appearance-theme', tab: 'appearance', label: () => m.prefs_theme() },
	{ id: 'window-transparency', tab: 'appearance', label: () => m.prefs_window_transparency() },
	{ id: 'ui-language', tab: 'appearance', label: () => m.prefs_language() },

	{ id: 'comment-pill', tab: 'editor', label: () => m.prefs_comment_pill(), note: () => m.prefs_comment_pill_note() },
	{ id: 'smart-paste', tab: 'editor', label: () => m.prefs_smart_paste(), note: () => m.prefs_smart_paste_note() },
	{ id: 'keybindings', tab: 'editor', label: () => m.prefs_keybindings(), note: () => m.prefs_keybindings_note() },
	{
		id: 'source-line-wrap',
		tab: 'editor',
		section: 'source',
		label: () => m.prefs_source_line_wrap(),
		note: () => m.prefs_source_line_wrap_note()
	},
	{
		id: 'math-preview',
		tab: 'editor',
		section: 'source',
		label: () => m.prefs_math_preview(),
		note: () => m.prefs_math_preview_note()
	},
	{
		id: 'auto-fraction',
		tab: 'editor',
		section: 'source',
		label: () => m.prefs_auto_fraction(),
		note: () => m.prefs_auto_fraction_note()
	},
	{ id: 'tab-out', tab: 'editor', section: 'source', label: () => m.prefs_tab_out(), note: () => m.prefs_tab_out_note() },
	{
		id: 'matrix-keys',
		tab: 'editor',
		section: 'source',
		label: () => m.prefs_matrix_keys(),
		note: () => m.prefs_matrix_keys_note()
	},
	{
		id: 'visual-justify',
		tab: 'editor',
		section: 'visual',
		label: () => m.prefs_visual_justify(),
		note: () => m.prefs_visual_justify_note()
	},
	{
		id: 'visual-hyphenate',
		tab: 'editor',
		section: 'visual',
		label: () => m.prefs_visual_hyphenate(),
		note: () => m.prefs_visual_hyphenate_note()
	},

	{
		id: 'completion-by-mode',
		tab: 'latex',
		section: 'completion',
		label: () => m.prefs_completion_by_mode(),
		note: () => m.prefs_completion_by_mode_note()
	},
	{
		id: 'argument-hints',
		tab: 'latex',
		section: 'completion',
		label: () => m.prefs_argument_hints(),
		note: () => m.prefs_argument_hints_note()
	},
	{
		id: 'package-files',
		tab: 'latex',
		section: 'completion',
		label: () => m.prefs_group_packages(),
		note: () => m.prefs_packages_note()
	},
	{
		id: 'package-files-global',
		tab: 'latex',
		section: 'packages',
		label: () => m.prefs_packages_global(),
		note: () => m.prefs_packages_global_note(),
		shown: isDesktop
	},
	{
		id: 'package-files-folder',
		tab: 'latex',
		section: 'packages',
		label: () => m.prefs_packages_folder(),
		note: () => m.prefs_packages_folder_note(),
		shown: hasFolder
	},
	{
		id: 'package-files-new',
		tab: 'latex',
		section: 'packages',
		label: () => m.prefs_packages_new(),
		note: () => m.prefs_packages_new_note(),
		shown: hasFolder
	},

	{
		id: 'typst-preview-follow',
		tab: 'typst',
		label: () => m.prefs_typst_preview_follow(),
		note: () => m.prefs_typst_preview_follow_note()
	},

	{ id: 'snippets-folder', tab: 'snippets', label: () => m.prefs_snippets_project(), note: () => m.prefs_snippets_project_note() },
	{ id: 'snippets-global', tab: 'snippets', label: () => m.prefs_snippets_global(), note: () => m.prefs_snippets_global_note() },

	{ id: 'spellcheck', tab: 'proofing', label: () => m.prefs_spellcheck() },
	{
		id: 'folder-language',
		tab: 'proofing',
		section: 'spellFolder',
		label: () => m.prefs_folder_language(),
		note: () => m.prefs_folder_language_note()
	},
	{
		id: 'spell-language',
		tab: 'proofing',
		section: 'spellAll',
		label: () => m.prefs_spell_language(),
		note: () => m.prefs_spell_language_note()
	},
	{
		id: 'english-variant',
		tab: 'proofing',
		section: 'spellAll',
		label: () => m.prefs_english_variant(),
		note: () => m.prefs_english_variant_note()
	},
	{ id: 'dictionary', tab: 'proofing', section: 'spellAll', label: () => m.spelldict_heading(), note: () => m.prefs_dictionary_note() },
	{ id: 'grammar-rules', tab: 'proofing', section: 'spellAll', label: () => m.prefs_grammar_rules(), shown: grammarShown },

	{
		id: 'check-new-versions',
		tab: 'vcs',
		section: 'git',
		label: () => m.prefs_check_new_versions(),
		note: () => m.prefs_check_new_versions_note()
	},
	{
		id: 'git-identity',
		tab: 'vcs',
		section: 'git',
		label: () => m.prefs_collab_git(),
		note: () => m.prefs_collab_git_note(),
		shown: () => isDesktop() && hasFolder()
	},
	{
		id: 'local-history',
		tab: 'vcs',
		section: 'localHistory',
		label: () => m.prefs_local_history(),
		note: () => m.prefs_local_history_note(),
		shown: canKeepLocalHistory
	},
	{
		id: 'local-history-space',
		tab: 'vcs',
		section: 'localHistory',
		label: () => m.prefs_local_history_space(),
		note: () => m.prefs_local_history_clear_note(),
		shown: canKeepLocalHistory
	},

	{ id: 'collab-name', tab: 'collaboration', label: () => m.prefs_collab_name(), note: () => m.prefs_collab_name_note() },

	{ id: 'toolchain-dirs', tab: 'toolchain', label: () => m.prefs_toolchain_dirs(), note: () => m.prefs_toolchain_dirs_hint() },

	{ id: 'zotero', tab: 'integrations', label: () => m.prefs_zotero(), note: () => m.prefs_zotero_note() },
	{ id: 'cite-doi', tab: 'integrations', label: () => m.prefs_cite_doi(), note: () => m.prefs_cite_doi_note() },

	{ id: 'reopen-last-folder', tab: 'startup', label: () => m.prefs_reopen_last_folder() },
	{ id: 'check-updates', tab: 'startup', label: () => m.prefs_check_updates() },

	{ id: 'ai-off', tab: 'ai', label: () => m.prefs_ai_off(), note: () => m.prefs_ai_off_note() },
	{ id: 'mcp', tab: 'ai', label: () => m.prefs_mcp(), note: () => m.prefs_mcp_note() },
	{ id: 'ai-agent', tab: 'ai', label: () => m.prefs_ai_agent(), note: () => m.prefs_ai_agent_note() },
	{ id: 'agent-panel', tab: 'ai', label: () => m.prefs_agent_panel(), note: () => m.prefs_agent_panel_note() }
] as const satisfies readonly PrefsRowDef[];

export type PrefsRowId = (typeof STATIC_ROWS)[number]['id'] | `latex-check-${LatexCheckId}` | `folder-check-${LatexCheckId}`;

export function latexCheckRowId(id: LatexCheckId): PrefsRowId {
	return `latex-check-${id}`;
}

export function folderCheckRowId(id: LatexCheckId): PrefsRowId {
	return `folder-check-${id}`;
}

/** the checks follow the completion switches in LaTeX, and the folder's choices follow them */
const CHECK_ROWS: PrefsRowDef[] = LATEX_CHECK_IDS.flatMap((id) => [
	{
		id: latexCheckRowId(id),
		tab: 'latex' as const,
		section: 'checks' as const,
		label: () => checkName(id),
		note: () => checkNote(id)
	},
	{
		id: folderCheckRowId(id),
		tab: 'latex' as const,
		section: 'folderChecks' as const,
		label: () => checkName(id),
		shown: hasFolder
	}
]);

const LATEX_AT = STATIC_ROWS.findIndex((r) => r.id === 'package-files-global');

export const PREFS_ROWS: readonly PrefsRowDef[] = [...STATIC_ROWS.slice(0, LATEX_AT), ...CHECK_ROWS, ...STATIC_ROWS.slice(LATEX_AT)];

const BY_ID = new Map(PREFS_ROWS.map((r) => [r.id, r]));

export function rowDef(id: PrefsRowId): PrefsRowDef {
	const def = BY_ID.get(id);
	if (!def) throw new Error(`Preferences row ${id} is not registered`);
	return def;
}
