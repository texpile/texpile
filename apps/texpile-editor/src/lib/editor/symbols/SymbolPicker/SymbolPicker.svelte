<script lang="ts">
	// The shell follows the command palette's (a fixed overlay and a card), so the two stack the same.
	// The search field keeps the keyboard until Down or Tab hands it to the grid, whose tiles are
	// options of a listbox the field points at, so a screen reader hears the best match as it is typed.
	import { Search } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { symbolPicker as picker } from '../symbolPicker.svelte';
	import SymbolTabs from './SymbolTabs.svelte';
	import SymbolGrid from './SymbolGrid.svelte';
	import SymbolDetail from './SymbolDetail.svelte';
	import { m } from '$lib/paraglide/messages';

	const GRID_ID = 'symbol-grid';

	let dialog = $state<HTMLElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);
	let grid = $state<SymbolGrid | null>(null);

	function optionId(index: number): string {
		return `symbol-${index}`;
	}

	function focusOnOpen(node: HTMLElement) {
		node.focus();
		// the Insert menu hands focus back to its trigger a microtask after the pick that opened us
		const again = setTimeout(() => {
			if (!dialog?.contains(document.activeElement)) node.focus();
		});
		return { destroy: () => clearTimeout(again) };
	}

	/** Escape in the capture phase, before the field or a tile can take it, as the command palette does */
	function onWindowKeydownCapture(e: KeyboardEvent) {
		if (!picker.open || e.key !== 'Escape') return;
		e.preventDefault();
		e.stopPropagation();
		picker.close();
	}

	function onInputKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (picker.activeSymbol) picker.choose(picker.activeSymbol);
		} else if (e.key === 'ArrowDown' && picker.results.length > 0) {
			e.preventDefault();
			grid?.focusActive();
		}
	}

	/** Tab cycles the field, the tab row and the grid, and never leaves the dialog */
	function keepFocusInside(e: KeyboardEvent) {
		if (e.key !== 'Tab' || !dialog) return;
		const stops = [...dialog.querySelectorAll<HTMLElement>('input, [tabindex="0"]')];
		if (stops.length === 0) return;
		const first = stops[0];
		const last = stops[stops.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}
</script>

<svelte:window onkeydowncapture={onWindowKeydownCapture} />

{#if picker.open}
	<div
		class="fixed inset-0 z-1300 flex items-start justify-center app-scrim bg-black/40 p-4 [--scrim-top:8vh]"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && picker.close()}
	>
		<div
			bind:this={dialog}
			class="card bg-surface-50-950 border-surface-300-700 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-clip border shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={m.symbols_title()}
			tabindex="-1"
			onkeydown={keepFocusInside}
		>
			<div class="border-surface-200-800 flex items-center gap-2 border-b px-3 py-2">
				<Search class="text-muted size-4 shrink-0" />
				<input
					bind:this={input}
					use:focusOnOpen
					class="w-full bg-transparent text-sm outline-none placeholder:text-muted"
					value={picker.query}
					oninput={(e) => picker.search(e.currentTarget.value)}
					onkeydown={onInputKeydown}
					placeholder={picker.set?.searchPlaceholder()}
					aria-label={m.symbols_search_aria()}
					role="combobox"
					aria-expanded="true"
					aria-controls={GRID_ID}
					aria-autocomplete="list"
					aria-activedescendant={picker.activeSymbol ? optionId(picker.active) : undefined}
					autocomplete="off"
					spellcheck="false"
				/>
			</div>
			<div class="flex min-h-0 flex-1">
				<SymbolTabs controls={GRID_ID} />
				<SymbolGrid bind:this={grid} id={GRID_ID} {optionId} onsearch={() => input?.focus()} />
			</div>
			<SymbolDetail />
			<div class="border-surface-200-800 text-muted flex gap-3 border-t px-3 py-1.5 text-xs">
				<span class="flex items-center gap-1"
					><Kbd cap keys="up" />
					<Kbd cap keys="down" />
					<Kbd cap keys="left" />
					<Kbd cap keys="right" />
					<span class="cap-center">{m.palette_hint_navigate()}</span></span
				>
				<span class="ml-auto flex items-center gap-1"
					><Kbd cap keys="enter" /> <span class="cap-center">{m.palette_hint_select()}</span></span
				>
				<span class="flex items-center gap-1"><Kbd cap keys="esc" /> <span class="cap-center">{m.palette_hint_close()}</span></span>
			</div>
			<p class="sr-only" aria-live="polite">{picker.query.trim() ? m.symbols_found({ count: picker.results.length }) : ''}</p>
		</div>
	</div>
{/if}
