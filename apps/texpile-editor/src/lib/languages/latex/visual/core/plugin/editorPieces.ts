// the node views and ProseMirror plugins the plugins give the editor, read off the list
import type { Plugin } from 'prosemirror-state';
import { latexPlugins } from '../../latexPlugins';
import type { LatexEditorSlot, LatexNodeViews, LatexViewSetup } from './latexPlugin';

export function pluginEditorPlugins(slot: LatexEditorSlot): Plugin[] {
	return latexPlugins.flatMap((plugin) => plugin.editorPlugins?.[slot]?.() ?? []);
}

export function pluginNodeViews(setup: LatexViewSetup): LatexNodeViews {
	const views: LatexNodeViews = {};
	for (const plugin of latexPlugins)
		for (const [name, view] of Object.entries(plugin.views?.(setup) ?? {})) {
			if (views[name]) throw new Error(`two LaTeX plugins draw the node ${name}`);
			views[name] = view;
		}
	return views;
}
