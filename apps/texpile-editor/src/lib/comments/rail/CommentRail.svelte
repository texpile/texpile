<script lang="ts">
	// The comment margin: the open file's threads beside the text they are about, scrolling with
	import { untrack } from 'svelte';
	import type { CommentsController } from '$lib/workspace/commentsController.svelte';
	import type { CommentThread } from '$lib/comments/log';
	import { editorViewStore, sourceCmView } from '$lib/stores/editorStore';
	import { liveCommentRanges } from '$lib/editor/visual/extensions/comments';
	import { revealPmComment } from '$lib/editor/visual/extensions/pmComments';
	import { COMMENT_RAIL_PEEK, COMMENT_RAIL_WIDTH, EDITOR_TEXT_MIN, EDITOR_TEXT_PAD } from '$lib/workspace/paneGeometry';
	import { RailGeometry } from './railGeometry.svelte';
	import { cmTextExtent, measureCmAnchors, measurePmAnchors, PENDING_ANCHOR } from './railAnchors';
	import { stackRailItems, type RailBounds, type RailItem } from './railLayout';
	import CommentCard from './CommentCard.svelte';
	import CommentComposerCard from './CommentComposerCard.svelte';
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
				measure: () => measurePmAnchors(view, el, !!untrack(() => ctl.pending))
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
					el
				);
			}
		});
	});
	$effect(() => {
		void ctl.pending;
		void threads;
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
	const showing = $derived(placed.length > 0 || composing);

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

	let inflow = $state(COMMENT_RAIL_WIDTH);
	let tail = $state(0);
	let extent = $state.raw({ box: 0, text: 0 });
	const shift = $derived(
		mode === 'source' && inflow < COMMENT_RAIL_WIDTH ? Math.max(0, Math.min(COMMENT_RAIL_WIDTH - inflow, extent.box - extent.text - 12)) : 0
	);
	function measureInflow() {
		const box = mode === 'visual' ? scroller : cmView?.scrollDOM;
		if (!box) return;
		const beside = mode === 'visual' ? EDITOR_TEXT_PAD : (cmView?.dom.querySelector<HTMLElement>('.cm-gutters')?.offsetWidth ?? 0);
		inflow = Math.max(COMMENT_RAIL_PEEK, Math.min(COMMENT_RAIL_WIDTH, box.clientWidth - EDITOR_TEXT_MIN - beside));
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

	function reveal(afterJump = false) {
		const el = rail;
		const box = mode === 'visual' ? scroller : cmView?.scrollDOM;
		if (!el || !box) return;
		const whole = () => {
			const edge = box.getBoundingClientRect().left + box.clientWidth + 1;
			return [...el.querySelectorAll('.comment-card')].every((c) => c.getBoundingClientRect().right <= edge);
		};
		const go = (again = 2) => {
			if (whole()) return;
			const edge = box.getBoundingClientRect().left + box.clientWidth;
			const over = Math.max(...[...el.querySelectorAll('.comment-card')].map((c) => c.getBoundingClientRect().right - edge));
			box.scrollTo({ left: box.scrollLeft + over, behavior: glide() });
			let last = box.scrollLeft;
			const stop = () => {
				box.removeEventListener('scroll', onScroll);
				clearTimeout(timer);
			};
			const onScroll = () => {
				const now = box.scrollLeft;
				if (whole() || now < last) return stop();
				if (now === last) {
					stop();
					if (again > 0) go(again - 1);
				}
				last = now;
			};
			const timer = setTimeout(() => {
				stop();
				if (again > 0 && !whole()) go(0);
			}, 900);
			box.addEventListener('scroll', onScroll);
		};
		if (afterJump) setTimeout(go, 120);
		else go();
	}
	function glide(): ScrollBehavior {
		return matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
	}
	function retreat() {
		const el = rail;
		const box = mode === 'visual' ? scroller : cmView?.scrollDOM;
		if (!el || !box || !showing) return;
		const rest = Math.max(
			0,
			el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft + inflow - box.clientWidth
		);
		if (box.scrollLeft <= rest + 1) return;
		box.scrollTo({ left: rest, behavior: glide() });
	}

	let revealedSeq = 0;
	$effect(() => {
		const req = ctl.toReveal;
		if (!req || req.seq === revealedSeq || !placed.some((t) => t.id === req.id)) return;
		revealedSeq = req.seq;
		if (mode === 'visual' && pmView) revealPmComment(pmView, req.id);
		reveal(true);
	});
	let composingWas = false;
	$effect(() => {
		if (composing && !composingWas) reveal();
		composingWas = composing;
	});

	let hovered = $state<string | null>(null);
	$effect(() => {
		const root = mode === 'visual' ? pmView?.dom : cmView?.contentDOM;
		if (!root) return;
		function over(e: Event) {
			const hit = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-comment]');
			hovered = hit?.dataset.comment ?? null;
		}
		function leave() {
			hovered = null;
		}
		function click() {
			const collapsed = mode === 'visual' ? pmView?.state.selection.empty : cmView?.state.selection.main.empty;
			if (collapsed) retreat();
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
	onclick={() => reveal()}
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
			hovered={hovered === t.id}
			top={topOf(t.id)}
			onSelect={() => onSelect(t.id)}
			onResolve={() => void ctl.setResolved(t, !t.resolved)}
			onReply={(thread, body) => void ctl.reply(thread, body)}
			onEditMessage={(msg, body) => void ctl.editMessage(msg, body)}
			onDeleteMessage={(thread, msg) => void ctl.removeMessage(thread, msg)}
			onSize={(h) => setHeight(t.id, h)}
		/>
	{/each}
	{#if composing && ctl.pending}
		<CommentComposerCard
			quote={ctl.pending.quote}
			top={topOf(PENDING_ANCHOR)}
			onSubmit={(body) => void ctl.commitAdd(body)}
			onCancel={() => ctl.cancelAdd()}
			onSize={(h) => setHeight(PENDING_ANCHOR, h)}
		/>
	{/if}
</aside>
