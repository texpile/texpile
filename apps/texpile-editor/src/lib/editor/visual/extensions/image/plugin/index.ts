import { Plugin } from 'prosemirror-state';

import type { ImagePluginSettings, ImagePluginState } from '../types';
import { imagePluginKey } from '../imagepluginutils';
import { dropHandler } from './dropHandler';
import { pasteHandler } from './pasteHandler';

export function imagePlugin(pluginSettings: ImagePluginSettings): Plugin<ImagePluginState> {
	return new Plugin({
		key: imagePluginKey,
		state: pluginSettings.createState(pluginSettings),
		props: {
			decorations: pluginSettings.createDecorations,
			handleDOMEvents: {
				paste: pasteHandler(pluginSettings),
				drop: dropHandler(pluginSettings)
			}
		},
		settings: pluginSettings
	});
}
