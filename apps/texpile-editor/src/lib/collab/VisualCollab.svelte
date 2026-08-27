<script lang="ts">
	// The visual editor's side of a shared session, in one place: consumes collaborators' edits
	// (debounced re-parse of the shared Y.Text, patched into the mounted view as the smallest
	// block range), re-stamps orig after local typing lulls, publishes our caret to awareness,
	// and renders peers' carets through the remote-cursors plugin. Renderless; WorkspaceView
	// mounts it and hands over doc-state access through `api`.
	import { untrack } from 'svelte';
	import * as Y from 'yjs';
	import type { Node as PMNode } from 'prosemirror-model';
	import { setRemoteCursors, type RemotePeerSel } from '$lib/editor/visual/extensions/remoteCursors';
	import { applyRemotePatch, normalizeParsedDoc } from './remotePatch';
	import { computeBlockPatch, protectCaretBlock } from '$lib/editor/visual/blockPatch';
	import { buildBlockMap, pmPosToSourceOffset, sourceOffsetToPmPos } from '$lib/editor/visual/sourceMap';
	import { stripFor } from '$lib/editor/visual/stripFor';
	import { bodyOffsetOf, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import { spliceDiff, EDIT_ORIGIN, SEED_ORIGIN } from '$lib/collab/materialize';
	import { editorViewStore } from '$lib/stores/editorStore';
	import type { EditSession } from '$lib/collab/editSession';

	export type VisualCollabApi = {
		texSource: string;
		/** null until the first parse completes */
		lastParsedSource: string | null;
		readonly docMeta: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;
		/** parse in the worker; null on failure/timeout (the next change retries). */
		parse(text: string): Promise<ParsedLatexFile | null>;
		/** adopt a remote parse: new docMeta + the live doc reference (visualDoc/lastDoc handshake). */
		adopt(parsed: ParsedLatexFile, liveDoc: PMNode): void;
		/** the merged content changed: mark dirty and run the save pipeline (no-op splice included). */
		commit(path: string, content: string): void;
	};

	type Props = {
		session: EditSession;
		path: string | null;
		kind: string | null;
		viewMode: string;
		api: VisualCollabApi;
	};
	let { session, path, kind, viewMode, api }: Props = $props();

	// all visual dialects share this machinery: the orig stamps, the block map and the block patch
	// are format-neutral, so only the markup stripper below is chosen per dialect
	function active() {
		return session.active && (kind === 'tex' || kind === 'md' || kind === 'typ') && viewMode === 'visual';
	}
	function bodyOffset() {
		return api.docMeta ? bodyOffsetOf(api.docMeta) : 0;
	}
	function strip() {
		return stripFor(kind);
	}

	// trace the presence pipeline: set window.texpileCursorDebug = true in DevTools
	function cdbg(...args: unknown[]) {
		if ((globalThis as { texpileCursorDebug?: boolean }).texpileCursorDebug) console.log('[collab-cursor]', ...args);
	}

	// remote edits -> block patch
	let remotePatchTimer: ReturnType<typeof setTimeout> | null = null;
	let remoteParseMs = 0;
	// set by a local visual edit: the doc's orig stamps predate it, so the next quiet moment
	// re-parses purely to refresh them (content usually identical, attrs-only patch)
	let origStale = false;
	// a self-restamp whose patch would rebuild the block the caret is in, held back so the editor
	// never jumps under the user's hands; flushed by publishCursor (the caret left the block), the
	// focusout listener (the editor blurred), or a remote edit's own patch through the same path
	let deferredRestamp = false;
	let deferredIndex = -1;

	/** WorkspaceView calls this from the visual editor's onChange (a local edit just serialized). */
	export function noteLocalEdit(): void {
		if (!active() || !session.collabFor(path)) return;
		origStale = true;
		scheduleRemotePatch(Math.max(800, remoteParseMs * 2));
	}
	/** and this when a full re-parse landed (fresh stamps everywhere). */
	export function noteFreshParse(): void {
		origStale = false;
		deferredRestamp = false;
	}

	function scheduleRemotePatch(delay = Math.max(150, remoteParseMs * 2)) {
		if (remotePatchTimer) return;
		remotePatchTimer = setTimeout(() => {
			remotePatchTimer = null;
			void runRemotePatch();
		}, delay);
	}

	async function runRemotePatch(): Promise<void> {
		const p = path;
		const binding = session.collabFor(p);
		const v = editorViewStore.current;
		if (!binding || !v || !p || !active()) return;
		if (v.composing) return scheduleRemotePatch(250); // never patch under an IME composition
		const snapshot = binding.ytext.toString();
		if (snapshot === api.texSource && !origStale) return;
		const t0 = performance.now();
		const parsed = await api.parse(snapshot);
		remoteParseMs = performance.now() - t0;
		// superseded: the file/mode/view moved on, or more edits landed while parsing
		if (path !== p || !active() || editorViewStore.current !== v) return;
		if (session.collabFor(p)?.ytext !== binding.ytext) return;
		if (binding.ytext.toString() !== snapshot) return scheduleRemotePatch();
		if (!parsed) return; // unparsable mid-edit state; the next change retries
		const oldPreLen = bodyOffset();
		const oldSource = api.texSource;
		const newDoc = normalizeParsedDoc(parsed.doc);
		// A pure self-restamp (no remote edit waiting) whose patch would rebuild the block the
		// caret sits in: hold it. Applying here is what made the editor visibly jump ~1s after
		// typing anything that parses into a different structure (text spilling out of a raw
		// island, a line becoming a list). Nothing is at stake while we wait - the source is
		// already current - so converge when the caret leaves the block (publishCursor), the
		// editor blurs (the focusout effect), or a collaborator's edit forces a real patch.
		if (snapshot === oldSource) {
			const head = v.state.selection.head;
			const guarded = protectCaretBlock(v.state.doc, newDoc, head);
			const patch = computeBlockPatch(v.state.doc, guarded);
			const focused = v.dom.ownerDocument.activeElement;
			if (patch && head > patch.from && head < patch.to && focused && v.dom.contains(focused)) {
				deferredRestamp = true;
				deferredIndex = v.state.doc.resolve(head).index(0);
				return; // origStale stays set; the flush triggers re-schedule
			}
		}
		api.texSource = snapshot;
		api.lastParsedSource = snapshot;
		applyRemotePatch(v, newDoc, strip(), oldSource, snapshot, oldPreLen, bodyOffsetOf(parsed));
		api.adopt(parsed, v.state.doc);
		origStale = false;
		deferredRestamp = false;
		scheduleRemoteCursorRender(); // fresh stamps: re-map peers' carets onto the patched doc
		if (snapshot !== oldSource) api.commit(p, snapshot);
	}

	// watch the open file's Y.Text; our own edits carry EDIT_ORIGIN (and seeds SEED_ORIGIN),
	// everything else is a collaborator
	$effect(() => {
		void session.manifestRev; // rebind when the shared file set changes
		const binding = active() ? session.collabFor(path) : null;
		if (!binding) return;
		const t = binding.ytext;
		function onRemote(ev: Y.YTextEvent) {
			const origin = ev.transaction.origin;
			if (origin === EDIT_ORIGIN || origin === SEED_ORIGIN) return;
			scheduleRemotePatch();
		}
		t.observe(onRemote);
		untrack(() => {
			// edits that landed before this bind (e.g. while this file sat closed or in another mode)
			if (t.toString() !== api.texSource) scheduleRemotePatch();
		});
		return () => {
			t.unobserve(onRemote);
			deferredRestamp = false; // per-file state; the next bind starts clean
			if (remotePatchTimer) {
				clearTimeout(remotePatchTimer);
				remotePatchTimer = null;
			}
		};
	});

	// deferred-restamp flush on blur: focusout bubbles up out of the CM islands too, so this fires
	// for "clicked out of the editor" wherever the focus sat. The timeout lets focus settle first,
	// so a hop between two islands (out of one, into the next) does not read as a blur.
	$effect(() => {
		const v = editorViewStore.current;
		if (!v) return;
		const dom = v.dom;
		const pmView = v;
		function onFocusOut() {
			setTimeout(() => {
				if (!deferredRestamp || pmView.isDestroyed) return;
				const focused = dom.ownerDocument.activeElement;
				if (!focused || !dom.contains(focused)) {
					deferredRestamp = false;
					scheduleRemotePatch(150);
				}
			}, 0);
		}
		dom.addEventListener('focusout', onFocusOut);
		return () => dom.removeEventListener('focusout', onFocusOut);
	});

	// presence: our caret out, peers' carets in
	let visualCursorTimer: ReturnType<typeof setTimeout> | null = null;
	// last published offsets: identical positions never rebroadcast (an equal-content awareness
	// update still bumps clocks, which reads as caret flicker on some consumers)
	let lastPublishedCursor: string | null = null;

	/** WorkspaceView wires this to the visual editor's selection-change callback. */
	export function publishCursor(): void {
		if (visualCursorTimer) return;
		visualCursorTimer = setTimeout(() => {
			visualCursorTimer = null;
			const binding = session.collabFor(path);
			const v = editorViewStore.current;
			if (!binding || !v || !active()) return;
			// the held self-restamp applies once the caret leaves its block (see runRemotePatch)
			if (deferredRestamp) {
				const head = Math.min(v.state.selection.head, v.state.doc.content.size);
				if (v.state.doc.resolve(head).index(0) !== deferredIndex) {
					deferredRestamp = false;
					scheduleRemotePatch(150);
				}
			}
			const map = buildBlockMap(v.state.doc, bodyOffset());
			const sel = v.state.selection;
			let a = pmPosToSourceOffset(v.state.doc, map, sel.anchor);
			let h = sel.head === sel.anchor ? a : pmPosToSourceOffset(v.state.doc, map, sel.head);
			// the orig stamps describe lastParsedSource; carry the offsets across the local edits
			// made since, so a caret inside the active edit lands at the splice end (exact while
			// typing) and everything past it shifts by the edit's delta
			const lastParsed = api.lastParsedSource;
			if (lastParsed != null && api.texSource !== lastParsed) {
				const d = spliceDiff(lastParsed, api.texSource);
				if (d) {
					const splice = d;
					function carry(off: number | null): number | null {
						if (off == null) return null;
						if (off >= splice.index + splice.remove) return off + splice.insert.length - splice.remove;
						return off >= splice.index ? splice.index + splice.insert.length : off;
					}
					a = carry(a);
					h = sel.head === sel.anchor ? a : carry(h);
				}
			}
			if (a == null || h == null) return;
			const ytext = binding.ytext;
			function clamp(n: number) {
				return Math.min(Math.max(0, n), ytext.length);
			}
			const key = `${clamp(a)}:${clamp(h)}`;
			if (key === lastPublishedCursor) return;
			lastPublishedCursor = key;
			cdbg('publish', key);
			binding.awareness.setLocalStateField('cursor', {
				anchor: Y.createRelativePositionFromTypeIndex(binding.ytext, clamp(a)),
				head: Y.createRelativePositionFromTypeIndex(binding.ytext, clamp(h))
			});
		}, 120);
	}

	let remoteCursorTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleRemoteCursorRender() {
		if (remoteCursorTimer) return;
		remoteCursorTimer = setTimeout(() => {
			remoteCursorTimer = null;
			renderRemoteCursors();
		}, 100);
	}

	// map every collaborator's awareness cursor into the visual editor and hand the set to the
	// remote-cursors plugin: relative position -> ytext index -> (carried back to the stamps'
	// coordinates while local edits await re-stamping) -> PM position via the sourceMap
	function renderRemoteCursors() {
		const v = editorViewStore.current;
		if (!v || v.isDestroyed) return;
		const binding = session.collabFor(path);
		if (!binding || !active()) {
			setRemoteCursors(v, []);
			return;
		}
		const doc = v.state.doc;
		const map = buildBlockMap(doc, bodyOffset());
		const lastParsed = api.lastParsedSource;
		const d = lastParsed != null && api.texSource !== lastParsed ? spliceDiff(lastParsed, api.texSource) : null;
		function carryBack(off: number): number {
			return !d ? off : off >= d.index + d.insert.length ? off - d.insert.length + d.remove : off > d.index ? d.index : off;
		}
		const boundText = binding.ytext;
		const peers: RemotePeerSel[] = [];
		const drops: string[] = [];
		binding.awareness.getStates().forEach((state, clientId) => {
			if (clientId === binding.awareness.clientID) return;
			const cur = (state as { cursor?: { anchor?: unknown; head?: unknown } }).cursor;
			const user = (state as { user?: { name?: string; color?: string } }).user ?? {};
			if (!cur?.anchor || !cur?.head) {
				drops.push(`${clientId}: no cursor field`);
				return;
			}
			function abs(rel: unknown) {
				try {
					const a = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(rel as object), boundText.doc!);
					return a && a.type === boundText ? a.index : null;
				} catch {
					return null;
				}
			}
			const ai = abs(cur.anchor);
			const hi = abs(cur.head);
			if (ai == null || hi == null) {
				drops.push(`${clientId}: relpos resolves off-file`);
				return;
			}
			const anchorPm = sourceOffsetToPmPos(doc, map, carryBack(ai), strip());
			const headPm = ai === hi ? anchorPm : sourceOffsetToPmPos(doc, map, carryBack(hi), strip());
			if (anchorPm == null || headPm == null) {
				drops.push(`${clientId}: offset ${ai} maps to no block (preamble?)`);
				return;
			}
			peers.push({
				clientId,
				name: user.name ?? 'Anonymous',
				color: user.color ?? '#888888',
				anchor: anchorPm,
				head: headPm
			});
		});
		cdbg('render', binding.awareness.getStates().size - 1, 'peers ->', peers.length, drops.length ? drops : '');
		setRemoteCursors(v, peers);
	}

	// the cleanup runs on ANY dependency change, so it must only clear presence state on a
	// GENUINE leave (file/mode/session changed), never on a mere rebind - a blind clear here
	// blinks our published cursor on every peer's screen
	$effect(() => {
		void session.manifestRev;
		const v = editorViewStore.current; // re-fires when the view mounts, so carets render on entry
		const binding = active() ? session.collabFor(path) : null;
		if (!binding || !v) return;
		function onAwareness() {
			return scheduleRemoteCursorRender();
		}
		binding.awareness.on('change', onAwareness);
		untrack(() => {
			cdbg('presence bind', path, 'states', binding.awareness.getStates().size);
			scheduleRemoteCursorRender(); // peers may already be mid-file
		});
		return () => {
			binding.awareness.off('change', onAwareness);
			untrack(() => {
				const still = active() && session.collabFor(path)?.ytext === binding.ytext;
				cdbg('presence unbind', still ? '(rebind, keeping cursor)' : '(leave, clearing)');
				if (still) return;
				if (remoteCursorTimer) {
					clearTimeout(remoteCursorTimer);
					remoteCursorTimer = null;
				}
				lastPublishedCursor = null;
				binding.awareness.setLocalStateField('cursor', null); // drop our visual caret from presence
				if (!v.isDestroyed) setRemoteCursors(v, []); // no stale carets after leaving
			});
		};
	});
</script>
