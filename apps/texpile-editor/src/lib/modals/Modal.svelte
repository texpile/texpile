<script module lang="ts">
	// every open shell registers here and only the top of the stack answers Escape, so one
	// keypress closes one modal even when dialogs stack
	const escapeStack: symbol[] = [];
</script>

<script lang="ts">
	import type { Component, Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { takeFocus } from './dialogFocus';

	let {
		open = $bindable(true),
		onClose,
		title,
		icon: Icon,
		iconClass = 'text-primary-ink',
		card = 'max-h-full max-w-md overflow-y-auto p-5',
		z = 'z-1300',
		dismissable = true,
		alert = false,
		onEnter,
		children
	}: {
		/** parents that mount the modal conditionally leave this unbound; the default keeps it shown */
		open?: boolean;
		/** runs on every dismissal - X, backdrop, Escape - after open flips false */
		onClose?: () => void;
		/** renders the standard header row; omit it to lay out your own */
		title?: string;
		icon?: Component<{ class?: string }>;
		iconClass?: string;
		/** width, padding and scroll model, appended to the base card classes */
		card?: string;
		/** only a dialog that stacks on top of another needs a higher layer */
		z?: string;
		/** false for forced-choice dialogs: no X, and backdrop and Escape do nothing */
		dismissable?: boolean;
		/** alertdialog semantics */
		alert?: boolean;
		/** Enter pressed on the dialog body; never fires from a button, whose own activation runs */
		onEnter?: () => void;
		children: Snippet;
	} = $props();

	const id = Symbol();
	$effect(() => {
		if (!open) return;
		escapeStack.push(id);
		return () => {
			const at = escapeStack.indexOf(id);
			if (at !== -1) escapeStack.splice(at, 1);
		};
	});

	function close() {
		open = false;
		onClose?.();
	}

	/** A menu or popover open above the dialog takes Escape first: it closes that, not the dialog
	 *  under it, as VS Code closes the innermost thing (a copy's "…" menu in Local History). Looked
	 *  at as the key press starts: by the time it bubbles here the menu has already closed itself. */
	let menuTakesEscape = false;
	function onWindowKeydownCapture(e: KeyboardEvent) {
		if (e.key === 'Escape')
			menuTakesEscape = !!document.querySelector(
				'[data-part="content"][data-state="open"]:is([data-scope="popover"], [data-scope="menu"])'
			);
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && dismissable && escapeStack[escapeStack.length - 1] === id && !menuTakesEscape) {
			// used up here: nothing behind the dialog should act on it too
			e.preventDefault();
			close();
		}
	}

	function onCardKeydown(e: KeyboardEvent) {
		// Enter confirms only from the dialog body, never when a button has focus: there the
		// button's own activation runs, so Tab-to-Cancel then Enter cancels instead of confirming
		if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) onEnter?.();
	}
</script>

<svelte:window onkeydowncapture={open ? onWindowKeydownCapture : undefined} onkeydown={open ? onWindowKeydown : undefined} />

{#if open}
	<div
		class="app-scrim fixed inset-0 {z} flex items-center justify-center bg-black/40 p-4"
		role="presentation"
		onmousedown={(e) => e.target === e.currentTarget && dismissable && close()}
	>
		<!-- max-h + card scroll: a short window scrolls the card instead of clipping the buttons -->
		<div
			class="card bg-surface-50-950 border-surface-300-700 w-full border shadow-2xl {card}"
			role={alert ? 'alertdialog' : 'dialog'}
			aria-modal="true"
			tabindex="-1"
			use:takeFocus
			onkeydown={onEnter ? onCardKeydown : undefined}
		>
			{#if title}
				<div class="mb-3 flex items-center justify-between gap-4">
					<h2 class="flex items-center gap-2 text-base font-semibold">
						{#if Icon}<Icon class="{iconClass} size-5" />{/if}
						<span class="cap-center">{title}</span>
					</h2>
					{#if dismissable}
						<button class="btn-icon btn-icon-xs hover:preset-tonal" onclick={close} aria-label={m.modal_close_aria()}>
							<X class="size-4" />
						</button>
					{/if}
				</div>
			{/if}
			{@render children()}
		</div>
	</div>
{/if}
