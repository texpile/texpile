// loaded into the page by the canvas specs: p2304 in a canvas view with the LaTeX faces, in a pane of the app's size
import { EditorState } from 'prosemirror-state';
import { createCanvasView, windowEngine, type CanvasEngine } from '$lib/editor/canvas';
import { latexNodeViews } from '$lib/languages/latex/visual/latexNodeViews';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

const SETTINGS = { justify: true, hyphenate: true, showCaptions: true, imageDirectory: '', cropFormat: 'latex', isMainFile: true };

export function mountPaperView(tex: string, engine: CanvasEngine = windowEngine(window)): HTMLElement {
	const pane = document.body.appendChild(document.createElement('div'));
	pane.style.cssText = 'position:fixed;inset:0;overflow-y:auto;background:rgb(250,250,250)';
	const place = pane.appendChild(document.createElement('main'));
	place.className = 'texpile-main-editor';
	place.style.cssText = 'display:flex;flex-direction:column;max-width:1009px;margin:0 auto';
	const state = EditorState.create({ doc: parseLatexFile(tex).doc });
	const view = createCanvasView(
		place,
		{
			attributes: { class: 'TexpileEditor' },
			state,
			language: 'latex',
			...latexNodeViews({ imageDir: () => '', onJumpToLabel: () => {}, onJumpToDefinition: () => {} } as never),
			dispatchTransaction(tr) {
				view.updateState(view.state.apply(tr));
			}
		},
		{ engine, settings: () => SETTINGS, probe: { path: () => 'p2304/main.tex' } }
	);
	return pane;
}
