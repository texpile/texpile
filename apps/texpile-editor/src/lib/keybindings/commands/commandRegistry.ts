// a command is two halves: its catalog entry (id, title, palette look), known from the start so the shortcuts table
// lists it anywhere, and its implementation, registered by whatever part of the app can run it while that part is up
import type { Component } from 'svelte';
import { untrack } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

export type CommandInfo = {
	/** what keybindings.json names it: "file.save", "editor.bold" */
	id: string;
	title(): string;
	/** the group the palette and the shortcuts table show it under */
	category(): string;
	/** how the palette lists it; false keeps it out, as for an editor key */
	palette?: { keywords?: string; icon?: Component; searchOnly?: boolean } | false;
};

export type CommandImpl = {
	id: string;
	run(args?: unknown): unknown;
	/** false leaves its key to whoever else binds it, and keeps it out of the palette */
	enabled?(): boolean;
	/** the palette's label when it reads live state ("Hide Terminal"), over the catalog's */
	title?(): string;
};

const catalog = new Map<string, CommandInfo>();

/** catalog order is the palette's browse order */
export function declareCommands(infos: CommandInfo[]): void {
	for (const entry of infos) catalog.set(entry.id, entry);
}

export function commandInfo(id: string): CommandInfo | undefined {
	return catalog.get(id);
}

export function catalogCommands(): CommandInfo[] {
	return [...catalog.values()];
}

// per id, in the order they came: the start screen and the workspace both run Open Folder, and the last one runs
const impls = new SvelteMap<string, CommandImpl[]>();

/** returns the way to take them off again. Untracked, so an effect can register without depending on the registry */
export function registerCommands(defs: CommandImpl[]): () => void {
	untrack(() => {
		for (const def of defs) impls.set(def.id, [...(impls.get(def.id) ?? []), def]);
	});
	return () =>
		untrack(() => {
			for (const def of defs) {
				const left = (impls.get(def.id) ?? []).filter((d) => d !== def);
				if (left.length) impls.set(def.id, left);
				else impls.delete(def.id);
			}
		});
}

export function commandImpl(id: string): CommandImpl | undefined {
	return impls.get(id)?.at(-1);
}

export function commandEnabled(id: string): boolean {
	const impl = commandImpl(id);
	return !!impl && impl.enabled?.() !== false;
}

export function commandTitle(id: string): string {
	return commandImpl(id)?.title?.() ?? catalog.get(id)?.title() ?? id;
}

/** false when nothing runs it here or it cannot run now */
export function runCommand(id: string, args?: unknown): boolean {
	const impl = commandImpl(id);
	if (!impl || impl.enabled?.() === false) return false;
	const result = impl.run(args);
	if (result instanceof Promise) result.catch((e) => console.error(`command ${id} failed`, e));
	return true;
}
