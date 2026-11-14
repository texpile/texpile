<script lang="ts">
	import MenuDropdown, { type DropdownGroup } from '$lib/menus/MenuDropdown.svelte';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { groupedByCategory } from './insertCategories';
	import type { BlockInsertItem } from './insertItem';
	import { insertItems } from './insertItems.svelte';
	import { allowedAtCaret, openEmptyChip, styleAt, turnIntoStyle } from './insertRun';

	const styles = $derived(insertItems.current.filter((item): item is BlockInsertItem => item.shape === 'block' && item.style));
	const current = $derived(editorViewStore.current ? styleAt(editorViewStore.current.state, styles) : null);
	// as plain strings: the caret moves on every key, and a list made again each time drew the whole menu again
	const currentId = $derived(current?.id ?? null);
	const allowedIds = $derived(
		(editorViewStore.current ? styles.filter((item) => allowedAtCaret(editorViewStore.current!.state, item)) : styles)
			.map((item) => item.id)
			.join('\n')
	);
	const groups: DropdownGroup[] = $derived.by(() => {
		const allowed = new Set(allowedIds.split('\n'));
		return groupedByCategory(styles.filter((item) => allowed.has(item.id))).map((group) => ({
			label: group.label ?? undefined,
			options: group.items.map((item) => ({ value: item.id, label: item.label, icon: item.icon, checked: item.id === currentId }))
		}));
	});

	function pick(id: string) {
		const view = editorViewStore.current;
		const item = styles.find((s) => s.id === id);
		if (!view || !item) return;
		turnIntoStyle(view.state, item, view.dispatch);
		view.focus();
		openEmptyChip(view);
	}
</script>

{#if styles.length}
	<MenuDropdown {groups} label={current?.label ?? styles[0].label} onSelect={pick} />
{/if}
