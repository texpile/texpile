// The source-mode table of contents: no ProseMirror plugin feeds the outline there, so parse
// headings from the raw .tex; \input fragments pre-scanned into projectIntel merge into one
// numbered project outline. A .typ's and a .md's headings come from their own parsers instead. Debounced
// (display-only) and reading state LIVE at fire time, so typing never pays the parse. Visual
// mode's TOC comes from PM headings instead.
import { untrack } from 'svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { sourceTocStore, type TocList } from '$lib/editor/visual/extensions/tableofcontents/tocStore';
import { parseOutlineRaw, assembleProjectOutline } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';
import { typstSourceOutline } from '$lib/languages/typst/outline';
import { markdownOutline } from '$lib/languages/markdown/outline';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { dirname } from '$lib/workspace/fileSystem';
import { hasVisualMode, type DocumentBuffer } from '$lib/workspace/documentBuffer.svelte';
import type { WorkspaceDoc } from './workspaceDoc.svelte';

/** the headings the explorer's Contents lists for the open file, from the editor it shows in: a file
 * with an encoding problem or conflict markers is in the source editor whatever the mode, and one
 * that looks binary or that a guest gets by name only is in none (EditorPane) */
export function tocListOf(
	doc: Pick<DocumentBuffer, 'path' | 'kind' | 'encodingIssue' | 'conflicted' | 'binaryWarning'>,
	mode: 'visual' | 'source' | 'diff',
	nameOnly = false
): TocList {
	if (!doc.path) return 'closed';
	if (doc.binaryWarning || nameOnly) return 'none';
	if (mode === 'source' || (mode === 'visual' && (!!doc.encodingIssue || doc.conflicted)))
		return doc.kind === 'tex' || doc.kind === 'typ' || doc.kind === 'md' ? 'source' : 'none';
	return hasVisualMode(doc.kind) ? 'visual' : 'none';
}

export function attachSourceToc(wsdoc: WorkspaceDoc): void {
	const { doc, modes } = wsdoc;
	// the Typst parse is async (the parser is a lazy import): only the latest one may publish
	let typstSeq = 0;
	function publish(): void {
		if (tocListOf(doc, modes.mode) !== 'source') return;
		if (doc.kind === 'typ') {
			const seq = ++typstSeq;
			void typstSourceOutline(doc.texSource).then((items) => {
				if (seq === typstSeq && doc.kind === 'typ' && tocListOf(doc, modes.mode) === 'source') sourceTocStore.current = items;
			});
			return;
		}
		if (doc.kind === 'md') {
			sourceTocStore.current = markdownOutline(doc.texSource);
			return;
		}
		if (doc.kind !== 'tex') return;
		sourceTocStore.current = assembleProjectOutline(
			parseOutlineRaw(doc.texSource),
			doc.path,
			doc.path ? dirname(doc.path) : null,
			workspaceRoot.current,
			projectIntelStore.current.outlines
		);
	}
	const deferred = trailingDebounce<void>(300, publish);
	// the file whose outline the store holds; a file just opened gets its own at once rather than
	// showing the last one's for a beat, as the visual outline does
	let shown: string | null = null;
	$effect(() => {
		const path = doc.path;
		void doc.texSource;
		void projectIntelStore.current;
		if (tocListOf(doc, modes.mode) !== 'source') {
			shown = null;
			return;
		}
		if (path === shown) return deferred();
		shown = path;
		deferred.cancel();
		untrack(publish);
	});
	// a stale timer must not fire into the next workspace's store after unmount
	$effect(() => () => deferred.cancel());
}
