// The Contents panel's lists. Source mode parses headings from the raw text, as no ProseMirror plugin feeds it there;
// a file that is part of the main file's paper lists the whole paper, in either mode. Debounced and reading state
// live at fire time, so typing never pays the parse
import { untrack } from 'svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import {
	sourceTocStore,
	tocStore,
	visualProjectTocStore,
	type TocItem,
	type TocList
} from '$lib/editor/visual/extensions/tableofcontents/tocStore';
import {
	guessedLatexMain,
	guessedTypstMain,
	latexProjectOutline,
	typstProjectOutline,
	withVisualHeadings
} from '$lib/editor/visual/extensions/tableofcontents/projectOutline';
import { typstOutlineOf } from '$lib/workspace/projectIntel';
import type { TypstOutline } from '$lib/stores/projectIntel';
import { parseOutlineRaw, assembleProjectOutline, type RawOutlineItem } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';
import { markdownOutline } from '$lib/languages/markdown/outline';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
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

// the project scan leaves out the file being edited; the one just left keeps its outline here until a scan has it
const edited = { root: null as string | null, latex: new Map<string, RawOutlineItem[]>(), typst: new Map<string, TypstOutline>() };
function editedIn(root: string | null): typeof edited {
	if (edited.root !== root) Object.assign(edited, { root, latex: new Map(), typst: new Map() });
	return edited;
}

/** the whole paper's outline when the open .tex is part of the main file's, else null */
function projectOf(doc: Pick<DocumentBuffer, 'path' | 'texSource'>) {
	if (!doc.path) return null;
	const { latex } = editedIn(workspaceRoot.current);
	latex.set(doc.path, parseOutlineRaw(doc.texSource));
	const outlines = { ...Object.fromEntries(latex), ...projectIntelStore.current.outlines };
	const paper = { open: doc.path, openSource: doc.texSource, root: workspaceRoot.current, outlines };
	// a guess only shows, the main file stays unchosen until the first compile asks
	const main = mainFile.current ?? guessedLatexMain(paper);
	return main ? latexProjectOutline({ ...paper, main }) : null;
}

/** the same for a .typ, from its outline as its editor has it now */
function typstPaperOf(path: string | null, own: TypstOutline) {
	if (!path) return null;
	const { typst } = editedIn(workspaceRoot.current);
	typst.set(path, own);
	const outlines = { ...Object.fromEntries(typst), ...projectIntelStore.current.typstOutlines, [path]: own };
	const main = mainFile.current ?? guessedTypstMain(path, outlines);
	return main ? typstProjectOutline({ main, open: path, openOutline: own, outlines }) : null;
}

/** visual mode's Contents for a file in a paper: the paper's headings, the open file's where its visual editor has them */
export function attachVisualProjectToc(wsdoc: WorkspaceDoc): void {
	const { doc, modes } = wsdoc;
	// the Typst parse is async: only the latest one may publish
	let seq = 0;
	// a file just opened lines its paper up with its editor's headings, which come once its document is up: until then,
	// a second at most, the list shown stays rather than falling back to the editor's last headings for a moment
	let holdUntil = 0;
	let holdEnd = 0;
	function settle(paper: TocItem[] | null): void {
		const lined = paper && withVisualHeadings(paper, tocStore.current);
		if (paper && !lined && visualProjectTocStore.current && performance.now() < holdUntil) return;
		holdUntil = 0;
		visualProjectTocStore.current = lined;
	}
	function publish(): void {
		const at = ++seq;
		const visual = tocListOf(doc, modes.mode) === 'visual';
		if (visual && doc.kind === 'typ') {
			const path = doc.path;
			void typstOutlineOf(doc.texSource).then((own) => {
				if (at === seq) settle(typstPaperOf(path, own));
			});
			return;
		}
		settle(visual && doc.kind === 'tex' ? projectOf(doc) : null);
	}
	const deferred = trailingDebounce<void>(300, publish);
	let shown: string | null = null;
	$effect(() => {
		const path = doc.path;
		void doc.texSource;
		void tocStore.current;
		void projectIntelStore.current;
		void mainFile.current;
		void modes.mode;
		if (path === shown && !holdUntil) return deferred();
		deferred.cancel();
		if (path !== shown) {
			shown = path;
			holdUntil = performance.now() + 1000;
			clearTimeout(holdEnd);
			holdEnd = window.setTimeout(publish, 1000);
		}
		untrack(publish);
	});
	$effect(() => () => {
		deferred.cancel();
		clearTimeout(holdEnd);
	});
}

export function attachSourceToc(wsdoc: WorkspaceDoc): void {
	const { doc, modes } = wsdoc;
	// the Typst parse is async (the parser is a lazy import): only the latest one may publish
	let typstSeq = 0;
	function publish(): void {
		if (tocListOf(doc, modes.mode) !== 'source') return;
		if (doc.kind === 'typ') {
			const seq = ++typstSeq;
			const path = doc.path;
			void typstOutlineOf(doc.texSource).then((own) => {
				if (seq === typstSeq && doc.kind === 'typ' && tocListOf(doc, modes.mode) === 'source')
					sourceTocStore.current = typstPaperOf(path, own) ?? own.items;
			});
			return;
		}
		if (doc.kind === 'md') {
			sourceTocStore.current = markdownOutline(doc.texSource);
			return;
		}
		if (doc.kind !== 'tex') return;
		sourceTocStore.current =
			projectOf(doc) ??
			assembleProjectOutline(
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
		void mainFile.current;
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
