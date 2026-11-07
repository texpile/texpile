// Preferences › Keyboard Shortcuts: the search, the define dialog, and every write into keybindings.json
import '$lib/keybindings/catalog';
import { catalogCommands, commandTitle } from '$lib/keybindings/commands/commandRegistry';
import { keybindingTable, keyPlatform, userKeybindings } from '$lib/keybindings/keybindings.svelte';
import { itemsOnKeys, type KeybindingItem } from '$lib/keybindings/resolver/keybindingResolver';
import { keysText, type KeySequence } from '$lib/keybindings/keys/keyChord';
import { type WhenExpression } from '$lib/keybindings/when/whenExpression';
import { addKeys, changeKeys, removeKeys, resetCommand, UnreadableKeybindingsError } from '$lib/keybindings/user/keybindingEdits';
import { editUserKeybindings } from '$lib/keybindings/user/userKeybindingsFile';
import type { ContextMenuItem } from '$lib/menus/contextMenu.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { isMac } from '$lib/platform';
import { m } from '$lib/paraglide/messages';
import { buildKeybindingRows, filterKeybindingRows, keybindingEntryText, type KeybindingRow } from './keybindingRows';

export type DefineKeys = { row: KeybindingRow; add: boolean; keys: KeySequence };

/** VS Code's columns: the row's pencil, Command, Key, When, Source */
export const KEYBINDING_GRID = 'grid grid-cols-[1.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_4rem] items-center gap-2';

function copyText(text: string): () => void {
	return () => void navigator.clipboard.writeText(text);
}

export class KeybindingsPanel {
	query = $state('');
	recording = $state(false);
	byPrecedence = $state(false);
	defining = $state<DefineKeys | null>(null);
	/** the row whose when clause is being edited */
	editingWhen = $state<string | null>(null);

	readonly rows = $derived(buildKeybindingRows(keybindingTable(), catalogCommands(), commandTitle, keyPlatform, this.byPrecedence));
	readonly shown = $derived(filterKeybindingRows(this.rows, this.query));

	/** every other command on the keys being defined */
	readonly clashes = $derived.by(() => {
		const d = this.defining;
		if (!d?.keys.length) return 0;
		return itemsOnKeys(keybindingTable(), d.keys).filter((i) => i.command !== d.row.command).length;
	});

	hasUserEntries(command: string): boolean {
		return userKeybindings().items.some((i) => i.command === command || i.command === `-${command}`);
	}

	define(row: KeybindingRow, add = false): void {
		this.defining = { row, add: add || !row.item, keys: [] };
	}

	showSameKeys(keys: KeySequence): void {
		this.defining = null;
		this.recording = false;
		this.query = `"${keysText(keys)}"`;
	}

	/** VS Code's row menu, in its order */
	menuItems(row: KeybindingRow, editable: boolean): ContextMenuItem[] {
		const item = row.item;
		return [
			{ label: m.keybindings_copy(), onclick: copyText(keybindingEntryText(row)) },
			{ label: m.keybindings_copy_id(), onclick: copyText(row.command) },
			{ label: m.keybindings_copy_title(), onclick: copyText(row.title) },
			{ separator: true },
			{ label: item ? m.keybindings_change() : m.keybindings_add(), disabled: !editable, onclick: () => this.define(row) },
			...(item ? [{ label: m.keybindings_add(), disabled: !editable, onclick: () => this.define(row, true) }] : []),
			{ separator: true },
			{ label: m.keybindings_remove(), disabled: !editable || !item, onclick: () => item && void this.remove(item) },
			{
				label: m.keybindings_reset(),
				disabled: !editable || !this.hasUserEntries(row.command),
				onclick: () => void this.reset(row.command)
			},
			{ separator: true },
			{ label: m.keybindings_change_when(), disabled: !editable || !item, onclick: () => (this.editingWhen = row.key) },
			{ separator: true },
			{ label: m.keybindings_show_same(), disabled: !item?.keys, onclick: () => item?.keys && this.showSameKeys(item.keys) }
		];
	}

	/** arrows move between rows, Enter changes the key, Delete removes it */
	onRowKeydown(e: KeyboardEvent, row: KeybindingRow, editable: boolean): void {
		if (e.target !== e.currentTarget) return;
		const el = e.currentTarget as HTMLElement;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const next = e.key === 'ArrowDown' ? el.nextElementSibling : el.previousElementSibling;
			if (next instanceof HTMLElement && next.getAttribute('role') === 'row') next.focus();
		} else if (e.key === 'Enter' && editable && !row.builtin) {
			e.preventDefault();
			this.define(row);
		} else if ((e.key === 'Delete' || (isMac && e.metaKey && e.key === 'Backspace')) && editable && row.item) {
			e.preventDefault();
			void this.remove(row.item);
		}
	}

	async saveDefined(): Promise<void> {
		const d = this.defining;
		this.defining = null;
		if (!d?.keys.length) return;
		const item = d.row.item;
		await this.#write((text) => (d.add || !item ? addKeys(text, d.row.command, d.keys) : changeKeys(text, item, d.keys)));
	}

	async remove(item: KeybindingItem): Promise<void> {
		await this.#write((text) => removeKeys(text, item));
	}

	async reset(command: string): Promise<void> {
		await this.#write((text) => resetCommand(text, command));
	}

	async changeWhen(item: KeybindingItem, when: WhenExpression | null): Promise<void> {
		this.editingWhen = null;
		if (item.keys) await this.#write((text) => changeKeys(text, item, item.keys!, when));
	}

	async #write(edit: (text: string) => string): Promise<void> {
		try {
			await editUserKeybindings(edit);
		} catch (e) {
			const unreadable = e instanceof UnreadableKeybindingsError;
			toaster.error({
				title: m.keybindings_edit_failed_title(),
				description: unreadable ? m.keybindings_unreadable() : e instanceof Error ? e.message : String(e)
			});
		}
	}
}
