<script lang="ts">
	import { tip } from '$lib/components/tooltip.svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import X from '@lucide/svelte/icons/x';
	import Replace from '@lucide/svelte/icons/replace';
	import ReplaceAll from '@lucide/svelte/icons/replace-all';
	import FindToggles from './FindToggles.svelte';
	import type { FindOptions } from './findOptions';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		query: string;
		replaceText: string;
		options: FindOptions;
		current: number;
		total: number;
		/** false where nothing may be written back: a comparison, a read-only file */
		canReplace?: boolean;
		onQueryChange: (value: string) => void;
		onReplaceTextChange: (value: string) => void;
		onToggleOption: (key: keyof FindOptions) => void;
		onPrev: () => void;
		onNext: () => void;
		onReplaceOne: () => void;
		onReplaceAll: () => void;
		onClose: () => void;
	};

	let {
		query,
		replaceText,
		options,
		current,
		total,
		canReplace = true,
		onQueryChange,
		onReplaceTextChange,
		onToggleOption,
		onPrev,
		onNext,
		onReplaceOne,
		onReplaceAll,
		onClose
	}: Props = $props();

	let queryInput = $state<HTMLInputElement>();
	let replaceInput = $state<HTMLInputElement>();
	let showReplace = $state(false);

	const status = $derived(total === 0 ? m.find_no_results() : m.find_count({ current, total }));

	export function focusQuery(): void {
		queryInput?.focus();
		queryInput?.select();
	}

	function toggleReplaceRow(): void {
		showReplace = !showReplace;
		if (showReplace) setTimeout(() => replaceInput?.focus(), 0);
	}

	function onFieldKeydown(e: KeyboardEvent): void {
		// handled here, so the app menu's own Mod+F (fired only for keys the page leaves alone) cannot toggle it back
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
			e.preventDefault();
			e.stopPropagation(); // the visual editor also listens on window; it would reopen what we just closed
			onClose();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) onPrev();
			else onNext();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}
</script>

<div class="find-widget preset-outlined-surface-200-800 bg-surface-50-950 flex items-start shadow-lg">
	{#if canReplace}
		<button
			type="button"
			class="find-action find-expand hover:preset-tonal"
			aria-expanded={showReplace}
			use:tip={m.find_toggle_replace()}
			aria-label={m.find_toggle_replace()}
			onmousedown={(e) => e.preventDefault()}
			onclick={toggleReplaceRow}
		>
			{#if showReplace}<ChevronDown class="size-3.5" />{:else}<ChevronRight class="size-3.5" />{/if}
		</button>
	{/if}

	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<div class="flex items-center">
			<div class="find-field flex-1">
				<input
					type="text"
					main-field="true"
					bind:this={queryInput}
					value={query}
					oninput={(e) => onQueryChange(e.currentTarget.value)}
					onkeydown={onFieldKeydown}
					placeholder={m.find_placeholder()}
					aria-label={m.find_placeholder()}
				/>
				<FindToggles {options} onToggle={onToggleOption} />
			</div>
			<span class="find-status shrink-0 truncate" aria-live="polite">{status}</span>
			<button
				type="button"
				class="find-action hover:preset-tonal"
				use:tip={m.find_previous()}
				aria-label={m.find_previous()}
				onmousedown={(e) => e.preventDefault()}
				onclick={onPrev}><ArrowUp class="size-3.5" /></button
			>
			<button
				type="button"
				class="find-action hover:preset-tonal"
				use:tip={m.find_next()}
				aria-label={m.find_next()}
				onmousedown={(e) => e.preventDefault()}
				onclick={onNext}><ArrowDown class="size-3.5" /></button
			>
			<button type="button" class="find-action hover:preset-tonal" use:tip={m.find_close()} aria-label={m.find_close()} onclick={onClose}
				><X class="size-3.5" /></button
			>
		</div>

		{#if canReplace && showReplace}
			<div class="flex items-center">
				<div class="find-field flex-1">
					<input
						type="text"
						bind:this={replaceInput}
						value={replaceText}
						oninput={(e) => onReplaceTextChange(e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								onReplaceOne();
							} else onFieldKeydown(e);
						}}
						placeholder={m.find_replace_placeholder()}
						aria-label={m.find_replace_placeholder()}
					/>
				</div>
				<button
					type="button"
					class="find-action hover:preset-tonal"
					use:tip={m.find_replace()}
					aria-label={m.find_replace()}
					onmousedown={(e) => e.preventDefault()}
					onclick={onReplaceOne}><Replace class="size-3.5" /></button
				>
				<button
					type="button"
					class="find-action hover:preset-tonal"
					use:tip={m.find_replace_all()}
					aria-label={m.find_replace_all()}
					onmousedown={(e) => e.preventDefault()}
					onclick={onReplaceAll}><ReplaceAll class="size-3.5" /></button
				>
			</div>
		{/if}
	</div>
</div>
