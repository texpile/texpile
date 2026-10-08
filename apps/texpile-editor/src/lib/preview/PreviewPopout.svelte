<script lang="ts">
	// The preview pane in its own OS window (lib/childWindows), PreviewBody mounted straight into it. The lanes all
	// survive unmount/remount by design (closing and reopening the docked pane is the same event), which is what
	// makes moving them between windows this cheap.
	//
	// This component renders nothing itself; it exists so the popup's lifetime is a component
	// lifetime - WorkspaceMain mounts it while layout.pdfPopout holds, and tearing it down (popping
	// back in, leaving the workspace) is what closes the window.
	import { mount, unmount, onMount } from 'svelte';
	import PreviewBody from './PreviewBody.svelte';
	import { openChildWindow } from '$lib/childWindows/childWindow';
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
		onPdfRef: (
			ref: { scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number, view?: number) => void } | undefined
		) => void;
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

	onMount(() => {
		// "<Texpile Preview> - <folder>", mirroring the main window's own "<folder> - Texpile"
		const root = workspaceRoot.current;
		const name = root ? basename(root) : '';
		const child = openChildWindow({
			name: 'texpile-preview',
			title: name ? `${m.wsview_popout_window_title()} - ${name}` : m.wsview_popout_window_title(),
			onGone: onClosed
		});
		if (!child) {
			// denied (no electron handler): nothing to portal into, so the pane goes straight back to the dock
			onClosed();
			return;
		}
		const target = child.target;
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

		return () => {
			// unmount first, so every lane's cleanup runs while the component tree is intact; the document may
			// already be dead when the user closed the window
			try {
				unmount(app);
			} catch (e) {
				console.error('preview popout unmount:', e);
			}
			child.close();
		};
	});
</script>
