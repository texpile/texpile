<script lang="ts">
	// The preview pane in its own OS window.
	//
	// Not a second app instance: window.open('about:blank', 'texpile-preview') gives a same-origin
	// child that shares this renderer process (the main process allows exactly this one popup and
	// nothing else - see setWindowOpenHandler in electron/src/main.ts), so PreviewBody is mounted
	// straight into the popup's document and keeps every store, socket and callback it has docked.
	// The lanes all survive unmount/remount by design (closing and reopening the docked pane is the
	// same event), which is what makes moving them between windows this cheap.
	//
	// This component renders nothing itself; it exists so the popup's lifetime is a component
	// lifetime - WorkspaceMain mounts it while layout.pdfPopout holds, and tearing it down (popping
	// back in, leaving the workspace) is what closes the window.
	import { mount, unmount, onMount } from 'svelte';
	import PreviewBody from './PreviewBody.svelte';
	import TooltipHost from '$lib/components/TooltipHost.svelte';
	import type { DraftController } from '$lib/draft/draftController.svelte';
	import { workspaceRoot } from '$lib/workspace/workspaceStore';
	import { basename } from '$lib/workspace/fileSystem';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		guest: boolean;
		guestPdf: ArrayBuffer | null;
		guestTypstOffered: boolean;
		mainUnset: boolean;
		onPickMain: () => void;
		pdfFilename: string;
		draft: DraftController;
		typstPreviewHost: string | null;
		typstPreviewWanted: boolean;
		onPdfRef: (ref: { scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void } | undefined) => void;
		/** the popup is gone - closed by the user, or never opened; the caller re-docks the pane */
		onClosed: () => void;
		onPageClick: (page: number, x: number, y: number, selectText?: string) => void;
		onInverseSync: (file: string, line: number, selectText?: string) => void;
		onSettled: () => void;
		onDiagnostics: (logPath: string) => void;
	};
	let {
		guest,
		guestPdf,
		guestTypstOffered,
		mainUnset,
		onPickMain,
		pdfFilename,
		draft,
		typstPreviewHost,
		typstPreviewWanted,
		onPdfRef,
		onClosed,
		onPageClick,
		onInverseSync,
		onSettled,
		onDiagnostics
	}: Props = $props();

	/** every style in the opener's head, cloned across. Wiped and redone on any head mutation:
	 *  lazy chunks (the draft view, the Typst preview) inject their styles only when first
	 *  rendered, and in dev Vite rewrites style text on HMR - a one-time copy misses both. */
	function syncStyles(doc: Document): void {
		for (const n of doc.head.querySelectorAll('[data-texpile-clone]')) n.remove();
		for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
			const c = node.cloneNode(true) as HTMLElement;
			c.setAttribute('data-texpile-clone', '');
			doc.head.appendChild(c);
		}
	}

	/** theme lives as attributes on the opener's <html> (theme-init.js); mirror them wholesale */
	function syncTheme(doc: Document): void {
		const src = document.documentElement;
		const dst = doc.documentElement;
		dst.className = src.className;
		for (const a of ['data-theme', 'data-mode']) {
			const v = src.getAttribute(a);
			if (v === null) dst.removeAttribute(a);
			else dst.setAttribute(a, v);
		}
	}

	onMount(() => {
		const w = window.open('about:blank', 'texpile-preview');
		if (!w) {
			// denied (browser dev server without the electron handler, popup blocker): nothing to
			// portal into, so hand the pane straight back to the dock rather than leaving a void
			onClosed();
			return;
		}
		const doc = w.document;
		// "<Texpile Preview> - <folder>", mirroring the main window's own "<folder> - Texpile"
		const root = workspaceRoot.current;
		const name = root ? basename(root) : '';
		doc.title = name ? `${m.wsview_popout_window_title()} - ${name}` : m.wsview_popout_window_title();
		// about:blank resolves relative URLs against nothing; fonts and stylesheets cloned from the
		// opener keep relative paths, so the popup borrows the opener's base explicitly
		const base = doc.createElement('base');
		base.href = document.baseURI;
		doc.head.appendChild(base);
		const reset = doc.createElement('style');
		reset.textContent = 'html,body{height:100%;margin:0}';
		doc.head.appendChild(reset);
		syncStyles(doc);
		syncTheme(doc);
		const headObserver = new MutationObserver(() => syncStyles(doc));
		headObserver.observe(document.head, { childList: true, subtree: true, characterData: true });
		const themeObserver = new MutationObserver(() => syncTheme(doc));
		themeObserver.observe(document.documentElement, { attributes: true });

		const target = doc.createElement('div');
		target.style.height = '100%';
		doc.body.appendChild(target);
		const app = mount(PreviewBody, {
			target,
			// getters, so the popup tracks this component's props exactly as a declarative child
			// would - mount() uses the object as passed, and reads happen inside PreviewBody's own
			// reactive contexts
			props: {
				get guest() {
					return guest;
				},
				get guestPdf() {
					return guestPdf;
				},
				get guestTypstOffered() {
					return guestTypstOffered;
				},
				get mainUnset() {
					return mainUnset;
				},
				get onPickMain() {
					return onPickMain;
				},
				get pdfFilename() {
					return pdfFilename;
				},
				get draft() {
					return draft;
				},
				get typstPreviewHost() {
					return typstPreviewHost;
				},
				get typstPreviewWanted() {
					return typstPreviewWanted;
				},
				// no splitter can drag over this window, so the freeze never engages
				paneDragging: false,
				get onPdfRef() {
					return onPdfRef;
				},
				get onPageClick() {
					return onPageClick;
				},
				get onInverseSync() {
					return onInverseSync;
				},
				get onSettled() {
					return onSettled;
				},
				get onDiagnostics() {
					return onDiagnostics;
				}
			}
		});

		// hover hints are drawn by a host per window; without one here the popup's tips painted in
		// the main window, at coordinates measured in this one
		const tips = mount(TooltipHost, { target: doc.body, props: { win: w } });

		// The user closing the window is the popup's own "close preview" gesture. pagehide is the
		// reliable close signal for an about:blank document (no navigations happen to it); the
		// interval is the belt for the paths that skip it (the main process force-closing the
		// window with its opener).
		let gone = false;
		function settle() {
			if (gone) return;
			gone = true;
			onClosed();
		}
		w.addEventListener('pagehide', settle);
		const watch = setInterval(() => {
			if (w.closed) settle();
		}, 500);

		return () => {
			gone = true; // teardown initiated app-side: onClosed must not re-enter
			headObserver.disconnect();
			themeObserver.disconnect();
			clearInterval(watch);
			// unmount FIRST, so every lane's cleanup (the Typst holders, the guest's socket splice,
			// the ref callbacks) runs while the component tree is intact; the document may already
			// be dead when the user closed the window, and node removal there is beside the point
			try {
				unmount(tips);
				unmount(app);
			} catch (e) {
				console.error('preview popout unmount:', e);
			}
			try {
				w.close();
			} catch {
				/* already closed */
			}
		};
	});
</script>
