// plugin spec.view lifecycle, as prosemirror-view's updatePluginViews and destroyPluginViews (2.3)
import type { EditorState, Plugin, PluginView } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export class PluginViews {
	private views: PluginView[] = [];
	private directPlugins: readonly Plugin[] | null = null;
	private statePlugins: readonly Plugin[] | null = null;

	/** the view handed to plugin views: the dev contract proxy in dev and test builds */
	constructor(private readonly view: EditorView) {}

	/** after construction and after every updateState; a changed plugin list destroys and recreates them in order */
	update(state: EditorState, directPlugins: readonly Plugin[], prevState: EditorState | null): void {
		if (!prevState || state.plugins !== this.statePlugins || directPlugins !== this.directPlugins) {
			this.directPlugins = directPlugins;
			this.statePlugins = state.plugins;
			this.destroy();
			for (const plugin of [...directPlugins, ...state.plugins]) if (plugin.spec.view) this.views.push(plugin.spec.view(this.view));
			return;
		}
		for (const pluginView of this.views) pluginView.update?.(this.view, prevState);
	}

	/** last created, first destroyed */
	destroy(): void {
		for (let pluginView = this.views.pop(); pluginView; pluginView = this.views.pop()) pluginView.destroy?.();
	}
}
