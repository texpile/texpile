<script lang="ts">
	import Link2 from '@lucide/svelte/icons/link-2';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Pencil from '@lucide/svelte/icons/pencil';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		href: string;
		/** the link's display text in the document */
		text: string;
		position: { x: number; y: number };
		onUpdate: (href: string, text: string) => void;
		onRemove: () => void;
		onClose: () => void;
		/** open interception: true = handled in-app, else the browser fallback runs */
		onOpen?: (href: string) => boolean;
	};

	let { href, text, position, onUpdate, onRemove, onClose, onOpen }: Props = $props();

	let boxElement: HTMLDivElement;
	let isEditing = $state(false);

	// edit fields are seeded once by design: the tooltip is remounted per link
	// svelte-ignore state_referenced_locally
	let editHref = $state(href);
	// svelte-ignore state_referenced_locally
	let editText = $state(text);

	// the component is mounted once and updated in place, so the fields follow the link it now shows
	$effect(() => {
		if (isEditing) return;
		editHref = href;
		editText = text;
	});

	// keep the box within the viewport
	$effect(() => {
		if (boxElement) {
			const rect = boxElement.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let adjustedX = position.x;
			let adjustedY = position.y + 8;

			if (adjustedX + rect.width > viewportWidth) {
				adjustedX = viewportWidth - rect.width - 10;
			}
			if (adjustedX < 10) {
				adjustedX = 10;
			}

			// show above if no room below
			if (adjustedY + rect.height > viewportHeight) {
				adjustedY = position.y - rect.height - 8;
			}
			if (adjustedY < 10) {
				adjustedY = 10;
			}

			boxElement.style.left = `${adjustedX}px`;
			boxElement.style.top = `${adjustedY}px`;
		}
	});

	function handleSave() {
		if (editHref.trim()) {
			onUpdate(editHref.trim(), editText.trim());
		}
	}

	function handleCancel() {
		isEditing = false;
		editHref = href;
		editText = text;
	}

	function handleRemove() {
		onRemove();
	}

	function handleOpenLink() {
		if (onOpen?.(href)) return; // handled in-app (workspace-relative markdown link)
		window.open(href, '_blank', 'noopener,noreferrer');
	}

	function handleClick(e: MouseEvent) {
		// don't let the click bubble to the editor
		e.stopPropagation();
	}

	function handleMouseDown(e: MouseEvent) {
		// keep mousedown from stealing editor focus, but let inputs take clicks
		const target = e.target as HTMLElement;
		if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
			e.preventDefault();
		}
		e.stopPropagation();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (isEditing) {
				handleCancel();
			} else {
				onClose();
			}
		} else if (e.key === 'Enter' && isEditing) {
			e.preventDefault();
			handleSave();
		}
	}

	function handleWindowClick(e: MouseEvent) {
		const target = e.target as Node;
		if (boxElement?.contains(target)) return;
		// The editor's own clicks belong to the link plugin, which reopens or hides the tooltip from
		// the new selection. Closing here as well raced it: ProseMirror sets the selection on
		// mousedown, so a click held longer than the old 100ms arming delay mounted the tooltip and
		// then dismissed it on mouseup - the flash.
		if ((target as Element)?.parentElement?.closest?.('.ProseMirror') || (target as Element)?.closest?.('.ProseMirror')) return;
		onClose();
	}

	function handleScroll() {
		onClose();
	}

	// close on scroll of the editor or any scrollable ancestor
	$effect(() => {
		const prosemirror = document.querySelector('.ProseMirror');
		if (prosemirror) {
			const scrollableElements = [prosemirror];
			let parent = prosemirror.parentElement;

			while (parent) {
				const overflow = window.getComputedStyle(parent).overflow;
				const overflowY = window.getComputedStyle(parent).overflowY;
				if (overflow === 'auto' || overflow === 'scroll' || overflowY === 'auto' || overflowY === 'scroll') {
					scrollableElements.push(parent);
				}
				parent = parent.parentElement;
			}

			scrollableElements.forEach((el) => {
				el.addEventListener('scroll', handleScroll, { passive: true });
			});

			return () => {
				scrollableElements.forEach((el) => {
					el.removeEventListener('scroll', handleScroll);
				});
			};
		}
	});
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleKeydown} />

<div
	bind:this={boxElement}
	class="card bg-surface-50-950 border-surface-300-700 z-tooltip fixed border shadow-lg"
	style="min-width: 280px; max-width: 400px; pointer-events: auto;"
	onclick={handleClick}
	onmousedown={handleMouseDown}
	onkeydown={handleKeydown}
	role="dialog"
	aria-label={m.linktooltip_aria_dialog_label()}
	tabindex="-1"
	transition:fly={{ y: -4, duration: 150, easing: quintOut }}
>
	{#if isEditing}
		<div class="space-y-3 p-3">
			<label class="block">
				<span class="text-surface-900-100 text-sm font-medium">{m.linktooltip_label_url()}</span>
				<input type="url" bind:value={editHref} placeholder={m.linktooltip_placeholder_url()} class="input mt-1 w-full text-sm" />
			</label>

			<label class="block">
				<span class="text-surface-900-100 text-sm font-medium">{m.linktooltip_label_text()}</span>
				<input type="text" bind:value={editText} placeholder={m.linktooltip_placeholder_text()} class="input mt-1 w-full text-sm" />
			</label>

			<div class="flex justify-end gap-2 pt-1">
				<button type="button" class="btn btn-xs preset-outlined hover:preset-tonal" onclick={handleCancel}>
					<X class="h-4 w-4" />
					<span>{m.linktooltip_button_cancel()}</span>
				</button>
				<button
					type="button"
					class="btn btn-xs preset-filled-primary-500"
					onclick={handleSave}
					disabled={!editHref.trim() || !editText.trim()}
				>
					<Check class="h-4 w-4" />
					<span>{m.linktooltip_button_save()}</span>
				</button>
			</div>
		</div>
	{:else}
		<div class="p-2">
			<div class="mb-2 flex items-center gap-2 p-1">
				<Link2 class="text-surface-500-400 h-4 w-4 flex-shrink-0" />
				<a {href} target="_blank" rel="noopener noreferrer" class="anchor flex-1 truncate text-sm" title={href}>
					{href}
				</a>
			</div>

			<div class="border-surface-300-700 flex items-center gap-1 border-t pt-2">
				<button
					type="button"
					class="btn btn-xs preset-tonal hover:preset-filled flex-1"
					onclick={() => (isEditing = true)}
					title={m.linktooltip_button_edit_title()}
				>
					<Pencil class="h-4 w-4" />
					<span>{m.linktooltip_button_edit()}</span>
				</button>
				<button
					type="button"
					class="btn btn-xs preset-tonal hover:preset-filled flex-1"
					onclick={handleOpenLink}
					title={m.linktooltip_button_open_title()}
				>
					<ExternalLink class="h-4 w-4" />
					<span>{m.linktooltip_button_open()}</span>
				</button>
				<button
					type="button"
					class="btn btn-xs preset-tonal-error hover:preset-filled-error-500"
					onclick={handleRemove}
					title={m.linktooltip_button_remove_title()}
				>
					<Trash2 class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/if}
</div>
