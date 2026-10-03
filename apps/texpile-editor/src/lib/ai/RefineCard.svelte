<script lang="ts">
	// The Refine card the selection toolbar opens, laid out like Google Docs': quick actions, More for the rest, and a
	// box for an instruction of the reader's own, and where Refine offers several agents, which one. Mounted once, at the
	// app root, before the context menu host so the More and agent menus open over it
	import { untrack } from 'svelte';
	import { ArrowUp, Check, ChevronDown } from '@lucide/svelte';
	import { showContextMenu } from '$lib/menus/contextMenu.svelte';
	import { m } from '$lib/paraglide/messages';
	import { REFINE_ACTIONS, customRefineAction, type RefineAction } from './refineActions';
	import { agentName, refiner, type RefineAgent } from './selectionRefiner';
	import { refineAgentsOffered } from './refineAgents.svelte';
	import { closeRefineCard, refineCard } from './refineCardState.svelte';
	import { editorViewStore } from '$lib/stores/editorStore';
	import { setPmCommentPending } from '$lib/editor/visual/extensions/pmComments';

	const EDGE = 8;
	const QUICK = ['rephrase', 'shorten', 'grammar'];
	const quick = REFINE_ACTIONS.filter((a) => QUICK.includes(a.id));
	const rest = REFINE_ACTIONS.filter((a) => !QUICK.includes(a.id));

	let card = $state<HTMLDivElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);
	let instruction = $state('');
	// measured before it paints, so it never shows for a frame off-screen
	let placed = $state.raw<{ x: number; y: number; for: object } | null>(null);

	const offered = $derived(refineAgentsOffered());
	// the one a menu entry named, else the one used last, else the first
	let lastUsed = $state<RefineAgent | null>(null);
	let picked = $state<RefineAgent | null>(null);
	const agent = $derived.by(() => {
		const want = picked ?? refineCard.current?.agent ?? lastUsed;
		return want && offered.includes(want) ? want : offered[0];
	});
	$effect(() => {
		if (!refineCard.current) picked = null;
	});

	$effect(() => {
		const open = refineCard.current;
		if (!open || !card) return;
		const { offsetWidth: w, offsetHeight: h } = card;
		const { anchor } = open;
		// above the toolbar, so the selected text stays in view; below it where there is no room above
		const y = anchor.top - h - 6 >= EDGE ? anchor.top - h - 6 : anchor.bottom + 6;
		placed = { x: Math.max(EDGE, Math.min(anchor.left, window.innerWidth - w - EDGE)), y, for: open };
		// the toolbar button kept focus in the editor, where typing would overwrite the selected text
		input?.focus();
	});

	// the box below takes focus, and the visual editor stops drawing its selection the moment it loses it, so the
	// passage about to be rewritten would look like nothing was chosen. The source editor draws its own and needs none.
	// untracked: marking it is a transaction, every transaction replaces the view box, and reading that box here would
	// make the effect its own trigger
	$effect(() => {
		if (!refineCard.current) return;
		return untrack(() => {
			const view = editorViewStore.current;
			const sel = view?.state.selection;
			if (!view || !sel || sel.empty || !view.dom.checkVisibility()) return;
			setPmCommentPending(view, { from: sel.from, to: sel.to });
			// out of the teardown: the transaction that clears the mark re-renders the rail, and Svelte
			// will not let a component take an effect while a cleanup is running
			return () => queueMicrotask(() => !view.isDestroyed && setPmCommentPending(view, null));
		});
	});

	function run(action: RefineAction): void {
		const r = refiner.current;
		const by = agent;
		closeRefineCard();
		instruction = '';
		if (!r || !by) return;
		lastUsed = by;
		void r.refine(action, by);
	}

	function chooseAgent(button: HTMLElement): void {
		const box = button.getBoundingClientRect();
		void showContextMenu(
			offered.map((a) => ({ label: agentName(a), icon: a === agent ? Check : undefined, onclick: () => (picked = a) })),
			{ x: box.left, y: box.bottom + 4 }
		);
	}

	function more(button: HTMLElement): void {
		const box = button.getBoundingClientRect();
		void showContextMenu(
			rest.map((a) => ({ label: a.label(), icon: a.icon, onclick: () => run(a) })),
			{ x: box.left, y: box.bottom + 4 }
		);
	}

	function send(): void {
		const text = instruction.trim();
		if (text) run(customRefineAction(text));
	}
</script>

<svelte:window onkeydown={(e) => refineCard.current && e.key === 'Escape' && closeRefineCard()} />

{#if refineCard.current}
	{@const open = refineCard.current}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-dropdown" onpointerdown={closeRefineCard}></div>
	<!-- data-keep-caret: the card holds focus while the passage it is about must stay marked, which
	     is what persistentSelectionPlugin draws once the focus sits in an overlay it knows -->
	<div
		bind:this={card}
		data-keep-caret
		role="dialog"
		aria-label={agent ? m.ai_refine_menu({ agent: agentName(agent) }) : m.ai_refine()}
		class="bg-surface-50-950 border-surface-300-700 z-dropdown fixed w-max min-w-96 max-w-[calc(100vw-16px)] card border shadow-lg"
		style="left: {placed?.x ?? open.anchor.left}px; top: {placed?.y ?? open.anchor.bottom}px; opacity: {placed?.for === open ? 1 : 0}"
	>
		<div class="flex items-center gap-1 px-2 py-1.5">
			{#each quick as action (action.id)}
				{@const Icon = action.icon}
				<button type="button" class="btn btn-sm hover:preset-tonal gap-1.5 px-2 text-sm" onclick={() => run(action)}>
					<Icon class="text-muted size-4" />{action.label()}
				</button>
			{/each}
			<button type="button" class="btn btn-sm hover:preset-tonal gap-1 px-2 text-sm" onclick={(e) => more(e.currentTarget)}>
				{m.ai_refine_more()}<ChevronDown class="text-muted size-4" />
			</button>
			{#if offered.length > 1 && agent}
				<button
					type="button"
					class="btn btn-sm hover:preset-tonal ml-auto gap-1 px-2 text-sm"
					aria-label={m.ai_refine_choose_agent()}
					onclick={(e) => chooseAgent(e.currentTarget)}
				>
					{agentName(agent)}<ChevronDown class="text-muted size-4" />
				</button>
			{/if}
		</div>
		<form
			class="border-surface-200-800 flex items-center gap-2 border-t px-3 py-2"
			onsubmit={(e) => {
				e.preventDefault();
				send();
			}}
		>
			<input
				class="min-w-0 flex-1 bg-transparent text-sm outline-none"
				placeholder={agent ? m.ai_refine_instruction({ agent: agentName(agent) }) : ''}
				bind:value={instruction}
				bind:this={input}
			/>
			<button
				type="submit"
				class="btn-icon btn-icon-sm preset-tonal shrink-0 rounded-full"
				disabled={!instruction.trim()}
				aria-label={m.ai_refine_send()}
			>
				<ArrowUp class="size-4" />
			</button>
		</form>
	</div>
{/if}
