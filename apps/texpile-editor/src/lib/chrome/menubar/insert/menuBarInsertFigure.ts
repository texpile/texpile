// the drawing item: a new empty TikZ picture in LaTeX, a CeTZ canvas in Typst, then its figure tab so the starters are offered
import { collabHost } from '$lib/collab/hostStore.svelte';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { spliceDiff } from '$lib/collab/spliceDiff';
import { finderFor } from '$lib/draw/host/anchor/pictureFinders';
import { OPEN_FIGURE_AT, type OpenFigureAtDetail } from '$lib/draw/host/card/figureEvents';
import { NEW_PICTURE } from '$lib/draw/tikz/source/inserts/newPictures';
import { CETZ_IMPORT, NEW_CANVAS, importsCetz } from '$lib/draw/cetz/source/pictures';
import { activeCm, cmApply } from '$lib/chrome/menuBarCommands';
import { editorViewStore } from '$lib/stores/editorStore';
import { activeFilePath, workspaceRoot } from '$lib/workspace/workspaceStore';
import type { formatOf } from '$lib/workspace/documentBuffer.svelte';
import { cmAfterLine, insertChips } from './menuBarInsertDrawn';
import { TIKZ, ensurePackage } from './packageOnInsert';

type FigureInsertDeps = { dialect: () => ReturnType<typeof formatOf> };

/** where the picture that went in starts: the last one the change reaches, since a change that also adds the package or import starts above it */
export function newPictureStart(path: string, before: string, after: string): number | null {
	const change = spliceDiff(before, after);
	if (!change) return null;
	const end = change.index + change.insert.length;
	const added = finderFor(path)
		.all(after)
		.filter((picture) => picture.from >= change.index && picture.from <= end);
	return added.at(-1)?.from ?? null;
}

function openPictureTab(path: string, before: string): void {
	const after = collabHost.collabFor(path)?.ytext.toString();
	if (after === undefined) return;
	const from = newPictureStart(path, before, after);
	if (from === null) return;
	const detail: OpenFigureAtDetail = { path, from };
	window.dispatchEvent(new CustomEvent(OPEN_FIGURE_AT, { detail }));
}

function importLine(text: string): string {
	return importsCetz(text) ? '' : `${CETZ_IMPORT}\n\n`;
}

function inSource(dialect: 'tex' | 'typ'): void {
	const cm = activeCm();
	if (!cm) return;
	if (dialect === 'tex') {
		ensurePackage(TIKZ);
		cmAfterLine(cm, NEW_PICTURE.trimEnd(), 0);
		return;
	}
	const lead = importLine(cm.state.doc.toString());
	if (lead) cmApply(cm, { changes: { from: 0, insert: lead } });
	cmAfterLine(cm, NEW_CANVAS.trimEnd(), 0);
}

function inVisual(dialect: 'tex' | 'typ'): void {
	const view = editorViewStore.current;
	if (!view) return;
	if (dialect === 'tex') ensurePackage(TIKZ);
	else if (!importsCetz(view.state.doc.textContent)) {
		const chip = view.state.schema.nodes.raw_latex.create(null, view.state.schema.text(CETZ_IMPORT));
		view.dispatch(view.state.tr.insert(0, chip));
	}
	insertChips([(dialect === 'tex' ? NEW_PICTURE : NEW_CANVAS).trimEnd()], 'block', false, false);
}

/** the Insert > figure item in either mode; false for any other item and for markdown, which has no drawing */
export function makeFigureInsert(deps: FigureInsertDeps): (value: string) => boolean {
	return (value) => {
		const dialect = deps.dialect();
		if (value !== 'figure' || dialect === 'md') return false;
		const path = activeFilePath.current;
		const before = path ? collabHost.collabFor(path)?.ytext.toString() : undefined;
		if (activeCm()) inSource(dialect);
		else inVisual(dialect);
		// a guest edits no figure: the picture goes in and its card says so
		if (path && before !== undefined && workspaceRoot.current !== GUEST_ROOT) openPictureTab(path, before);
		return true;
	};
}
