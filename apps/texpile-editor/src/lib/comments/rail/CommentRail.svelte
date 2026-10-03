<script lang="ts">
	// The comment margin: the open file's threads beside the text they are about, scrolling with
	import { untrack } from 'svelte';
	import type { CommentsController } from '$lib/workspace/commentsController.svelte';
	import type { CommentThread } from '$lib/comments/log';
	import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
	import { liveCommentRanges } from '$lib/editor/visual/extensions/comments';
	import { liveSuggestionRanges } from '$lib/editor/source/cmSuggestions';
	import { activeSuggestions } from '$lib/comments/activeSuggestions.svelte';
	import { threadAtPointer } from '$lib/comments/threadAtPointer';
	import { toaster } from '$lib/modals/toaster-svelte';
	import { revealPmComment } from '$lib/editor/visual/extensions/pmComments';
	import {
		COMMENT_RAIL_PEEK,
		COMMENT_RAIL_WIDTH,
		EDITOR_TEXT_MIN,
		EDITOR_TEXT_PAD,
		EDITOR_TEXT_PAD_STACKED
	} from '$lib/workspace/paneGeometry';
	import { RailGeometry } from './railGeometry.svelte';
	import { RailGlide } from './railGlide.svelte';
	import { cmTextExtent, measureCmAnchors, measurePmAnchors, PENDING_ANCHOR } from './railAnchors';
	import { stackRailItems, type RailBounds, type RailItem } from './railLayout';
	import CommentCard from './CommentCard.svelte';
	import CommentComposerCard from './CommentComposerCard.svelte';
	import { returnToCmText, returnToPmText } from './returnToText';
	import { backdrop, clipEdge } from './railEdge';
	import { m } from '$lib/paraglide/messages';

	let {
		ctl,
		threads,
		mode,
		scroller = null,
		onSelect
	}: {
		ctl: CommentsController;
		threads: CommentThread[];
		mode: 'visual' | 'source';
		scroller?: HTMLElement | null;
		onSelect: (id: string) => void;
	} = $props();

	const GAP = 6;
	const EDGE_GAP = 16;
	const NOTHING_PLACED = new Map<string, number>();

	let rail = $state<HTMLElement | null>(null);
	const geometry = new RailGeometry();
	const anchors = $derived(geometry.anchors);

	const pmView = $derived(editorViewStore.current);
	const cmView = $derived(sourceCmView.current);

	$effect(() => {
		const el = rail;
		if (!el) return;
		if (mode === 'visual') {
			const view = pmView;
			if (!view) return;
			return geometry.observe({
				mutate: view.dom,
				resize: view.dom,
				scroll: scroller,
				// with nothing to place, no layout read on every key and every scroll frame
				measure: () =>
					untrack(() => !ctl.pending && activeSuggestions.current.length === 0 && threads.every((t) => t.resolved))
						? NOTHING_PLACED
						: measurePmAnchors(view, el, !!untrack(() => ctl.pending))
			});
		}
		const view = cmView;
		if (!view) return;
		return geometry.observe({
			mutate: view.contentDOM,
			resize: view.scrollDOM,
			scroll: view.scrollDOM,
			measure: () => {
				extent = cmTextExtent(view);
				return measureCmAnchors(
					view,
					liveCommentRanges(view.state),
					untrack(() => ctl.pending),
					el,
					liveSuggestionRanges(view.state)
				);
			}
		});
	});
	$effect(() => {
		void ctl.pending;
		void threads;
		void activeSuggestions.current;
		geometry.schedule();
	});

	$effect(() => {
		const el = rail;
		const view = cmView;
		if (!el || mode !== 'source' || !view) return;
		const home = el.parentElement;
		const next = el.nextSibling;
		view.scrollDOM.appendChild(el);
		return () => {
			if (home && el.parentElement === view.scrollDOM) home.insertBefore(el, next && next.parentNode === home ? next : null);
		};
	});

	const placed = $derived(threads.filter((t) => !t.resolved && anchors.has(t.id)).sort((a, b) => anchors.get(a.id)! - anchors.get(b.id)!));
	const composing = $derived(!!ctl.pending && anchors.has(PENDING_ANCHOR));
	const glide: RailGlide = new RailGlide(() => ({
		rail,
		box: mode === 'visual' ? scroller : (cmView?.scrollDOM ?? null),
		inflow,
		showing
	}));
	const showing: boolean = $derived(placed.length > 0 || composing || glide.leaving);
	let hadCards = false;
	$effect.pre(() => {
		const cards = placed.length > 0 || composing;
		if (hadCards && !cards) untrack(() => glide.closeColumn());
		hadCards = cards;
	});
	$effect(() => {
		void cmView;
		void scroller;
		glide.leaving = false;
	});

	const heights = new Map<string, number>();
	let positions = $state.raw<Map<string, number>>(new Map());
	function relayout() {
		const items: RailItem[] = placed.map((t) => ({ id: t.id, anchor: anchors.get(t.id)!, height: heights.get(t.id) ?? 120 }));
		if (composing) items.push({ id: PENDING_ANCHOR, anchor: anchors.get(PENDING_ANCHOR)!, height: heights.get(PENDING_ANCHOR) ?? 110 });
		positions = stackRailItems(items, composing ? PENDING_ANCHOR : ctl.selected, GAP, bounds());
	}
	function bounds(): RailBounds {
		const el = rail;
		if (!el) return { floor: EDGE_GAP, ceiling: Number.POSITIVE_INFINITY };
		if (mode === 'visual') return { floor: EDGE_GAP, ceiling: el.offsetHeight - EDGE_GAP };
		const s = cmView?.scrollDOM;
		if (!s) return { floor: EDGE_GAP, ceiling: el.clientHeight - EDGE_GAP };
		return {
			floor: EDGE_GAP - s.scrollTop,
			ceiling: el.clientHeight - EDGE_GAP + Math.max(0, s.scrollHeight - s.clientHeight - s.scrollTop)
		};
	}
	$effect(() => {
		void anchors;
		void placed;
		void composing;
		void ctl.selected;
		untrack(relayout);
	});
	function setHeight(id: string, h: number) {
		if (heights.get(id) === h) return;
		heights.set(id, h);
		relayout();
	}
	$effect(() => {
		const el = rail;
		if (!el) return;
		const ro = new ResizeObserver(() => relayout());
		ro.observe(el);
		return () => ro.disconnect();
	});
	function topOf(id: string): number {
		return positions.get(id) ?? anchors.get(id) ?? 0;
	}

	/** the pane's inner width, and in source the gutters beside the text */
	let room = $state.raw<{ box: number; gutters: number } | null>(null);
	let tail = $state(0);
	let extent = $state.raw({ box: 0, text: 0 });
	// the column would have to narrow beside the visual editor's usual gutters: the block handles stack on the left and
	// the right gutter goes. Decided with the usual gutters, so the room that frees cannot turn it back off
	const stacked = $derived(mode === 'visual' && showing && !!room && room.box - EDITOR_TEXT_MIN - EDITOR_TEXT_PAD < COMMENT_RAIL_WIDTH);
	// on the scroller, which holds the editor: its padding and the block handle read it (EditorPane's group/pane)
	$effect(() => {
		const box = scroller;
		if (!box || mode !== 'visual') return;
		box.toggleAttribute('data-gutter-stacked', stacked);
		return () => box.removeAttribute('data-gutter-stacked');
	});
	const inflow = $derived.by(() => {
		if (!room) return COMMENT_RAIL_WIDTH;
		const beside = mode === 'visual' ? (stacked ? EDITOR_TEXT_PAD_STACKED : EDITOR_TEXT_PAD) : room.gutters;
		return Math.max(COMMENT_RAIL_PEEK, Math.min(COMMENT_RAIL_WIDTH, room.box - EDITOR_TEXT_MIN - beside));
	});
	const shift = $derived(
		mode === 'source' && inflow < COMMENT_RAIL_WIDTH ? Math.max(0, Math.min(COMMENT_RAIL_WIDTH - inflow, extent.box - extent.text - 12)) : 0
	);
	function measureInflow() {
		const box = mode === 'visual' ? scroller : cmView?.scrollDOM;
		if (!box) return;
		const gutters = mode === 'visual' ? 0 : (cmView?.dom.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0);
		if (room?.box !== box.clientWidth || room.gutters !== gutters) room = { box: box.clientWidth, gutters };
		tail = box.offsetWidth - box.clientWidth;
	}
	$effect(() => {
		const box = mode === 'visual' ? scroller : cmView?.scrollDOM;
		if (!box) return;
		const ro = new ResizeObserver(measureInflow);
		ro.observe(box);
		measureInflow();
		return () => ro.disconnect();
	});

	// a card sliced mid-word at a narrow pane's edge looked like a rendering fault, so the cut fades out
	const FADE = 24;
	let cut = $state<{ x: number; bg: string } | null>(null);
	function measureCut() {
		const box = mode === 'visual' ? scroller : cmView?.scrollDOM;
		const el = rail;
		if (!box || !el || !showing) return void (cut = null);
		const edge = clipEdge(box);
		let right = -Infinity;
		for (const card of el.querySelectorAll<HTMLElement>('.comment-card')) right = Math.max(right, card.getBoundingClientRect().right);
		if (right <= edge + 0.5) return void (cut = null);
		const x = edge - el.getBoundingClientRect().left - el.clientLeft;
		if (cut?.x !== x) cut = { x, bg: backdrop(box) };
	}
	$effect(() => {
		const box = mode === 'visual' ? scroller : cmView?.scrollDOM;
		const el = rail;
		if (!box || !el) return;
		box.addEventListener('scroll', measureCut, { passive: true });
		// cards slide to a new place (CSS transitions on top and left): measure where they came to rest
		el.addEventListener('transitionend', measureCut);
		const ro = new ResizeObserver(measureCut);
		ro.observe(box);
		ro.observe(el);
		return () => {
			box.removeEventListener('scroll', measureCut);
			el.removeEventListener('transitionend', measureCut);
			ro.disconnect();
		};
	});
	$effect(() => {
		// the cards moved, came or went, or one widened on selection: after they are drawn
		void positions;
		void placed;
		void composing;
		void ctl.selected;
		void shift;
		void inflow;
		void showing;
		requestAnimationFrame(() => untrack(measureCut));
	});

	let revealedSeq = 0;
	$effect(() => {
		const req = ctl.toReveal;
		if (!req || req.seq === revealedSeq || !placed.some((t) => t.id === req.id)) return;
		revealedSeq = req.seq;
		if (mode === 'visual' && pmView) revealPmComment(pmView, req.id);
		glide.reveal(true);
	});
	let composingWas = false;
	$effect(() => {
		if (composing && !composingWas) glide.reveal();
		composingWas = composing;
	});

	async function reject(t: CommentThread) {
		if (!(await ctl.suggestions.reject(t))) toaster.warning({ title: m.comments_suggest_reject_failed() });
	}

	let hovered = $state<string | null>(null);
	$effect(() => {
		const root = mode === 'visual' ? pmView?.dom : cmView?.contentDOM;
		if (!root) return;
		function over(e: Event) {
			hovered = threadAtPointer(e.target);
		}
		function leave() {
			hovered = null;
		}
		function click(e: Event) {
			// text no thread holds: the reader has moved on, and the card they had open goes back in line
			if (!threadAtPointer(e.target)) ctl.selected = null;
			const collapsed = mode === 'visual' ? pmView?.state.selection.empty : cmView?.state.selection.main.empty;
			if (collapsed) glide.retreat();
		}
		root.addEventListener('mouseover', over);
		root.addEventListener('mouseleave', leave);
		root.addEventListener('click', click);
		return () => {
			root.removeEventListener('mouseover', over);
			root.removeEventListener('mouseleave', leave);
			root.removeEventListener('click', click);
		};
	});
