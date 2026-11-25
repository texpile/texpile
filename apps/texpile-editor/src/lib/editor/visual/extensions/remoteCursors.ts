// Remote collaborator presence in the visual editor: a caret with its name label and a selection tint.
// peersOnText maps the awareness cursors through the source map; the plugin only renders. The caret layer draws the
// caret from the widget's canvas form, so a peer's cursor never moves a glyph.
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { paintRange } from '$lib/editor/visual/highlight/paintRange';
import type { Node as PMNode } from 'prosemirror-model';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { CanvasWidget } from '$lib/editor/canvas';
import { caretAtOffset } from '$lib/editor/visual/sourceMap';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';
import { lagOf, toLocal } from '$lib/collab/lagOffsets';
import './remoteCursors.css';

export type RemotePeerSel = {
	clientId: number;
	name: string;
	color: string;
	/** PM positions, already clamped-mapped by the caller. */
	anchor: number;
	head: number;
};

type PeerHead = { clientId: number; head: number; name: string; color: string; arrival: number };
type RemoteCursorsState = { decos: DecorationSet; heads: PeerHead[] };

export const remoteCursorsKey = new PluginKey<RemoteCursorsState>('remote-cursors');

// a peer's color rides untrusted awareness; only these two shapes reach an inline style string,
// so a crafted value (e.g. "red;background:url(https://evil/x)") can't inject extra CSS. The hsl
// form is what a peer on a build before the palette sends, and showing their real color beats
// showing everyone the same gray
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const HSL_COLOR = /^hsl\(\d{1,3}deg \d{1,3}% \d{1,3}%\)$/;
function safeColor(c: string): string {
	return HEX_COLOR.test(c) || HSL_COLOR.test(c) ? c : '#888888';
}

// the caret layer draws it from the spec's canvas form; prosemirror-view's widget API still wants an element
function caretHolder(): HTMLElement {
	return document.createElement('span');
}

let arrivals = 0;

/** a peer keeps its arrival while it moves inside one textblock; another textblock shows its name again */
function arrivalOf(doc: PMNode, head: number, peer: RemotePeerSel, color: string, before: PeerHead | undefined): number {
	const same = before && before.name === peer.name && before.color === color && doc.resolve(before.head).sameParent(doc.resolve(head));
	return same ? before.arrival : ++arrivals;
}

function build(doc: PMNode, peers: RemotePeerSel[], before: readonly PeerHead[]): RemoteCursorsState {
	const decos: Decoration[] = [];
	const heads: PeerHead[] = [];
	const max = doc.content.size;
	function clamp(n: number) {
		return Math.min(Math.max(0, n), max);
	}
	for (const p of peers) {
		const color = safeColor(p.color);
		const anchor = clamp(p.anchor);
		const head = clamp(p.head);
		if (anchor !== head) {
			const from = Math.min(anchor, head);
			const to = Math.max(anchor, head);
			const tint = `color-mix(in srgb, ${color} 20%, transparent)`;
			// nothing of a peer's selection is painted by the browser, so all of it is drawn, in the
			// shape a selection of our own would have
			decos.push(
				...paintRange(doc, {
					from,
					to,
					tint,
					reach: 'line',
					class: 'pm-remote-sel'
				})
			);
		}
		const arrival = arrivalOf(
			doc,
			head,
			p,
			color,
			before.find((each) => each.clientId === p.clientId)
		);
		heads.push({ clientId: p.clientId, head, name: p.name, color, arrival });
		decos.push(
			Decoration.widget(head, caretHolder, {
				key: `caret:${p.clientId}:${color}:${p.name}`,
				side: 0,
				ignoreSelection: true,
				canvas: { kind: 'caret', peer: { name: p.name, color, arrival } } satisfies CanvasWidget
			})
		);
	}
	return { decos: DecorationSet.create(doc, decos), heads };
}

/** replace the rendered peer set (empty array clears). */
export function setRemoteCursors(view: EditorView, peers: RemotePeerSel[]): void {
	if (peers.length === 0 && !remoteCursorsKey.getState(view.state)?.decos.find().length) return;
	view.dispatch(view.state.tr.setMeta(remoteCursorsKey, peers).setMeta('addToHistory', false));
}

export const remoteCursorsPlugin = new Plugin<RemoteCursorsState>({
	key: remoteCursorsKey,
	state: {
		init: () => ({ decos: DecorationSet.empty, heads: [] }),
		apply(tr, prev) {
			const peers = tr.getMeta(remoteCursorsKey) as RemotePeerSel[] | undefined;
			const heads = tr.docChanged ? prev.heads.map((each) => ({ ...each, head: tr.mapping.map(each.head) })) : prev.heads;
			if (peers) return build(tr.doc, peers, heads);
			// between updates, ride along with document changes
			if (!tr.docChanged) return prev;
			return {
				decos: prev.decos.map(tr.mapping, tr.doc),
				heads
			};
		}
	},
	props: {
		decorations(state) {
			return remoteCursorsKey.getState(state)?.decos;
		}
	}
});

/**
 * Every collaborator's awareness cursor on this file, as positions in the document `map` was made for:
 * relative position, then index in the shared text, then the offset in `text` (the text the document is
 * of, which may not have every shared edit in yet), then the document. Carets on other files, or on a
 * part of this one the document does not show, are left out
 */
export function peersOnText(shared: { ytext: Y.Text; awareness: Awareness }, text: string, map: SourceMap): RemotePeerSel[] {
	const { ytext, awareness } = shared;
	const lag = lagOf(text, ytext.toString());
	function indexOf(rel: unknown): number | null {
		try {
			const at = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(rel as object), ytext.doc!);
			return at && at.type === ytext ? at.index : null;
		} catch {
			return null;
		}
	}
	const peers: RemotePeerSel[] = [];
	awareness.getStates().forEach((state, clientId) => {
		if (clientId === awareness.clientID) return;
		const cur = (state as { cursor?: { anchor?: unknown; head?: unknown } }).cursor;
		const user = (state as { user?: { name?: string; color?: string } }).user ?? {};
		if (!cur?.anchor || !cur?.head) return;
		const ai = indexOf(cur.anchor);
		const hi = indexOf(cur.head);
		if (ai == null || hi == null) return;
		const anchor = caretAtOffset(map, text, toLocal(lag, ai));
		const head = ai === hi ? anchor : caretAtOffset(map, text, toLocal(lag, hi));
		if (anchor == null || head == null) return;
		peers.push({ clientId, name: user.name ?? 'Anonymous', color: user.color ?? '#888888', anchor, head });
	});
	return peers;
}
