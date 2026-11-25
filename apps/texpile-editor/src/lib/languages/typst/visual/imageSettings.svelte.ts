// the Typst editor's image settings: resize handles on, a drag's width written as a share of the column, Typst's crop
import type { ImagePluginSettings } from '$lib/editor/visual/extensions/image/types';
import { createTemplateEditorSettings, createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import { typstCropFormat } from './extensions/typstImageCrop';

export function createTypstImageSettings(imageDir?: () => string): ImagePluginSettings {
	const base = imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings();
	return { ...base, enableResize: true, cropFormat: typstCropFormat };
}
