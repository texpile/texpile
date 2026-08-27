import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import { Mapping, StepMap } from 'prosemirror-transform';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import type { ImagePluginAction, ImagePluginSettings } from './types';
import { imagePluginKey } from './imagepluginutils';
import { mount } from 'svelte';
import ImageOverlay from './ImageOverlay.svelte';
import { joinPath, isRemoteSrc } from '$lib/workspace/fileSystem';
import { editorFileUrl, editorWriteBinary, editorGraphicDirs } from '$lib/editor/visual/fileAccess';
import { resolveGraphicUrl } from './graphicSrcResolve';
import { pdfPageImageUrl } from './pdfImageSource';
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

async function uploadLocalImage(file: File, imageDir: string): Promise<string> {
	if (!LOCAL_IMAGE_TYPES.includes(file.type)) {
		dispatchEvent(new CustomEvent('toast', { detail: { message: 'Only PNG, JPEG, GIF and WebP images are supported.', timeout: 3000 } }));
		throw new Error('Unsupported image type');
	}
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

// shown in place of any http(s) image src. The app promises no network, and the packaged CSP
// already refuses the fetch (img-src carries no https:) — this makes the policy visible instead
// of a broken-image icon, and closes the dev-server build, which has no CSP and would fetch.
// Display-only: attrs.src keeps the original URL, so serialization round-trips exactly.
const REMOTE_IMAGE_BLOCKED =
	'data:image/svg+xml;utf8,' +
	encodeURIComponent(
		// flat empty-state card: subtle translucent fill, lucide's image-off glyph (verbatim path
		// data, so it matches the app's icon set) + quiet label. Vector, so it scales; the muted
		// grays read on light and dark backgrounds alike.
		'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">' +
			'<rect width="480" height="120" fill="#80808018" rx="8"/>' +
			'<g transform="translate(222,24) scale(1.5)" stroke="#8a8a8a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
			'<line x1="2" x2="22" y1="2" y2="22"/>' +
			'<path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/>' +
			'<line x1="13.5" x2="6" y1="13.5" y2="21"/>' +
			'<line x1="18" x2="21" y1="12" y2="15"/>' +
			'<path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/>' +
			'<path d="M21 15V5a2 2 0 0 0-2-2H9"/>' +
			'</g>' +
			'<text x="240" y="98" text-anchor="middle" font-family="system-ui" font-size="14" fill="#8a8a8a">Remote image blocked</text>' +
			'</svg>'
	);

async function urlExists(url: string): Promise<boolean> {
	try {
		return (await fetch(url, { method: 'HEAD', cache: 'no-store' })).ok;
	} catch {
		return false;
	}
}

/** read per call, not captured: a view outlives the file it was built for */
export function createLocalImageSettings(imageDir: () => string): ImagePluginSettings {
	return {
		...sharedImageSettings,
		uploadFile: (file: File) => uploadLocalImage(file, imageDir()),
		// resolve the relative path to a served URL; pass through already-resolved LOCAL srcs.
		// extensionless srcs probe like the engine would, and PDF figures render to a bitmap.
		downloadImage: async (src: string) => {
			if (/^https?:/i.test(src)) return REMOTE_IMAGE_BLOCKED;
			if (!src || isRemoteSrc(src) || /^(data:|blob:|file:)/.test(src)) return src;
			// the injected dirs carry \graphicspath and the project root; imageDir alone is the
			// fallback for a workspace that has not published them (a guest, or before first parse)
			const urlsFor = (rel: string) => {
				const dirs = editorGraphicDirs();
				return (dirs.length ? dirs : [imageDir()]).map((d) => editorFileUrl(joinPath(d, rel)));
			};
			const { url, isPdf } = await resolveGraphicUrl(src, urlsFor, urlExists);
			// failed render falls through to the raw URL, whose <img> error shows not-found
			if (isPdf) return (await pdfPageImageUrl(url)) ?? url;
			return url;
		},
		deleteSrc: async () => {}
	} as ImagePluginSettings;
}
