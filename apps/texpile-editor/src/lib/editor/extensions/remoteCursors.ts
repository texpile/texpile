// Remote collaborator presence in the visual editor: a caret bar + name label and a selection
// tint. Positions arrive pre-mapped to PM
// coordinates (WorkspaceView runs the awareness -> sourceMap chain); this plugin only renders.
// Every element is layout-inert: zero-width in-flow anchors with out-of-flow bars, tint via
// background, so a peer's cursor can never move a glyph.
import { Plugin, PluginKey } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PMNode } from 'prosemirror-model';
import './remoteCursors.css';

export interface RemotePeerSel {
	clientId: number;
	name: string;
	color: string;
	/** PM positions, already clamped-mapped by the caller. */
	anchor: number;
	head: number;
}

export const remoteCursorsKey = new PluginKey<DecorationSet>('remote-cursors');

// a peer's color rides untrusted awareness; only hex passes before it reaches an inline style string,
// so a crafted value (e.g. "red;background:url(https://evil/x)") can't inject extra CSS
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const safeColor = (c: string): string => (HEX_COLOR.test(c) ? c : '#888888');

function caretDom(name: string, color: string): HTMLElement {
	const span = document.createElement('span');
	span.className = 'pm-remote-caret';
	span.style.setProperty('--peer-color', color);
	span.appendChild(document.createTextNode('⁠')); // zero-width content gives the bar line height
	const label = document.createElement('span');
	label.className = 'pm-remote-caret-label';
	label.textContent = name;
	span.appendChild(label);
	return span;
}

function build(doc: PMNode, peers: RemotePeerSel[]): DecorationSet {
	const decos: Decoration[] = [];
	const max = doc.content.size;
	const clamp = (n: number) => Math.min(Math.max(0, n), max);
	for (const p of peers) {
		const color = safeColor(p.color);
		const anchor = clamp(p.anchor);
		const head = clamp(p.head);
		if (anchor !== head) {
			decos.push(
				Decoration.inline(Math.min(anchor, head), Math.max(anchor, head), {
					class: 'pm-remote-sel',
					style: `background-color: ${color}33`
				})
			);
		}
		decos.push(
			Decoration.widget(head, () => caretDom(p.name, color), {
				key: `caret:${p.clientId}:${color}:${p.name}`,
				side: 0,
				ignoreSelection: true
			})
		);
	}
	return DecorationSet.create(doc, decos);
}

/** replace the rendered peer set (empty array clears). */
export function setRemoteCursors(view: EditorView, peers: RemotePeerSel[]): void {
	view.dispatch(view.state.tr.setMeta(remoteCursorsKey, peers).setMeta('addToHistory', false));
}

export const remoteCursorsPlugin = new Plugin<DecorationSet>({
	key: remoteCursorsKey,
	state: {
		init: () => DecorationSet.empty,
		apply(tr, set) {
			const peers = tr.getMeta(remoteCursorsKey) as RemotePeerSel[] | undefined;
			if (peers) return build(tr.doc, peers);
			// between updates, ride along with document changes
			return tr.docChanged ? set.map(tr.mapping, tr.doc) : set;
		}
	},
	props: {
		decorations(state) {
			return remoteCursorsKey.getState(state);
		}
	}
});
