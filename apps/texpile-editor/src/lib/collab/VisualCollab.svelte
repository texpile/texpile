<script lang="ts">
	// The visual editor's side of the file's text, in one place: consumes every change it did not make
	// itself (a collaborator, the disk, an undo: debounced re-parse of the Y.Text, patched into the mounted
	// view as the smallest block range), re-parses after local typing lulls so the doc's origins stay
	// fresh, publishes our caret to awareness, and renders peers' carets through the remote-cursors
	// plugin. Renderless; WorkspaceView mounts it and hands over doc-state access through `api`.
	import { untrack } from 'svelte';
	import * as Y from 'yjs';
	import type { Node as PMNode } from 'prosemirror-model';
	import type { Transaction } from 'prosemirror-state';
	import { undo as pmUndo, redo as pmRedo, undoDepth } from 'prosemirror-history';
	import { bindVisualUndo } from '$lib/editor/visual/visualUndo';
	import { setRemoteCursors, type RemotePeerSel } from '$lib/editor/visual/extensions/remoteCursors';
	import { applyRemotePatch } from './remotePatch';
	import { computeBlockPatch, protectCaretBlock } from '$lib/editor/visual/blockPatch';
	import { caretAtOffset, offsetAtPm } from '$lib/editor/visual/sourceMap';
	import type { SourceMap } from '$lib/editor/visual/sourceSpans';
	import type { ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import { EDIT_ORIGIN, SEED_ORIGIN } from '$lib/collab/sharedFiles';
	import { lagOf, toLocal, toShared } from '$lib/collab/lagOffsets';
	import { editorViewStore } from '$lib/stores/editorStore';
	import type { EditSession } from '$lib/collab/editSession';

	export type VisualCollabApi = {
		texSource: string;
		/** null until the first parse completes */
		lastParsedSource: string | null;
		/** where every run of the live doc sits in texSource */
		readonly sourceMap: SourceMap;
		/** parse in the worker; null on failure/timeout (the next change retries). */
		parse(text: string): Promise<ParsedLatexFile | null>;
		/** adopt a remote parse: new docMeta + the live doc reference (visualDoc/lastDoc handshake). */
		adopt(parsed: ParsedLatexFile, liveDoc: PMNode): void;
		/** the merged content changed: mark dirty and run the save pipeline (no-op splice included). */
		commit(path: string, content: string): void;
		/** the file `doc` would be written as */
		textOf(doc: PMNode): string;
	};

	type Props = {
		session: EditSession;
		path: string | null;
		kind: string | null;
		viewMode: string;
		api: VisualCollabApi;
	};
	let { session, path, kind, viewMode, api }: Props = $props();

	// the editor re-assigns its view on every transaction; effects here want only a new one, or a cursor redraw
	// (itself a transaction) re-runs them in a loop
	const mountedView = $derived(editorViewStore.current);

	// all visual dialects share this machinery: the source map and the block patch are format-neutral
	function active() {
		return (kind === 'tex' || kind === 'md' || kind === 'typ') && viewMode === 'visual';
	}

	// trace the presence pipeline: set window.texpileCursorDebug = true in DevTools
	function cdbg(...args: unknown[]) {
		if ((globalThis as { texpileCursorDebug?: boolean }).texpileCursorDebug) console.log('[collab-cursor]', ...args);
	}

	// remote edits -> block patch
	let remotePatchTimer: ReturnType<typeof setTimeout> | null = null;
	let remoteParseMs = 0;
	// set by a local visual edit: the doc's parse predates it, so the next quiet moment
	// re-parses purely to refresh them (content usually identical, attrs-only patch)
	let origStale = false;
	// a self-restamp whose patch would rebuild the block the caret is in, held back so the editor
	// never jumps under the user's hands; flushed by publishCursor (the caret left the block), the
	// focusout listener (the editor blurred), or a remote edit's own patch through the same path
	let deferredRestamp = false;
	let deferredIndex = -1;

	/** WorkspaceView calls this from the visual editor's onChange (a local edit just serialized). */
	export function noteLocalEdit(): void {
		// fresh stamps are for a collaborator's patches; alone it would re-parse a long paper at every pause
		if (!session.active || !active() || !session.collabFor(path)) return;
		origStale = true;
		scheduleRemotePatch(Math.max(800, remoteParseMs * 2));
	}
	/** and this when a full re-parse landed (fresh stamps everywhere). */
	export function noteFreshParse(): void {
		origStale = false;
		deferredRestamp = false;
	}

	function scheduleRemotePatch(delay = Math.max(60, remoteParseMs * 2)) {
		if (remotePatchTimer && delay > 0) return;
		if (remotePatchTimer) clearTimeout(remotePatchTimer);
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
		const oldSource = api.texSource;
		const oldMap = api.sourceMap;
		const newDoc = parsed.doc;
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
		applyRemotePatch(v, newDoc, oldMap, parsed.map, parsed.origins, oldSource, snapshot);
		api.adopt(parsed, v.state.doc);
		origStale = false;
		deferredRestamp = false;
		renderRemoteCursors(); // the patch dropped the carets inside what it replaced
		if (snapshot !== oldSource) api.commit(p, api.texSource);
	}

	// The file's history is the one that counts (source mode and the disk share it), and the editor's own usually
	// holds the same step: it starts a group where the editor does (beforeLocalEdit), so taken from there the step
	// shows at once. A step it does not hold (the disk's, one from source mode) shows once the text is parsed
	let seenDepth = 0;
	let seenView: unknown = null;

	/** a local visual edit is about to go into the text: a new step of the editor's is a new step of the file's */
	export function beforeLocalEdit(): void {
		const v = editorViewStore.current;
		const um = session.collabFor(path)?.undo;
		if (!v || !um) return;
		const depth = undoDepth(v.state);
		if (v === seenView && depth > seenDepth) um.stopCapturing();
		seenView = v;
		seenDepth = depth;
	}

	function step(dir: 'undo' | 'redo'): boolean {
		const binding = session.collabFor(path);
		const um = binding?.undo;
		const v = editorViewStore.current;
		if (!binding || !um || !v || !active()) return false;
		if ((dir === 'undo' ? um.undoStack : um.redoStack).length === 0) return false;
		const mirrored: Transaction[] = [];
		(dir === 'undo' ? pmUndo : pmRedo)(v.state, (tr) => mirrored.push(tr));
		if (dir === 'undo') um.undo();
		else um.redo();
		const taken = mirrored[0];
		if (taken && api.textOf(taken.doc) === binding.ytext.toString()) {
			v.dispatch(taken);
			seenView = v;
			seenDepth = undoDepth(v.state);
		} else scheduleRemotePatch(0);
		return true;
	}
	$effect(() => {
		bindVisualUndo(step);
		return () => bindVisualUndo(null);
	});

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
		const v = mountedView;
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
			// the map describes texSource as it is now, local edits included
			const sel = v.state.selection;
			const ytext = binding.ytext;
			const lag = lagOf(api.texSource, ytext.toString());
			const al = offsetAtPm(api.sourceMap, sel.anchor);
			const hl = sel.head === sel.anchor ? al : offsetAtPm(api.sourceMap, sel.head);
			if (al == null || hl == null) return;
			const a = toShared(lag, al);
			const h = toShared(lag, hl);
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
		}, 50);
	}

	let remoteCursorTimer: ReturnType<typeof setTimeout> | null = null;
	function scheduleRemoteCursorRender() {
		if (remoteCursorTimer) return;
		remoteCursorTimer = setTimeout(() => {
			remoteCursorTimer = null;
			renderRemoteCursors();
		}, 50);
	}

	// map every collaborator's awareness cursor into the visual editor and hand the set to the
	// remote-cursors plugin: relative position -> ytext index -> PM position through the source map
	function renderRemoteCursors() {
		const v = editorViewStore.current;
		if (!v || v.isDestroyed) return;
		const binding = session.collabFor(path);
		if (!binding || !active()) {
			setRemoteCursors(v, []);
			return;
		}
		const map = api.sourceMap;
		const boundText = binding.ytext;
		const lag = lagOf(api.texSource, boundText.toString());
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
			const anchorPm = caretAtOffset(map, api.texSource, toLocal(lag, ai));
			const headPm = ai === hi ? anchorPm : caretAtOffset(map, api.texSource, toLocal(lag, hi));
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
		const v = mountedView; // re-fires when the view mounts, so carets render on entry
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
