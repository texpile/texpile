// What the Ctrl+K palette can run.
//
// Every entry delegates to a workspace action that already exists and is already reachable from a
// menu or a shortcut. The palette is a faster way in, not a second implementation - so a command
// that stops working here is a command that stopped working everywhere, which is the point.
//
// Rebuilt on each open (not memoized): labels depend on live state - "Show terminal" vs "Hide
// terminal", which view mode is already active - and an open palette is not a hot path.
import type { Component } from 'svelte';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import { compileItems } from './paletteCompileItems';
import { viewItems } from './paletteViewItems';
import { editorItems } from './paletteEditorItems';
import { fileItems } from './paletteFileItems';

export type PaletteItem = {
	id: string;
	label: string;
	group: string;
	/** matched against but never shown, so "build" can find Compile */
	keywords?: string;
	/** right-aligned: a shortcut, or a path for a file entry */
	hint?: string;
	icon?: Component;
	/** a file entry: drawn with the explorer's icon for this name instead of `icon` */
	fileName?: string;
	/** never listed in the empty-query browse view; typing is the only way to reach it.
	 *  For diagnostics: present enough for support to say "press Ctrl+K, type dev",
	 *  invisible enough that browsing users never meet a debugger. */
	searchOnly?: boolean;
	run(): void;
};

/** the action commands, in the order they appear when nothing has been typed */
export function buildCommands(a: PaletteActions): PaletteItem[] {
	return [...compileItems(a), ...viewItems(a), ...editorItems(a), ...fileItems(a)];
}
