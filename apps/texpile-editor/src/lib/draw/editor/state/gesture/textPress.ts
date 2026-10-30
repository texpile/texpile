import type { Point } from '../../figure/geometry';
import type { FigureEditorState } from '../editorState.svelte';
import { hitStatement } from './canvasHits';

/** text in a node already there is typed into, as Excalidraw's text tool labels a shape; else new text, empty */
export function pressText(ed: FigureEditorState, e: PointerEvent, at: Point) {
	const hit = hitStatement(ed, e.target as Element | null).i;
	const st = hit ? ed.tree.byId.get(hit) : null;
	if (st && ed.language.describe(ed.source, st).text) ed.editText(hit);
	else ed.addShape({ tool: 'text', at, text: '' });
}
