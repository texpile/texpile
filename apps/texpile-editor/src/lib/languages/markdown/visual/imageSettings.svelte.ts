// the Markdown editor's image settings: no resize handles, since `![alt](src "title")` carries no width
import type { ImagePluginSettings } from '$lib/editor/visual/extensions/image/types';
import { createTemplateEditorSettings, createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';

export function createMarkdownImageSettings(imageDir?: () => string): ImagePluginSettings {
	const base = imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings();
	return { ...base, enableResize: false };
}
