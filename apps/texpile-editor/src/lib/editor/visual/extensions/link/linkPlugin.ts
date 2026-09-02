// auto-links pasted URLs and shows a tooltip when the cursor sits in a link
import { Plugin, PluginKey, type EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Mark, MarkType, Node } from 'prosemirror-model';
import { createLinkTooltip, destroyLinkTooltip } from './linkTooltipFactory.svelte';

export type LinkPluginState = {
	activeLinkMark: Mark | null;
	linkFrom: number;
	linkTo: number;
	tooltipVisible: boolean;
};

export const LINK_PLUGIN_KEY = new PluginKey<LinkPluginState>('link-tooltip');

/** set on a transaction that writes link attrs itself, so the href sync below leaves it alone */
const LINK_ATTRS_SET = 'link-attrs-set';

type LinkRange = { mark: Mark; from: number; to: number; text: string };

/** every run of adjacent text carrying one link mark, with the text it shows */
function linkRanges(doc: Node, linkType: MarkType): LinkRange[] {
	const pieces: LinkRange[] = [];
	doc.descendants((node, pos) => {
		if (!node.isText) return true;
		const mark = node.marks.find((mk) => mk.type === linkType);
		if (mark) pieces.push({ mark, from: pos, to: pos + node.nodeSize, text: node.text ?? '' });
		return true;
	});
	const out: LinkRange[] = [];
	for (const piece of pieces) {
		const last = out[out.length - 1];
		if (last && last.to === piece.from && last.mark.eq(piece.mark)) {
			last.to = piece.to;
			last.text += piece.text;
		} else out.push(piece);
	}
	return out;
}

const URL_REGEX = /https?:\/\/[^\s<>[\]{}|\\^]+|www\.[^\s<>[\]{}|\\^]+/gi;

function isValidUrl(text: string): boolean {
	try {
		let urlToTest = text;
		if (text.startsWith('www.')) {
			urlToTest = 'https://' + text;
		}
		new URL(urlToTest);
		return URL_REGEX.test(text);
	} catch {
		return false;
	}
}

function normalizeUrl(url: string): string {
	if (url.startsWith('www.')) {
		return 'https://' + url;
	}
	return url;
}

/** finds the link mark at pos plus the full extent of adjacent text carrying the same mark. */
function getLinkMarkAtPos(state: EditorState, pos: number): { mark: Mark; from: number; to: number } | null {
	const $pos = state.doc.resolve(pos);
	const linkType = state.schema.marks.link;
	if (!linkType) return null;

	const marks = $pos.marks();
	const linkMark = marks.find((m) => m.type === linkType);
	if (!linkMark) return null;

	const parent = $pos.parent;
	const parentOffset = $pos.parentOffset;

	// find the text node containing pos
	let offset = 0;
	for (let i = 0; i < parent.childCount; i++) {
		const child = parent.child(i);
		const childStart = offset;
		const childEnd = offset + child.nodeSize;

		if (parentOffset >= childStart && parentOffset <= childEnd) {
			if (child.isText && child.marks.some((m) => m.type === linkType && m.eq(linkMark))) {
				let from = $pos.start() + childStart;
				let to = $pos.start() + childEnd;

				for (let j = i - 1; j >= 0; j--) {
					const prevChild = parent.child(j);
					if (prevChild.isText && prevChild.marks.some((m) => m.type === linkType && m.eq(linkMark))) {
						from -= prevChild.nodeSize;
					} else {
						break;
					}
				}

				for (let j = i + 1; j < parent.childCount; j++) {
					const nextChild = parent.child(j);
					if (nextChild.isText && nextChild.marks.some((m) => m.type === linkType && m.eq(linkMark))) {
						to += nextChild.nodeSize;
					} else {
						break;
					}
				}

				return { mark: linkMark, from, to };
			}
		}
		offset += child.nodeSize;
	}

	return null;
}

function showLinkTooltip(
	view: EditorView,
	mark: Mark,
	from: number,
	to: number,
	onUpdate: (href: string, text: string) => void,
	onRemove: () => void,
	onClose: () => void,
	onOpen?: (href: string) => boolean
) {
	const coords = view.coordsAtPos(from);

	createLinkTooltip({
		href: mark.attrs.href,
		text: view.state.doc.textBetween(from, to),
		position: { x: coords.left, y: coords.bottom },
		onUpdate,
		onRemove,
		onOpen,
		onClose
	});
}

export type LinkPluginOptions = {
	/** intercept the tooltip's "open" action: return true when handled (a workspace-relative
	 * markdown link opening in the editor), false to fall through to the browser. */
	onOpen?: (href: string) => boolean;
};

