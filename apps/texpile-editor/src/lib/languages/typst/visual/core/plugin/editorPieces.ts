// the node views and ProseMirror plugins the plugins give the editor, read off the list
import type { Plugin } from 'prosemirror-state';
import { typstPlugins } from '../../typstPlugins';
import type { TypstEditorSlot, TypstNodeViews, TypstViewSetup } from './typstPlugin';

export function pluginEditorPlugins(slot: TypstEditorSlot): Plugin[] {
	return typstPlugins.flatMap((plugin) => plugin.editorPlugins?.[slot]?.() ?? []);
}

export function pluginNodeViews(setup: TypstViewSetup): TypstNodeViews {
	const views: TypstNodeViews = {};
	for (const plugin of typstPlugins)
		for (const [name, view] of Object.entries(plugin.views?.(setup) ?? {})) {
			if (views[name]) throw new Error(`two Typst plugins draw the node ${name}`);
			views[name] = view;
		}
	return views;
}
