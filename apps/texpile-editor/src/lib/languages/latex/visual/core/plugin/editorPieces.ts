import type { Plugin } from 'prosemirror-state';
import { composeNodeViews, type CanvasViewSet } from '$lib/editor/canvas';
import { latexPlugins } from '../../latexPlugins';
import type { LatexEditorSlot, LatexViewSetup } from './latexPlugin';

export function pluginEditorPlugins(slot: LatexEditorSlot): Plugin[] {
	return latexPlugins.flatMap((plugin) => plugin.editorPlugins?.[slot]?.() ?? []);
}

export function pluginCanvasViews(setup: LatexViewSetup): Required<CanvasViewSet> {
	return composeNodeViews(...latexPlugins.map((plugin) => plugin.canvasViews?.(setup) ?? {}));
}
