<script lang="ts">
	// The visual editor's side of a shared session, in one place: consumes collaborators' edits
	// (debounced re-parse of the shared Y.Text, patched into the mounted view as the smallest
	// block range), re-stamps orig after local typing lulls, publishes our caret to awareness,
	// and renders peers' carets through the remote-cursors plugin. Renderless; WorkspaceView
	// mounts it and hands over doc-state access through `api`.
	import { get } from 'svelte/store';
	import { untrack } from 'svelte';
	import * as Y from 'yjs';
	import { TextSelection, EditorState } from 'prosemirror-state';
	import type { EditorView as PMEditorView } from 'prosemirror-view';
	import type { Node as PMNode } from 'prosemirror-model';
	import { fixTables } from 'prosemirror-tables';
	import { schema } from '$lib/schema/schema';
	import { buildTrailingParagraphTr } from '$lib/editor/extensions/trailing-paragraph-plugin';
	import { computeBlockPatch, syncOrigAttrs } from '$lib/editor/blockPatch';
	import { setRemoteCursors, type RemotePeerSel } from '$lib/editor/extensions/remoteCursors';
	import { buildBlockMap, pmPosToSourceOffset, sourceOffsetToPmPos } from '$lib/editor/sourceMap';
	import { bodyOffsetOf, type ParsedLatexFile } from '$lib/workspace/latexRoundtrip';
	import { spliceDiff, EDIT_ORIGIN, SEED_ORIGIN } from '$lib/collab/materialize';
	import { editorViewStore } from '$lib/stores/editorStore';
	import type { EditSession } from '$lib/collab/editSession';

	export interface VisualCollabApi {
		texSource: string;
		lastParsedSource: string;
		readonly docMeta: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> | null;
		/** parse in the worker; null on failure/timeout (the next change retries). */
		parse(text: string): Promise<ParsedLatexFile | null>;
		/** adopt a remote parse: new docMeta + the live doc reference (visualDoc/lastDoc handshake). */
		adopt(parsed: ParsedLatexFile, liveDoc: PMNode): void;
		/** the merged content changed: mark dirty and run the save pipeline (no-op splice included). */
		commit(path: string, content: string): void;
	}

	interface Props {
		session: EditSession;
		path: string | null;
		kind: string | null;
		viewMode: string;
		api: VisualCollabApi;
	}
	let { session, path, kind, viewMode, api }: Props = $props();

	const active = () => session.active && kind === 'tex' && viewMode === 'visual';
	const bodyOffset = () => (api.docMeta ? bodyOffsetOf(api.docMeta) : 0);

	// trace the presence pipeline: set window.texpileCursorDebug = true in DevTools
	const cdbg = (...args: unknown[]) => {
		if ((globalThis as { texpileCursorDebug?: boolean }).texpileCursorDebug) console.log('[collab-cursor]', ...args);
	};

	// ---- remote edits -> block patch ----
	let remotePatchTimer: ReturnType<typeof setTimeout> | null = null;
	let remoteParseMs = 0;
	// set by a local visual edit: the doc's orig stamps predate it, so the next quiet moment
	// re-parses purely to refresh them (content usually identical, attrs-only patch)
	let origStale = false;

	/** WorkspaceView calls this from the visual editor's onChange (a local edit just serialized). */
	export function noteLocalEdit(): void {
		if (!active() || !session.collabFor(path)) return;
		origStale = true;
		scheduleRemotePatch(Math.max(800, remoteParseMs * 2));
	}
	/** and this when a full re-parse landed (fresh stamps everywhere). */
	export function noteFreshParse(): void {
		origStale = false;
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
		const v = get(editorViewStore);
		if (!binding || !v || !p || !active()) return;
		if (v.composing) return scheduleRemotePatch(250); // never patch under an IME composition
		const snapshot = binding.ytext.toString();
		if (snapshot === api.texSource && !origStale) return;
		const t0 = performance.now();
		const parsed = await api.parse(snapshot);
		remoteParseMs = performance.now() - t0;
		// superseded: the file/mode/view moved on, or more edits landed while parsing
		if (path !== p || !active() || get(editorViewStore) !== v) return;
		if (session.collabFor(p)?.ytext !== binding.ytext) return;
		if (binding.ytext.toString() !== snapshot) return scheduleRemotePatch();
		if (!parsed) return; // unparsable mid-edit state; the next change retries
		const oldPreLen = bodyOffset();
		const oldSource = api.texSource;
		const newDoc = normalizeParsedDoc(parsed.doc);
		api.texSource = snapshot;
		api.lastParsedSource = snapshot;
		applyRemotePatch(v, newDoc, oldSource, snapshot, oldPreLen, bodyOffsetOf(parsed));
		api.adopt(parsed, v.state.doc);
		origStale = false;
		scheduleRemoteCursorRender(); // fresh stamps: re-map peers' carets onto the patched doc
		if (snapshot !== oldSource) api.commit(p, snapshot);
	}

	// the mount path's normalization, applied to a fresh parse so it diffs cleanly against the live doc
	function normalizeParsedDoc(doc: PMNode): PMNode {
		let s = EditorState.create({ schema, doc });
		const fix = fixTables(s);
		if (fix) s = s.apply(fix);
		const trail = buildTrailingParagraphTr(s);
		if (trail) s = s.apply(trail);
		return s.doc;
	}

	function applyRemotePatch(
		v: PMEditorView,
		newDoc: PMNode,
		oldSource: string,
		newSource: string,
		oldPreLen: number,
		newPreLen: number
	): void {
		const patch = computeBlockPatch(v.state.doc, newDoc);
		// caret inside the replaced range: re-anchor it through the source (outside it, PM maps it)
		let srcOffset: number | null = null;
		const head = v.state.selection.head;
		if (patch && head > patch.from && head < patch.to) {
			const map = buildBlockMap(v.state.doc, oldPreLen);
			srcOffset = pmPosToSourceOffset(v.state.doc, map, head);
			const d = srcOffset != null ? spliceDiff(oldSource, newSource) : null;
			if (d && srcOffset != null && srcOffset > d.index) {
				// carry the offset across the remote edit so the re-anchor searches the right region
				srcOffset = srcOffset >= d.index + d.remove ? srcOffset + d.insert.length - d.remove : d.index + d.insert.length;
			}
		}
		const tr = v.state.tr;
		if (patch) tr.replaceWith(patch.from, patch.to, patch.nodes);
		syncOrigAttrs(tr, newDoc);
		if (!tr.steps.length) return;
		tr.setMeta('addToHistory', false).setMeta('collabRemotePatch', true);
		if (srcOffset != null) {
			const map = buildBlockMap(tr.doc, newPreLen);
			const pos = sourceOffsetToPmPos(tr.doc, map, srcOffset);
			if (pos != null) tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
		}
		v.dispatch(tr);
	}

	// watch the open file's Y.Text; our own edits carry EDIT_ORIGIN (and seeds SEED_ORIGIN),
	// everything else is a collaborator
	$effect(() => {
		void session.manifestRev; // rebind when the shared file set changes
		const binding = active() ? session.collabFor(path) : null;
		if (!binding) return;
		const t = binding.ytext;
		const onRemote = (ev: Y.YTextEvent) => {
			const origin = ev.transaction.origin;
			if (origin === EDIT_ORIGIN || origin === SEED_ORIGIN) return;
			scheduleRemotePatch();
		};
		t.observe(onRemote);
		untrack(() => {
			// edits that landed before this bind (e.g. while this file sat closed or in another mode)
			if (t.toString() !== api.texSource) scheduleRemotePatch();
		});
		return () => {
			t.unobserve(onRemote);
			if (remotePatchTimer) {
				clearTimeout(remotePatchTimer);
				remotePatchTimer = null;
			}
		};
	});

	// ---- presence: our caret out, peers' carets in ----
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
			const v = get(editorViewStore);
			if (!binding || !v || !active()) return;
			const map = buildBlockMap(v.state.doc, bodyOffset());
			const sel = v.state.selection;
			let a = pmPosToSourceOffset(v.state.doc, map, sel.anchor);
			let h = sel.head === sel.anchor ? a : pmPosToSourceOffset(v.state.doc, map, sel.head);
			// the orig stamps describe lastParsedSource; carry the offsets across the local edits
			// made since, so a caret inside the active edit lands at the splice end (exact while
			// typing) and everything past it shifts by the edit's delta
			if (api.texSource !== api.lastParsedSource) {
				const d = spliceDiff(api.lastParsedSource, api.texSource);
				if (d) {
					const carry = (off: number | null): number | null =>
						off == null
							? null
							: off >= d.index + d.remove
								? off + d.insert.length - d.remove
								: off >= d.index
									? d.index + d.insert.length
									: off;
					a = carry(a);
					h = sel.head === sel.anchor ? a : carry(h);
				}
			}
			if (a == null || h == null) return;
			const clamp = (n: number) => Math.min(Math.max(0, n), binding.ytext.length);
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
		const v = get(editorViewStore);
		if (!v || v.isDestroyed) return;
		const binding = session.collabFor(path);
		if (!binding || !active()) {
			setRemoteCursors(v, []);
			return;
		}
		const doc = v.state.doc;
		const map = buildBlockMap(doc, bodyOffset());
		const d = api.texSource !== api.lastParsedSource ? spliceDiff(api.lastParsedSource, api.texSource) : null;
		const carryBack = (off: number): number =>
			!d ? off : off >= d.index + d.insert.length ? off - d.insert.length + d.remove : off > d.index ? d.index : off;
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
			const abs = (rel: unknown) => {
				try {
					const a = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(rel as object), binding.ytext.doc!);
					return a && a.type === binding.ytext ? a.index : null;
				} catch {
					return null;
				}
			};
			const ai = abs(cur.anchor);
			const hi = abs(cur.head);
			if (ai == null || hi == null) {
				drops.push(`${clientId}: relpos resolves off-file`);
				return;
			}
			const anchorPm = sourceOffsetToPmPos(doc, map, carryBack(ai));
			const headPm = ai === hi ? anchorPm : sourceOffsetToPmPos(doc, map, carryBack(hi));
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
		const v = $editorViewStore; // re-fires when the view mounts, so carets render on entry
		const binding = active() ? session.collabFor(path) : null;
		if (!binding || !v) return;
		const onAwareness = () => scheduleRemoteCursorRender();
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
