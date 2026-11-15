// Logs every caret the visual editor shows after each update: the browser's own, the gap cursor's bar, the caret drawn
// while focus is in a menu, a chip's own CodeMirror caret, a math field, and the outlines of selected chips. Flags a
// moment with no caret or two, and an outline on a chip that is not the selection. Off unless switched on:
//
//   localStorage.setItem('texpile:visual-caret-doctor', '1')   // then reload
//   __visualCaretLog()                                         // the snapshots, problems first
import { GapCursor } from 'prosemirror-gapcursor';
import { NodeSelection, Plugin, TextSelection, type Selection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { scrollParent } from '$lib/editor/visual/scrollParent';
import { caretRect } from '$lib/editor/visual/formatBarScroll';
import { takesCaret } from '$lib/editor/visual/highlight/hiddenSelection';

type CaretMarkKind = 'native' | 'gap' | 'blur' | 'chip-editor' | 'math' | 'chip-outline' | 'node-outline';
type CaretMark = { kind: CaretMarkKind; where: string; rect: number[] };
export type CaretSnapshot = { at: number; key: string | null; selection: string; dom: string; marks: CaretMark[]; problems: string[] };

const CARETS = new Set<CaretMarkKind>(['native', 'gap', 'blur', 'chip-editor', 'math']);
const log: CaretSnapshot[] = [];

export function visualCaretDoctorEnabled(): boolean {
	try {
		return localStorage.getItem('texpile:visual-caret-doctor') === '1';
	} catch {
		return false;
	}
}

function describe(el: Element | null): string {
	if (!el) return '-';
	const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
	return el.tagName.toLowerCase() + cls.map((c) => '.' + c).join('');
}

function rectOf(r: DOMRect): number[] {
	return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
}

function clear(color: string): boolean {
	return color === 'transparent' || color === 'rgba(0, 0, 0, 0)';
}

/** the part of the page the editor's text shows in: its scroll area, less the format bar floating over the top */
function scrollPortOf(el: HTMLElement): { top: number; bottom: number } {
	const port = scrollParent(el)?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight };
	const bar = el.closest('.floating-bar-room')?.querySelector('[data-format-bar]')?.getBoundingClientRect();
	return { top: Math.max(0, port.top, bar?.bottom ?? 0), bottom: Math.min(innerHeight, port.bottom) };
}

function describeSelection(sel: Selection): string {
	const $h = sel.$head;
	const kind =
		sel instanceof GapCursor ? 'gap' : sel instanceof NodeSelection ? 'node' : sel instanceof TextSelection ? 'text' : sel.constructor.name;
	const what = sel instanceof NodeSelection ? sel.node.type.name : $h.parent.type.name;
	const around = `${$h.nodeBefore?.type.name ?? '|'}<>${$h.nodeAfter?.type.name ?? '|'}`;
	return `${kind} ${sel.from}-${sel.to} in ${what} ${around}${sel.empty ? '' : ' (range)'}`;
}

/** the element the browser paints its caret in, and the caret's box */
function nativeCaret(view: EditorView): CaretMark | null {
	const dom = getSelection();
	if (!dom || !dom.rangeCount || !dom.isCollapsed || !view.hasFocus()) return null;
	const node = dom.focusNode;
	if (!node || !view.dom.contains(node)) return null;
	const host = node.nodeType === 1 ? (node as Element) : node.parentElement;
	if (!host || host.closest('.cm-editor, math-field')) return null;
	const child = node.nodeType === 1 ? (node as Element).childNodes[dom.focusOffset] : null;
	// ProseMirror's separator image is drawn as nothing and is no place for a caret
	const into = child instanceof HTMLElement && child.isContentEditable && !child.firstChild && child.getClientRects().length ? child : host;
	if (clear(getComputedStyle(into).caretColor)) return null;
	// a caret in a block that draws something else in place of its text (the bibliography) does not show
	if (!(into as HTMLElement).isContentEditable) return null;
	const r = into !== host ? into.getBoundingClientRect() : (caretRect(node, dom.focusOffset) ?? into.getBoundingClientRect());
	return { kind: 'native', where: describe(into), rect: rectOf(r) };
}

function gapBar(view: EditorView): CaretMark | null {
	const el = view.dom.querySelector('.ProseMirror-gapcursor');
	if (!el) return null;
	const after = getComputedStyle(el, '::after');
	const drawn = after.display !== 'none' && after.content !== 'none' && parseFloat(after.borderTopWidth) > 0 && parseFloat(after.width) > 0;
	const r = el.getBoundingClientRect();
	return {
		kind: 'gap',
		where: drawn ? describe(el.parentElement) : 'gap element without a bar',
		rect: [...rectOf(r).slice(0, 2), Math.round(parseFloat(after.width)), 1]
	};
}

function caretTakerToward(root: Element, from: Element, dir: -1 | 1): Element | null {
	for (let at: Element | null = from; at && at !== root; at = at.parentElement)
		for (
			let el = dir < 0 ? at.previousElementSibling : at.nextElementSibling;
			el;
			el = dir < 0 ? el.previousElementSibling : el.nextElementSibling
		)
			if (takesCaret(el)) return el;
	return null;
}

