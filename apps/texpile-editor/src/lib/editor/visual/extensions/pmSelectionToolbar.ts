// The selection toolbar in the visual editor: the shared row of buttons, floating above the selection
import { Plugin, TextSelection } from 'prosemirror-state';
import { toggleMark } from 'prosemirror-commands';
import type { EditorView } from 'prosemirror-view';
import { m } from '$lib/paraglide/messages';
import { markIsActive, toggleLinkCommand } from '../toolbar/markState';
import type { SelectionFormatButton } from '$lib/editor/selectionToolbarRow';
import { settings } from '$lib/settings';
import { observe } from '$lib/runes/observe.svelte';
import { selectionToolbarRow } from '$lib/editor/selectionToolbarRow';
import type { CommentAnchor } from '$lib/comments/anchor';
import { visibleBox } from '../visibleBox';
import { setPmCommentPending, type SourceAnchorFn } from './pmComments';

function icon(body: string): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
const BOLD = icon('<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>');
const ITALIC = icon('<line x1="19" x2="10" y1="4" y2="4"/><line x1="14" x2="5" y1="20" y2="20"/><line x1="15" x2="9" y1="4" y2="20"/>');
const UNDERLINE = icon('<path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/>');
const CODE = icon('<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>');
const LINK = icon(
	'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
);

/** the marks a split's slot offers over the selection, since it has no toolbar of its own */
function formatButtons(view: EditorView): SelectionFormatButton[] {
	const marks = view.state.schema.marks;
	const wanted: [string, string, string][] = [
		['strong', m.toolbar_bold_aria(), BOLD],
		['em', m.toolbar_italic_aria(), ITALIC],
		['u', m.toolbar_underline_aria(), UNDERLINE],
		['code', m.menubar_format_inline_code(), CODE]
	];
	const out = wanted
		.filter(([name]) => marks[name])
		.map(([name, label, svg]) => ({
			label,
			svg,
			run: () => toggleMark(marks[name])(view.state, view.dispatch),
			active: () => markIsActive(view.state, marks[name])
		}));
	if (marks.link)
		out.push({
			label: m.mdtoolbar_link(),
			svg: LINK,
			run: () => toggleLinkCommand(marks.link)(view.state, view.dispatch),
			active: () => markIsActive(view.state, marks.link)
		});
	return out;
}

/** the row fades in rather than flashing under the pointer for every drag it passes through */
const SHOW_DELAY = 120;
const HEIGHT = 26;

/**
 * The row for a non-empty selection, floating ABOVE it.
 *
 * Above rather than the source editor's left-margin placement, because the visual editor's left
 * margin is already spoken for: the block-handle plugin parks its + and drag grips there, and the
 * row landed on top of them. Centred over the selection on one line; over the selection head when
 * it spans lines. Flips below when the selection starts at the top of the window.
 *
 * Structurally simpler than the CodeMirror twin because ProseMirror permits layout reads in a
 * plugin view's update(); there is no requestMeasure discipline to follow. Scroll and pane-resize
 * move the text without an editor update, so a capture-phase scroll listener and a ResizeObserver
 * cover what update() cannot see.
 */
export function pmSelectionToolbar(onAdd: (anchor: CommentAnchor | null) => void, label: string, sourceAnchor: SourceAnchorFn): Plugin {
	return new Plugin({
		view(view) {
			const row = selectionToolbarRow(
				label,
				() => {
					const sel = view.state.selection;
					if (!(sel instanceof TextSelection) || sel.empty) return;
					const anchor = sourceAnchor(view.state.doc, sel.from, sel.to);
					onAdd(anchor);
					// the composer is about to take focus and the browser will hide the native
					// selection with it; pin the commented text under a decoration until it closes
					if (anchor) setPmCommentPending(view, { from: sel.from, to: sel.to });
				},
				() => hide(),
				formatButtons(view)
			);
			const dom = row.dom;
			// NEXT TO the editor, never inside it: view.dom is the contenteditable ProseMirror root,
			// whose children the view owns - its mutation observer treats a foreign child as document
			// DOM and removes it (the CodeMirror twin gets away with view.dom.appendChild because CM's
			// view.dom is a wrapper around the editable area, not the editable area itself). The
			// parent also sits outside the zoom style EditorView puts on the root, which would have
			// scaled the fixed-position row against its own coordinates.
			(view.dom.parentElement ?? document.body).appendChild(dom);

			let timer: ReturnType<typeof setTimeout> | null = null;
			let shown = false;
			function hide() {
				if (timer) {
					clearTimeout(timer);
					timer = null;
				}
				shown = false;
				dom.classList.remove('cm-comment-add-visible');
				dom.style.display = 'none';
			}
			function place() {
				const sel = view.state.selection;
				// the floating format bar carries the formatting in every layout now
				const formatting = false;
				// turned off in Preferences: only the comment half goes
				const commenting = settings.current.commentPill !== false;
				if ((!formatting && !commenting) || !(sel instanceof TextSelection) || sel.empty) {
					hide();
					return;
				}
				let a: { top: number; bottom: number; left: number; right: number };
				let b: typeof a;
				try {
					a = view.coordsAtPos(sel.from);
					b = view.coordsAtPos(sel.to);
				} catch {
					hide();
					return;
				}
				const head = sel.head === sel.from ? a : b;
				const oneLine = Math.abs(a.top - b.top) < 2;
				const cx = oneLine ? (a.left + b.right) / 2 : (head.left + head.right) / 2;
				const anchor = oneLine ? a : head;
				// the PANE, not the window: the row is fixed, so nothing clips it, and a selection that
				// scrolled under the toolbar or glided aside for a comment card took it over the sidebar.
				// hide rather than park the row at the edge
				const pane = visibleBox(view.dom);
				if (head.bottom < pane.top || head.top > pane.bottom || cx < pane.left || cx > pane.right) {
					hide();
					return;
				}
				// above the line, else below it when the selection starts at the top of the pane
				const top = anchor.top - HEIGHT - 6 >= pane.top + 4 ? anchor.top - HEIGHT - 6 : anchor.bottom + 6;
				row.sync({ format: formatting, comment: commenting });
				// display before measuring: offsetWidth is 0 while the row is hidden, and Refine changes its width
				dom.style.display = 'flex';
				const half = (dom.offsetWidth || 48) / 2;
				dom.style.top = `${top}px`;
				dom.style.left = `${Math.min(Math.max(cx - half, pane.left + 4), pane.right - half * 2 - 4)}px`;
				if (!shown && !timer) {
					timer = setTimeout(() => {
						timer = null;
						shown = true;
						dom.classList.add('cm-comment-add-visible');
					}, SHOW_DELAY);
				}
			}
			const win = view.dom.ownerDocument.defaultView ?? window;
			win.addEventListener('scroll', place, true);
			const ro = new ResizeObserver(place);
			ro.observe(view.dom);
			// the toggle has to bite without waiting for the next selection change, in both directions
			const unsub = observe(
				() => settings.current,
				() => place()
			);
			return {
				update: place,
				destroy() {
					win.removeEventListener('scroll', place, true);
					ro.disconnect();
					unsub();
					if (timer) clearTimeout(timer);
					dom.remove();
				}
			};
		}
	});
}
