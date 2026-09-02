<script lang="ts">
	// right-click menu for the PDF pane: copy what the text layer has selected
	import { Copy } from '@lucide/svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { m } from '$lib/paraglide/messages';

	type Target = { x: number; y: number; text: string };
	let target = $state<Target | null>(null);

	// the selection is read here: a click on the menu can collapse it before Copy runs
	export function open(event: MouseEvent): void {
		event.preventDefault();
		target = {
			x: Math.min(event.clientX, window.innerWidth - 210),
			y: Math.min(event.clientY, window.innerHeight - 60),
			text: window.getSelection()?.toString() ?? ''
		};
	}

	export function close(): void {
		target = null;
	}

	function copy(): void {
		const text = target?.text ?? '';
		close();
		if (!text) return;
		navigator.clipboard.writeText(text).catch(() => toaster.info({ title: m.ctxmenu_copy_failed_toast(), duration: 3000 }));
	}

	const itemClass =
		'hover:preset-tonal-primary flex w-full items-center gap-2.5 px-3 py-1 text-left disabled:pointer-events-none disabled:opacity-40';
</script>

<svelte:window onkeydown={(e) => target && e.key === 'Escape' && close()} />

{#if target}
	<button
		class="fixed inset-0 z-40 cursor-default"
		aria-label={m.tbar_close_menu_aria()}
		onclick={close}
		oncontextmenu={(e) => (e.preventDefault(), close())}
	></button>
	<div
		class="bg-surface-50-950 border-surface-300-700 fixed z-50 min-w-48 overflow-hidden rounded border py-1 text-sm shadow-lg"
		style="left: {target.x}px; top: {target.y}px"
	>
		<button class={itemClass} disabled={!target.text} onclick={copy}>
			<Copy class="size-4 opacity-70" />
			{m.tbar_ctx_copy()}
			<Kbd keys="Mod+C" class="ml-auto" />
		</button>
	</div>
{/if}