</script>

<aside
	bind:this={rail}
	class="comment-rail shrink-0 {mode === 'source' ? 'comment-rail-source' : 'relative z-[1]'} {showing && inflow < COMMENT_RAIL_WIDTH
		? 'comment-rail-narrow'
		: ''}"
	style="width: {showing ? inflow : 0}px; --comment-rail-tail: {tail}px; --comment-card-shift: {shift}px"
	aria-label={m.wsview_comments_label()}
	onclick={(e) => {
		if (!(e.target as HTMLElement).closest('button')) glide.reveal();
	}}
	onkeydown={(e) => {
		// Escape in a reply box drops the selection; the composer handles its own
		if (e.key === 'Escape' && (e.target as HTMLElement).closest('.comment-card:not(.comment-card-pending)')) ctl.selected = null;
	}}
>
	{#each placed as t (t.id)}
		<CommentCard
			thread={t}
			selected={t.id === ctl.selected}
			unsure={ctl.weak.has(t.id)}
			partial={ctl.partial.has(t.id)}
			hovered={hovered === t.id}
			top={topOf(t.id)}
			onSelect={() => onSelect(t.id)}
			onResolve={() => void ctl.setResolved(t, !t.resolved)}
			onAccept={() => void ctl.suggestions.accept(t)}
			onReject={() => void reject(t)}
			onReply={(thread, body) => ctl.reply(thread, body)}
			onEditMessage={(msg, body) => void ctl.editMessage(msg, body)}
			onDeleteMessage={(thread, msg) => void ctl.removeMessage(thread, msg)}
			onSize={(h) => setHeight(t.id, h)}
		/>
	{/each}
	{#if composing && ctl.pending}
		<CommentComposerCard
			quote={ctl.pending.quote}
			top={topOf(PENDING_ANCHOR)}
			onSubmit={(body, keyed) => {
				void ctl.commitAdd(body);
				if (!keyed) return;
				if (mode === 'visual' && pmView) returnToPmText(pmView);
				else if (mode === 'source' && cmView) returnToCmText(cmView);
			}}
			onCancel={() => ctl.cancelAdd()}
			onSize={(h) => setHeight(PENDING_ANCHOR, h)}
		/>
	{/if}
	{#if cut}
		<div
			class="comment-rail-fade"
			style="left: {cut.x - FADE}px; width: {FADE}px; --comment-rail-fade-bg: {cut.bg}"
			aria-hidden="true"
		></div>
	{/if}
</aside>
