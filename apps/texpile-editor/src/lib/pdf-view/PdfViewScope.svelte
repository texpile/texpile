<script lang="ts">
	// what is inside shows one view of the document and acts on it: a split preview gives each view its own
	// toolbar and find bar
	import type { Snippet } from 'svelte';
	import { getPdfViewerContext, setPdfViewerContext, type PdfViewerActions } from './pdf-viewer/context';

	type Props = { place: number; children: Snippet };
	const props: Props = $props();
	const parent = getPdfViewerContext();
	// looked up per call: a view registers its renderer once it has mounted
	function on(): PdfViewerActions | null {
		return parent.views[props.place]?.actions ?? null;
	}

	setPdfViewerContext({
		get state() {
			return parent.views[props.place]?.state ?? parent.state;
		},
		actions: {
			zoomIn: () => on()?.zoomIn(),
			zoomOut: () => on()?.zoomOut(),
			fitWidth: () => on()?.fitWidth(),
			fitPage: () => on()?.fitPage(),
			setScale: (scale) => on()?.setScale(scale),
			rotateClockwise: () => on()?.rotateClockwise(),
			rotateCounterClockwise: () => on()?.rotateCounterClockwise(),
			goToPage: (page) => on()?.goToPage(page),
			search: async (query) => {
				await on()?.search(query);
			},
			searchNext: () => on()?.searchNext(),
			searchPrevious: () => on()?.searchPrevious(),
			clearSearch: () => on()?.clearSearch(),
			savePdf: (filename) => parent.actions.savePdf(filename),
			enterPresentationMode: async () => (await on()?.enterPresentationMode()) ?? false,
			exitPresentationMode: async () => {
				await on()?.exitPresentationMode();
			},
			scrollToPosition: parent.actions.scrollToPosition
		},
		get src() {
			return parent.src;
		},
		get documentKey() {
			return parent.documentKey;
		},
		get views() {
			return parent.views;
		},
		get activeView() {
			return parent.activeView;
		},
		_attachView: parent._attachView,
		_onerror: parent._onerror,
		_setSrcDataForDownload: parent._setSrcDataForDownload
	});
</script>

{@render props.children()}
