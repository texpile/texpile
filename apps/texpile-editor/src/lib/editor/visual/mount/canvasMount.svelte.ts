// what the three visual editor mounts give their canvas view: the window's engine, the face settings, the zoom and readiness
import { untrack } from 'svelte';
import type { EditorView } from 'prosemirror-view';
import { windowEngine, windowInvalidation, type CanvasViewSetup, type FaceInputKey, type FaceSettings } from '$lib/editor/canvas';
import { settings } from '$lib/settings';
import { preferences } from '$lib/stores/preferencesStore.svelte';

const FACES_EPOCH: FaceInputKey = { kind: 'epoch', name: 'faces' };

// a group's props arrive spread, so the derived settings recompute on every key; the faces redraw only for a new value
function sameFaceSettings(a: FaceSettings, b: FaceSettings): boolean {
	return (Object.keys(a) as (keyof FaceSettings)[]).every((name) => a[name] === b[name]);
}

export type CanvasMountOptions = {
	view: () => EditorView | null;
	path: () => string | null;
	imageDirectory: () => string;
	/** the language whose crop syntax an image face writes; '' where images take no crop */
	cropFormat: string;
	isMainFile: () => boolean;
	/** after the first painted frame of each file the view shows (G21) */
	onReady?: () => void;
};

export function canvasMount(o: CanvasMountOptions) {
	const faceSettings: FaceSettings = $derived({
		justify: settings.current.visualJustify !== false,
		hyphenate: settings.current.visualHyphenate !== false,
		showCaptions: true,
		imageDirectory: o.imageDirectory(),
		cropFormat: o.cropFormat,
		isMainFile: o.isMainFile()
	});

	$effect(() => {
		const zoom = preferences.zoom;
		const view = o.view();
		if (view) untrack(() => view.canvas.setZoom(zoom));
	});

	let drawnWith: FaceSettings | null = null;
	$effect(() => {
		const now = faceSettings;
		const view = o.view();
		if (!view) return;
		if (drawnWith && !sameFaceSettings(drawnWith, now))
			untrack(() => windowInvalidation(view.dom.ownerDocument.defaultView ?? window).fire(FACES_EPOCH));
		drawnWith = now;
	});

	return {
		setup(place: HTMLElement): CanvasViewSetup {
			return {
				engine: windowEngine(place.ownerDocument.defaultView ?? window),
				settings: () => faceSettings,
				onReady: o.onReady,
				probe: { path: () => o.path() ?? '' }
			};
		},
		/** another file swapped into the view: shown, and onReady again, once a frame has drawn it with its inputs in */
		swappedFile(view: EditorView): void {
			view.canvas.holdUntilReady();
		}
	};
}
