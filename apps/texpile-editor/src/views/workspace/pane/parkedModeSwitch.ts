// a parked slot's mode switched in place: the focused editor keeps focus, the slot keeps its top line
import { EditorView as CMView } from '@codemirror/view';
import type { EditorView as PMView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { fileNow, publishFile, type FileParser } from '$lib/workspace/groups/fileFeed.svelte';
import { offsetAtPm, pmAtOffset } from '$lib/editor/visual/sourceMap';
import type { SourceMap } from '$lib/editor/visual/sourceSpans';
import { sourceEditorIn, visualEditorIn } from '$lib/editor/editorsOnScreen.svelte';
import type { EditMode } from '$lib/workspace/viewModeSwitch.svelte';

/** below the floating format bar: the first line a reader sees */
const TOP = 72;

function scrollerOf(view: PMView): HTMLElement | null {
	return view.dom.closest<HTMLElement>('.overflow-auto');
}

type Place = { top: number | null; caret: number | null };

/** the places in the file at the top of the slot's editor and at its caret, now */
function placeIn(cell: HTMLElement, map: SourceMap | null): Place {
	const cm = sourceEditorIn(cell);
	if (cm) return { top: cm.lineBlockAtHeight(cm.scrollDOM.scrollTop + TOP).from, caret: cm.state.selection.main.head };
	const pm = visualEditorIn(cell);
	const box = pm && scrollerOf(pm)?.getBoundingClientRect();
	if (!pm || !box || !map) return { top: null, caret: null };
	const at = pm.posAtCoords({ left: box.left + box.width / 2, top: box.top + TOP });
	return { top: at ? offsetAtPm(map, at.pos) : null, caret: offsetAtPm(map, pm.state.selection.head) };
}

/** the caret is not drawn while parked, but it is where typing goes once the slot takes focus */
function placeAgain(cell: HTMLElement, mode: EditMode, place: Place, map: SourceMap | null, tries = 0): void {
	requestAnimationFrame(() => {
		if (mode === 'source') {
			const cm = sourceEditorIn(cell);
			if (cm) {
				const caret = place.caret == null ? null : Math.min(place.caret, cm.state.doc.length);
				const top = place.top == null ? null : Math.min(place.top, cm.state.doc.length);
				return cm.dispatch({
					...(caret == null ? {} : { selection: { anchor: caret } }),
					...(top == null ? {} : { effects: CMView.scrollIntoView(top, { y: 'start', yMargin: TOP }) })
				});
			}
		} else {
			const pm = visualEditorIn(cell);
			const scroller = pm && scrollerOf(pm);
			if (pm && scroller && map) {
				const size = pm.state.doc.content.size;
				const caret = place.caret == null ? null : pmAtOffset(map, place.caret);
				if (caret != null) {
					const near = TextSelection.near(pm.state.doc.resolve(Math.min(caret, size)));
					pm.dispatch(pm.state.tr.setSelection(near).setMeta('addToHistory', false));
				}
				const top = place.top == null ? null : pmAtOffset(map, place.top);
				if (top != null) scroller.scrollTop += pm.coordsAtPos(Math.min(top, size)).top - scroller.getBoundingClientRect().top - TOP;
				return;
			}
		}
		if (tries < 30) placeAgain(cell, mode, place, map, tries + 1);
	});
}

export async function switchParkedMode(id: number, mode: EditMode, cell: HTMLElement | null, parse: FileParser): Promise<void> {
	const frozen = editorGroups.list.find((g) => g.id === id)?.frozen;
	const path = frozen?.loadedPath as string | null | undefined;
	if (!frozen || !path || frozen.viewMode === mode) return;
	const now = fileNow(path);
	const text = now?.text ?? (frozen.texSource as string);
	const shownMap = (now?.visual?.map ?? frozen.sourceMap ?? null) as SourceMap | null;
	const place = cell ? placeIn(cell, shownMap) : null;
	if (mode === 'source') {
		editorGroups.setParkedMode(id, mode, { ...frozen, viewMode: mode });
		if (cell && place) placeAgain(cell, mode, place, null);
		return;
	}
	// visual: the feed's document when it has the text as it is, else one parsed for it, put up nowhere meanwhile
	let visual = now?.visual?.text === text ? now.visual : null;
	if (!visual) {
		const parsed = await parse(path, text);
		if (!parsed) return; // a file the visual editor cannot show stays in source
		publishFile(path, text, parsed);
		visual = { text, ...parsed };
	}
	// switched again, or moved on, while it parsed
	if (editorGroups.list.find((g) => g.id === id)?.frozen !== frozen) return;
	editorGroups.setParkedMode(id, mode, {
		...frozen,
		viewMode: mode,
		texSource: text,
		visualDoc: visual.doc,
		sourceMap: visual.map,
		docMeta: visual.meta
	});
	if (cell && place) placeAgain(cell, mode, place, visual.map);
}
