<script lang="ts">
	// a text field that offers values to pick, in the look every list shares (menuStyles.ts): typing filters them, the
	// chevron or Down shows them all, Enter or a click takes one, and typed text that is none of them stands
	import { Portal } from '@skeletonlabs/skeleton-svelte';
	import { ChevronDown } from '@lucide/svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { tip } from '$lib/components/tooltip.svelte';
	import { menuItemClass, menuPanelClass } from './menuStyles';
	import { m } from '$lib/paraglide/messages';

	type Props = Omit<HTMLInputAttributes, 'value' | 'oninput' | 'list'> & {
		value: string;
		suggestions: readonly string[];
		oninput: (value: string) => void;
		input?: HTMLInputElement;
	};

	let { value, suggestions, oninput, onkeydown, onblur, input = $bindable(), class: inputClass, ...rest }: Props = $props();

	const id = $props.id();
	// the list's height, past which it opens above the field
	const ROOM = 240;

	let open = $state(false);
	// opened from the chevron or Down: every suggestion, not those the typed text matches
	let whole = $state(false);
	let active = $state(-1);
	let wrap: HTMLDivElement | undefined = $state();
	let list: HTMLDivElement | undefined = $state();
	let place = $state<{ left: number; width: number; top?: number; bottom?: number } | null>(null);

	const offered = $derived(suggestions.length > 0);
	const shown = $derived.by(() => {
		const typed = value.trim().toLowerCase();
		if (whole || !typed) return suggestions;
		return suggestions.filter((s) => s !== value && s.toLowerCase().includes(typed));
	});
	const expanded = $derived(open && shown.length > 0);

	function show(all: boolean) {
		whole = all;
		active = -1;
		open = true;
	}

	function close() {
		open = false;
		active = -1;
	}

	function pick(suggestion: string) {
		oninput(suggestion);
		close();
	}

	function move(step: number) {
		const n = shown.length;
		if (!n) return;
		active = active < 0 ? (step > 0 ? 0 : n - 1) : (active + step + n) % n;
		list?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
	}

	function keydown(e: KeyboardEvent & { currentTarget: EventTarget & HTMLInputElement }) {
		if (offered && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
			e.preventDefault();
			if (expanded) move(e.key === 'ArrowDown' ? 1 : -1);
			else show(true);
			return;
		}
		// used up here when the list is open: the panel or dialog around the field must not close, or take Enter as done
		if (expanded && e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			close();
			return;
		}
		if (expanded && e.key === 'Enter' && active >= 0) {
			e.preventDefault();
			e.stopPropagation();
			pick(shown[active]);
			return;
		}
		if (e.key === 'Tab') close();
		onkeydown?.(e);
	}

	$effect(() => {
		if (!expanded || !wrap) return;
		const field = wrap;
		function measure() {
			const box = field.getBoundingClientRect();
			const above = window.innerHeight - box.bottom < ROOM && box.top > window.innerHeight - box.bottom;
			place = { left: box.left, width: box.width, ...(above ? { bottom: window.innerHeight - box.top + 4 } : { top: box.bottom + 4 }) };
		}
		measure();
		document.addEventListener('scroll', measure, { capture: true, passive: true });
		window.addEventListener('resize', measure);
		return () => {
			document.removeEventListener('scroll', measure, { capture: true });
			window.removeEventListener('resize', measure);
		};
	});
</script>

<div bind:this={wrap} class="relative flex min-w-0 flex-1">
	<input
		bind:this={input}
		{...rest}
		class="{inputClass} {offered ? 'pr-7' : ''}"
		{value}
		role={offered ? 'combobox' : undefined}
		aria-autocomplete={offered ? 'list' : undefined}
		aria-expanded={offered ? expanded : undefined}
		aria-controls={expanded ? `${id}-list` : undefined}
		aria-activedescendant={expanded && active >= 0 ? `${id}-${active}` : undefined}
		oninput={(e) => {
			oninput(e.currentTarget.value);
			if (offered) show(false);
		}}
		onkeydown={keydown}
		onblur={(e) => {
			close();
			onblur?.(e);
		}}
	/>
	{#if offered}
		<button
			type="button"
			tabindex="-1"
			class="text-surface-700-300 hover:text-surface-950-50 absolute inset-y-0 right-0 flex w-7 items-center justify-center"
			use:tip={m.drawn_chip_suggestions()}
			onpointerdown={(e) => e.preventDefault()}
			onclick={() => {
				input?.focus();
				if (expanded) close();
				else show(true);
			}}
		>
			<ChevronDown class="size-3.5" />
		</button>
	{/if}
</div>

{#if expanded && place}
	<Portal>
		<!-- a press inside keeps the focus in the field, so the list is not closed by its blur -->
		<div
			bind:this={list}
			id="{id}-list"
			role="listbox"
			tabindex="-1"
			data-suggest-list
			class="{menuPanelClass} fixed z-[1400] max-h-60 overflow-y-auto"
			style="left: {place.left}px; min-width: {place.width}px; {place.top !== undefined
				? `top: ${place.top}px`
				: `bottom: ${place.bottom}px`}"
			onpointerdown={(e) => e.preventDefault()}
		>
			{#each shown as suggestion, i (suggestion)}
				<!-- the arrow keys and Enter are the field's, which names the highlighted row (aria-activedescendant) -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					id="{id}-{i}"
					role="option"
					tabindex="-1"
					aria-selected={i === active}
					data-index={i}
					data-highlighted={i === active ? '' : undefined}
					class={menuItemClass}
					onpointermove={() => (active = i)}
					onclick={() => pick(suggestion)}
				>
					<span class="min-w-0 flex-1 truncate">{suggestion}</span>
				</div>
			{/each}
		</div>
	</Portal>
{/if}