export function createLinkPlugin(opts: LinkPluginOptions = {}) {
	return new Plugin<LinkPluginState>({
		key: LINK_PLUGIN_KEY,

		state: {
			init(): LinkPluginState {
				return {
					activeLinkMark: null,
					linkFrom: 0,
					linkTo: 0,
					tooltipVisible: false
				};
			},

			apply(tr, value, oldState, newState): LinkPluginState {
				if (!tr.docChanged && !tr.selectionSet) {
					return value;
				}

				const selection = newState.selection;

				// only for a collapsed cursor
				if (!(selection instanceof TextSelection) || !selection.empty) {
					return {
						activeLinkMark: null,
						linkFrom: 0,
						linkTo: 0,
						tooltipVisible: false
					};
				}

				const linkInfo = getLinkMarkAtPos(newState, selection.from);

				if (linkInfo) {
					return {
						activeLinkMark: linkInfo.mark,
						linkFrom: linkInfo.from,
						linkTo: linkInfo.to,
						tooltipVisible: true
					};
				}

				return {
					activeLinkMark: null,
					linkFrom: 0,
					linkTo: 0,
					tooltipVisible: false
				};
			}
		},

		// A link whose text IS its address (a \url{}, an autolink, the toolbar's https:// placeholder)
		// must keep the two together: typing into the text used to leave the href behind, so the
		// tooltip and the Open button still pointed at the old address.
		appendTransaction(trs, oldState, newState) {
			const linkType = newState.schema.marks.link;
			if (!linkType || !trs.some((tr) => tr.docChanged)) return null;
			if (trs.some((tr) => tr.getMeta(LINK_PLUGIN_KEY) === LINK_ATTRS_SET)) return null;

			const selfTitled = new Set<string>();
			for (const r of linkRanges(oldState.doc, linkType)) if (r.text === r.mark.attrs.href) selfTitled.add(r.text);
			if (!selfTitled.size) return null;

			let tr = newState.tr;
			let changed = false;
			for (const r of linkRanges(newState.doc, linkType)) {
				if (!r.text || r.text === r.mark.attrs.href || !selfTitled.has(r.mark.attrs.href)) continue;
				tr = tr.removeMark(r.from, r.to, linkType).addMark(r.from, r.to, linkType.create({ ...r.mark.attrs, href: r.text }));
				changed = true;
			}
			return changed ? tr : null;
		},

		props: {
			// clicking a link shouldn't navigate; PM handles selection
			handleClick(view, pos, event) {
				const target = event.target as HTMLElement;
				if (target.tagName === 'A' && target.hasAttribute('href')) {
					event.preventDefault();
					return false;
				}
				return false;
			},

			handlePaste(view, event, _slice) {
				const text = event.clipboardData?.getData('text/plain')?.trim();
				if (!text) return false;

				if (!isValidUrl(text)) return false;

				const { state, dispatch } = view;
				const { from, to } = state.selection;
				const linkType = state.schema.marks.link;

				if (!linkType) return false;

				// wrap selected text with the link, else insert the URL as the link text
				const hasSelection = from !== to;
				const href = normalizeUrl(text);

				if (hasSelection) {
					const tr = state.tr.addMark(from, to, linkType.create({ href, title: null }));
					dispatch(tr);
				} else {
					const linkMark = linkType.create({ href, title: null });
					const textNode = state.schema.text(text, [linkMark]);
					const tr = state.tr.replaceSelectionWith(textNode, false);
					dispatch(tr);
				}

				return true;
			}
		},

		view(editorView) {
			let currentState: LinkPluginState = {
				activeLinkMark: null,
				linkFrom: 0,
				linkTo: 0,
				tooltipVisible: false
			};
			// whether the tooltip is mounted right now: the plugin state alone cannot say, since the
			// tooltip closes itself (outside click, Escape, scroll) and after a save. Without this a
			// click back onto the same link compared equal and never reopened it.
			let shown = false;
			let suppress = false;

			function hide() {
				destroyLinkTooltip();
				shown = false;
			}

			function updateTooltip() {
				const pluginState = LINK_PLUGIN_KEY.getState(editorView.state);
				if (!pluginState) return;

				const stateChanged =
					pluginState.activeLinkMark !== currentState.activeLinkMark ||
					pluginState.linkFrom !== currentState.linkFrom ||
					pluginState.linkTo !== currentState.linkTo;

				if (!stateChanged && shown) return;

				currentState = pluginState;

				if (!pluginState.activeLinkMark || !pluginState.tooltipVisible || suppress) {
					hide();
					return;
				}

				showLinkTooltip(
					editorView,
					pluginState.activeLinkMark,
					pluginState.linkFrom,
					pluginState.linkTo,
					(href, text) => {
						// the address and the display text, each written from its own field
						const { state, dispatch } = editorView;
						const linkType = state.schema.marks.link;
						if (!linkType) return;

						const from = pluginState.linkFrom;
						const to = pluginState.linkTo;
						const currentText = state.doc.textBetween(from, to);
						// every other attr (title from a markdown link, bare from a \url) survives the edit
						const newMark = linkType.create({ ...pluginState.activeLinkMark?.attrs, href });

						let tr = state.tr;

						if (text && text !== currentText) {
							tr = tr.replaceWith(from, to, state.schema.text(text, [newMark]));
						} else {
							tr = tr.removeMark(from, to, linkType).addMark(from, to, newMark);
						}

						suppress = true; // the cursor is still in the link; do not reopen on this dispatch
						dispatch(tr.setMeta(LINK_PLUGIN_KEY, LINK_ATTRS_SET));
						suppress = false;
						hide();
					},
					() => {
						const { state, dispatch } = editorView;
						const linkType = state.schema.marks.link;
						if (!linkType) return;

						const tr = state.tr.removeMark(pluginState.linkFrom, pluginState.linkTo, linkType);
						suppress = true; // the cursor is still in the link; do not reopen on this dispatch
						dispatch(tr.setMeta(LINK_PLUGIN_KEY, LINK_ATTRS_SET));
						suppress = false;
						hide();
					},
					hide,
					opts.onOpen
				);
				shown = true;
			}

			return {
				update(_view) {
					updateTooltip();
				},

				destroy() {
					hide();
				}
			};
		}
	});
}
