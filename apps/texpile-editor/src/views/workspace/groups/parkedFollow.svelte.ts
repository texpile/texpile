// What keeps the parked slots up with their files (fileFeed): each file's text in the buffers, which the
// focused editor, a collaborator and the disk all change. Collaborators' carets are drawn in parked visual
// editors from the same awareness the focused one reads
import { untrack } from 'svelte';
import { forgetFilesBut, publishFile, setFileParser, type FileParser } from '$lib/workspace/groups/fileFeed.svelte';
import { peersOnText, setRemoteCursors } from '$lib/editor/visual/extensions/remoteCursors';
import { visualEditorIn } from '$lib/editor/editorsOnScreen.svelte';
import type { EditorPaneProps } from '../editorPaneProps';

export type ParkedSlot = { path: string; pane: EditorPaneProps; cell: HTMLElement | null };

type ParkedFollowDeps = {
	live: () => EditorPaneProps;
	parked: () => ParkedSlot[];
	parseFile: () => FileParser;
};

/** called during component init: it runs effects */
export function followParked(d: ParkedFollowDeps): void {
	$effect(() => {
		setFileParser(d.parseFile());
		return () => setFileParser(null);
	});

	$effect(() => {
		const keep = new Set(d.parked().map((s) => s.path));
		const focused = d.live().loadedPath;
		if (focused) keep.add(focused);
		untrack(() => forgetFilesBut(keep));
	});

	$effect(() => {
		const session = d.live().session;
		void session.manifestRev;
		const paths = [...new Set(d.parked().map((s) => s.path))];
		const stops = untrack(() =>
			paths.map((path) => {
				const binding = session.collabFor(path);
				// read into the buffers first; the manifest moves when it is, and this runs again
				if (!binding) {
					void session.beforeOpen(path);
					return null;
				}
				function push(): void {
					publishFile(path, binding!.ytext.toString());
				}
				binding.ytext.observe(push);
				push();
				return () => binding.ytext.unobserve(push);
			})
		);
		return () => {
			for (const stop of stops) stop?.();
		};
	});

	let presence = $state(0);
	$effect(() => {
		const session = d.live().session;
		void session.manifestRev;
		const paths = d.parked().map((s) => s.path);
		const awareness = untrack(() => paths.map((path) => session.collabFor(path)?.awareness).find(Boolean));
		if (!awareness) return;
		function bump(): void {
			presence++;
		}
		awareness.on('change', bump);
		return () => awareness.off('change', bump);
	});
	$effect(() => {
		void presence;
		const session = d.live().session;
		for (const slot of d.parked()) {
			if (slot.pane.viewMode !== 'visual') continue;
			const view = visualEditorIn(slot.cell);
			if (!view || view.isDestroyed) continue;
			const text = slot.pane.texSource;
			const map = slot.pane.sourceMap;
			untrack(() => {
				const shared = session.collabFor(slot.path);
				setRemoteCursors(view, shared ? peersOnText(shared, text, map) : []);
			});
		}
	});
}