function snapshot(view: EditorView, key: string | null): CaretSnapshot {
	const sel = view.state.selection;
	const marks: CaretMark[] = [];
	const native = nativeCaret(view);
	if (native) marks.push(native);
	const gap = gapBar(view);
	if (gap) marks.push(gap);
	for (const el of view.dom.querySelectorAll('.pm-blur-cursor'))
		marks.push({ kind: 'blur', where: describe(el.parentElement), rect: rectOf(el.getBoundingClientRect()) });
	const active = document.activeElement;
	// a chip's CodeMirror can keep cm-focused after the focus has left it
	const chip = active && view.dom.contains(active) ? active.closest('.cm-editor') : null;
	const chipCaret = chip?.querySelector('.cm-cursor');
	if (chip && chipCaret)
		marks.push({ kind: 'chip-editor', where: describe(chip.parentElement), rect: rectOf(chipCaret.getBoundingClientRect()) });
	if (active?.tagName === 'MATH-FIELD' && view.dom.contains(active))
		marks.push({ kind: 'math', where: describe(active.parentElement), rect: rectOf(active.getBoundingClientRect()) });
	for (const el of view.dom.querySelectorAll('.drawn-chip-selected'))
		marks.push({ kind: 'chip-outline', where: describe(el), rect: rectOf(el.getBoundingClientRect()) });
	for (const el of view.dom.querySelectorAll('.ProseMirror-selectednode'))
		marks.push({ kind: 'node-outline', where: describe(el), rect: rectOf(el.getBoundingClientRect()) });

	const problems: string[] = [];
	const focused = view.hasFocus() || !!(active && view.dom.contains(active));
	const carets = marks.filter((m) => CARETS.has(m.kind));
	const wantsCaret = sel.empty && !(sel instanceof NodeSelection);
	if (focused && wantsCaret && carets.length === 0) problems.push('no caret shows');
	if (carets.length > 1) problems.push(`${carets.length} carets: ${carets.map((m) => m.kind).join(' + ')}`);
	const port = scrollPortOf(view.dom);
	for (const m of carets)
		if (focused && (m.rect[1] + Math.max(m.rect[3], 1) <= port.top || m.rect[1] >= port.bottom))
			problems.push(`the ${m.kind} caret is off screen`);
	// the browser paints a gap cursor's caret in the gap's element, though it is no place to edit, or the nearest element on
	// either side that takes one. Beside a selected node no walk has seen it paint one
	const hiddenAt = sel instanceof GapCursor ? view.dom.querySelector('.ProseMirror-gapcursor') : null;
	// a range paints no caret, so only a collapsed one can
	const range = getSelection();
	if (focused && active === view.dom && range?.rangeCount && range.isCollapsed && hiddenAt instanceof Element)
		for (const el of [hiddenAt, caretTakerToward(view.dom, hiddenAt, -1), caretTakerToward(view.dom, hiddenAt, 1)])
			if (el && !clear(getComputedStyle(el).caretColor)) problems.push(`a caret can show in ${describe(el)} while the selection is hidden`);
	if (gap && !(sel instanceof GapCursor)) problems.push('gap bar without a gap selection');
	if (gap && gap.where === 'gap element without a bar') problems.push('gap selection with no bar drawn');
	const selectedDom = sel instanceof NodeSelection ? view.nodeDOM(sel.from) : null;
	for (const m of marks.filter((m) => m.kind === 'chip-outline' || m.kind === 'node-outline')) {
		const el = [...view.dom.querySelectorAll('.drawn-chip-selected, .ProseMirror-selectednode')].find((e) => describe(e) === m.where);
		if (!selectedDom || !el || !(selectedDom === el || (selectedDom as Element).contains?.(el)))
			problems.push(`outline on ${m.where} that is not the selection`);
	}
	const domSel = getSelection();
	const dom = domSel?.focusNode
		? `${describe(domSel.focusNode.nodeType === 1 ? (domSel.focusNode as Element) : domSel.focusNode.parentElement)}@${domSel.focusOffset}`
		: '-';
	return { at: Math.round(performance.now()), key, selection: describeSelection(sel), dom, marks, problems };
}

export function visualCaretDoctor(): Plugin[] {
	if (!visualCaretDoctorEnabled()) return [];
	const w = window as unknown as {
		__visualCaretLog?: () => CaretSnapshot[];
		__visualCaretClear?: () => void;
		__visualCaretNow?: () => CaretSnapshot | null;
	};
	let lastKey: string | null = null;
	let current: EditorView | null = null;
	w.__visualCaretLog = () => [...log.filter((s) => s.problems.length), ...log.filter((s) => !s.problems.length)];
	w.__visualCaretClear = () => log.splice(0, log.length);
	w.__visualCaretNow = () => (current ? snapshot(current, lastKey) : null);
	return [
		new Plugin({
			props: {
				handleKeyDown(_view, event) {
					lastKey = [event.shiftKey && 'Shift', event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.key].filter(Boolean).join('+');
					return false;
				}
			},
			view(view) {
				current = view;
				let frame = 0;
				function record() {
					cancelAnimationFrame(frame);
					frame = requestAnimationFrame(() => {
						if (view.isDestroyed) return;
						const s = snapshot(view, lastKey);
						lastKey = null;
						log.push(s);
						if (log.length > 500) log.shift();
						if (s.problems.length) console.warn('[visual-caret-doctor]', s.problems.join('; '), s);
					});
				}
				document.addEventListener('selectionchange', record);
				return {
					update: record,
					destroy() {
						cancelAnimationFrame(frame);
						document.removeEventListener('selectionchange', record);
						if (current === view) current = null;
					}
				};
			}
		})
	];
}
