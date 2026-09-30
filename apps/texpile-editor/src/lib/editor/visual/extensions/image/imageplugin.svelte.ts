import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Mapping, StepMap } from 'prosemirror-transform';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { ImagePluginAction, ImagePluginSettings } from './types';
import { imagePluginKey } from './imagepluginutils';
import { mount } from 'svelte';
import ImageOverlay from './ImageOverlay.svelte';
import { joinPath, relativeInside, pathOfPickedFile } from '$lib/workspace/fileSystem';
import { editorWriteBinary } from '$lib/editor/visual/fileAccess';
import { localImageUrl } from './localImageUrl';
import { missingImageSvg } from './missingImagePlaceholder';

export const defaultExtraAttributes = {
	width: null,
	height: null,
	maxWidth: null
};

export function defaultCreateOverlay() {
	const container = document.createElement('div');
	container.className = 'image-overlay-container absolute inset-0 pointer-events-none';
	container.setAttribute('contenteditable', 'false');
	return container;
}

// stashed on the overlay element so update calls can find the mounted component's props
// without a separate WeakMap registry
type OverlayHost = {
	__svelteComponentProps?: { node: PMNode; view: EditorView; getPos: () => number | undefined };
} & HTMLElement;

export function defaultUpdateOverlay(overlay: Node, getPos: () => number | undefined, view: EditorView, node: PMNode) {
	if (overlay instanceof HTMLElement) {
		const overlayHost = overlay as OverlayHost;
		const existingProps = overlayHost.__svelteComponentProps;

		if (existingProps) {
			existingProps.node = node;
			existingProps.view = view;
			existingProps.getPos = getPos;
		} else {
			const componentProps = $state({
				node,
				view,
				getPos
			});

			mount(ImageOverlay, {
				target: overlay,
				props: componentProps
			});

			overlayHost.__svelteComponentProps = componentProps;
		}
	}
}

export function defaultResizeCallback(el: Element, updateCallback: () => void) {
	const observer = new ResizeObserver(() => updateCallback());
	observer.observe(el);
	return () => {
		observer.unobserve(el);
	};
}

export function defaultCreateDecorations(state: EditorState) {
	return imagePluginKey.getState(state) || DecorationSet.empty;
}

function defaultFindPlaceholder(state: EditorState, id: object) {
	const decos = imagePluginKey.getState(state);
	const found = decos?.find(undefined, undefined, (spec) => spec.id === id);
	return found?.length ? found[0].from : undefined;
}

function defaultCreateState() {
	return {
		init() {
			return DecorationSet.empty;
		},
		apply(tr: Transaction, value: DecorationSet, oldState: EditorState): DecorationSet {
			const diffStart = tr.doc.content.findDiffStart(oldState.doc.content);
			const diffEnd = oldState.doc.content.findDiffEnd(tr.doc.content);
			const map = diffEnd && diffStart ? new StepMap([diffStart, diffEnd.a - diffStart, diffEnd.b - diffStart]) : new StepMap([0, 0, 0]);

			const pmMapping = new Mapping([map]);
			let set = value.map(pmMapping, tr.doc);

			const action: ImagePluginAction = tr.getMeta(imagePluginKey);
			if (action?.type === 'add') {
				const widget = document.createElement('placeholder');
				const deco = Decoration.widget(action.pos, widget, {
					id: action.id
				});
				set = set.add(tr.doc, [deco]);
			} else if (action?.type === 'remove') {
				set = set.remove(set.find(undefined, undefined, (spec) => spec.id === action.id));
			}
			return set;
		}
	};
}

// settings shared by every editor mode; each creator supplies its own uploadFile/deleteSrc/downloadImage
const sharedImageSettings = {
	hasTitle: true,
	extraAttributes: defaultExtraAttributes,
	createOverlay: defaultCreateOverlay,
	updateOverlay: defaultUpdateOverlay,
	defaultTitle: 'Image title',
	defaultAlt: 'Image',
	enableResize: true,
	isBlock: true,
	resizeCallback: defaultResizeCallback,
	imageMargin: 15,
	minSize: 50,
	maxSize: 2000,
	scaleImage: true,
	createState: defaultCreateState,
	createDecorations: defaultCreateDecorations,
	findPlaceholder: defaultFindPlaceholder
};

// templates only get example content, never user images
const TEMPLATE_PLACEHOLDER_IMAGE = 'public/texpile/example_images/example_gradient_blue.png';

/** image settings for template editor mode: static placeholder, no uploads. */
export function createTemplateEditorSettings(): ImagePluginSettings {
	return {
		...sharedImageSettings,
		uploadFile: async (_file: File) => TEMPLATE_PLACEHOLDER_IMAGE,
		deleteSrc: async () => {},
		// offline build: no remote storage, show the missing-image card for the named source
		downloadImage: async (src: string) => missingImageSvg(src)
	} as ImagePluginSettings;
}

const LOCAL_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** the path the file references the picture by, relative to `imageDir`; source mode's paste writes pictures here too */
export async function uploadLocalImage(file: File, imageDir: string): Promise<string> {
	if (!LOCAL_IMAGE_TYPES.includes(file.type)) {
		dispatchEvent(new CustomEvent('toast', { detail: { message: 'Only PNG, JPEG, GIF and WebP images are supported.', timeout: 3000 } }));
		throw new Error('Unsupported image type');
	}
	// an image the user picked from inside the folder is referenced where it already is: copying it
	// would leave two identical files and swap the name they chose for a generated one. A pasted
	// image has no path and still gets copied in, which is the only way it can be referenced at all
	const already = relativeInside(imageDir, pathOfPickedFile(file));
	if (already) return already;
	const ext = (file.name.split('.').pop() || 'png').toLowerCase();
	// short but collision-resistant filename, e.g. images/pasted-image-a1b2c3d4.png
	const shortId = crypto.randomUUID().split('-')[0];
	const name = `pasted-image-${shortId}.${ext}`;
	const abs = joinPath(joinPath(imageDir, 'images'), name);
	await editorWriteBinary(abs, file);
	// tell the workspace the folder changed so the file-tree sidebar re-scans
	dispatchEvent(new CustomEvent('texpile:fs-changed'));
	// the node stores the on-disk-relative path the .tex needs; downloadImage resolves it for display
	return `images/${name}`;
}

/** read per call, not captured: a view outlives the file it was built for */
export function createLocalImageSettings(imageDir: () => string): ImagePluginSettings {
	return {
		...sharedImageSettings,
		uploadFile: (file: File) => uploadLocalImage(file, imageDir()),
		downloadImage: (src: string) => localImageUrl(src, imageDir),
		deleteSrc: async () => {}
	} as ImagePluginSettings;
}
