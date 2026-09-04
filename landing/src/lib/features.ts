// The "more features" grid shared by the home page and the format pages. A function, not a
// constant: the messages resolve per request, so a module-level list would freeze one locale.
import Command from '@lucide/svelte/icons/command';
import FolderTree from '@lucide/svelte/icons/folder-tree';
import GitCommitHorizontal from '@lucide/svelte/icons/git-commit-horizontal';
import History from '@lucide/svelte/icons/history';
import Keyboard from '@lucide/svelte/icons/keyboard';
import Plug from '@lucide/svelte/icons/plug';
import SpellCheck from '@lucide/svelte/icons/spell-check';
import Terminal from '@lucide/svelte/icons/terminal';
import TextCursorInput from '@lucide/svelte/icons/text-cursor-input';
import type { Component } from 'svelte';
import { m } from '$lib/paraglide/messages';

export type Feature = { key: string; icon: Component<{ class?: string; strokeWidth?: number }>; title: string; body: string };

export function featureList(): Feature[] {
	return [
		{ key: 'terminal', icon: Terminal, title: m.feature_terminal_title(), body: m.feature_terminal_body() },
		{ key: 'history', icon: GitCommitHorizontal, title: m.feature_history_title(), body: m.feature_history_body() },
		{ key: 'multifile', icon: FolderTree, title: m.feature_multifile_title(), body: m.feature_multifile_body() },
		{ key: 'palette', icon: Command, title: m.feature_palette_title(), body: m.feature_palette_body() },
		{ key: 'keymaps', icon: Keyboard, title: m.feature_keymaps_title(), body: m.feature_keymaps_body() },
		{ key: 'multicursor', icon: TextCursorInput, title: m.feature_multicursor_title(), body: m.feature_multicursor_body() },
		{ key: 'spellcheck', icon: SpellCheck, title: m.feature_spellcheck_title(), body: m.feature_spellcheck_body() },
		{ key: 'mcp', icon: Plug, title: m.feature_mcp_title(), body: m.feature_mcp_body() },
		{ key: 'tabs', icon: History, title: m.feature_tabs_title(), body: m.feature_tabs_body() }
	];
}
