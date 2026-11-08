// What the Ctrl+K palette can run: every command in the catalog that can run here now, with its key beside it, and the
// package file rows. Rebuilt on each open: labels read live state ("Show terminal" vs "Hide terminal")
import type { Component } from 'svelte';
import '$lib/keybindings/catalog';
import { catalogCommands, commandEnabled, commandTitle, runCommand } from '$lib/keybindings/commands/commandRegistry';
import { keyLabel } from '$lib/keybindings/keybindings.svelte';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import { packageFileItems } from './palettePackageItems';

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
	const items: PaletteItem[] = [];
	for (const command of catalogCommands()) {
		if (!command.palette || !commandEnabled(command.id)) continue;
		items.push({
			id: command.id,
			label: commandTitle(command.id),
			group: command.category(),
			keywords: command.palette.keywords,
			hint: keyLabel(command.id) || undefined,
			icon: command.palette.icon,
			searchOnly: command.palette.searchOnly,
			run: () => runCommand(command.id)
		});
	}
	const packages = packageFileItems(a);
	const lastOfGroup = items.findLastIndex((item) => item.group === packages[0]?.group);
	items.splice(lastOfGroup + 1 || items.length, 0, ...packages);
	return items;
}
