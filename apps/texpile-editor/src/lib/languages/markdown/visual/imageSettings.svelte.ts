// Image plugin settings for the markdown editor: same pipeline as the tex editor, minus the
// controls markdown has no syntax for. `![alt](src "title")` carries no width and no figure
// numbering, so drag-resize is off (a resize would edit attrs the serializer must ignore) and
// the overlay hides its size slider + Numbered toggle via latexControls={false}.
import { mount } from 'svelte';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { ImagePluginSettings } from '$lib/editor/visual/extensions/image/types';
import { createTemplateEditorSettings, createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import ImageOverlay from '$lib/editor/visual/extensions/image/ImageOverlay.svelte';

type OverlayHost = {
	__svelteComponentProps?: { node: PMNode; view: EditorView; getPos: () => number | undefined };
} & HTMLElement;

// defaultUpdateOverlay with one difference: the overlay mounts with dialect="markdown"
function mdUpdateOverlay(overlay: Node, getPos: () => number | undefined, view: EditorView, node: PMNode): void {
	if (!(overlay instanceof HTMLElement)) return;
	const overlayHost = overlay as OverlayHost;
	const existingProps = overlayHost.__svelteComponentProps;
	if (existingProps) {
		existingProps.node = node;
		existingProps.view = view;
		existingProps.getPos = getPos;
		return;
	}
	const componentProps = $state({ node, view, getPos, dialect: 'markdown' as const });
	mount(ImageOverlay, { target: overlay, props: componentProps });
	overlayHost.__svelteComponentProps = componentProps;
}

export function createMarkdownImageSettings(imageDir?: () => string): ImagePluginSettings {
	const base = imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings();
	return { ...base, enableResize: false, updateOverlay: mdUpdateOverlay };
}
