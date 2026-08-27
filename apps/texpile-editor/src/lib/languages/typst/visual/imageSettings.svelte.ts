// Image plugin settings for the typst editor: same pipeline as the tex and md editors. Drag
// handles are on, wysiwym-style: the drag's snapped pixel width becomes `width: N%` of the text
// column in the serializer (the source's other options stay verbatim). The overlay mounts with
// dialect="typst", which hides the LaTeX-only chrome (size slider, \label field, spanning
// toggle) and offers the raw typst width field instead.
import { mount } from 'svelte';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { ImagePluginSettings } from '$lib/editor/visual/extensions/image/types';
import { createTemplateEditorSettings, createLocalImageSettings } from '$lib/editor/visual/extensions/image/imageplugin.svelte';
import ImageOverlay from '$lib/editor/visual/extensions/image/ImageOverlay.svelte';

type OverlayHost = {
	__svelteComponentProps?: { node: PMNode; view: EditorView; getPos: () => number | undefined };
} & HTMLElement;

// defaultUpdateOverlay with one difference: the overlay mounts with dialect="typst"
function typUpdateOverlay(overlay: Node, getPos: () => number | undefined, view: EditorView, node: PMNode): void {
	if (!(overlay instanceof HTMLElement)) return;
	const overlayHost = overlay as OverlayHost;
	const existingProps = overlayHost.__svelteComponentProps;
	if (existingProps) {
		existingProps.node = node;
		existingProps.view = view;
		existingProps.getPos = getPos;
		return;
	}
	const componentProps = $state({ node, view, getPos, dialect: 'typst' as const });
	mount(ImageOverlay, { target: overlay, props: componentProps });
	overlayHost.__svelteComponentProps = componentProps;
}

export function createTypstImageSettings(imageDir?: () => string): ImagePluginSettings {
	const base = imageDir ? createLocalImageSettings(imageDir) : createTemplateEditorSettings();
	return { ...base, enableResize: true, updateOverlay: typUpdateOverlay };
}
