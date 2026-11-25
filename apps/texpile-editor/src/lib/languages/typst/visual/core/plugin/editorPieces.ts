// the node views and ProseMirror plugins the plugins give the editor, read off the list
import type { Plugin } from 'prosemirror-state';
import { composeNodeViews, type CanvasViewSet } from '$lib/editor/canvas';
import { typstPlugins } from '../../typstPlugins';
import type { TypstEditorSlot, TypstViewSetup } from './typstPlugin';

export function pluginEditorPlugins(slot: TypstEditorSlot): Plugin[] {
	return typstPlugins.flatMap((plugin) => plugin.editorPlugins?.[slot]?.() ?? []);
}

export function pluginCanvasViews(setup: TypstViewSetup): Required<CanvasViewSet> {
	return composeNodeViews(...typstPlugins.map((plugin) => plugin.canvasViews?.(setup) ?? {}));
}
