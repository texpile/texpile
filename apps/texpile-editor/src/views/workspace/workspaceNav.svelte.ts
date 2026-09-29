// Every "jump somewhere" route in the workspace: SyncTeX forward/inverse, the visual-caret
// source position, include targets, and the PDF pane scroll plumbing.
import { editorViewStore } from '$lib/stores/editorStore';
import { openFile, activeCompare } from '$lib/workspace/workspaceStore';
import { Text } from '@codemirror/state';
import { docPositions, offsetToRowCol } from '$lib/workspace/docPositions';
import { resolveGotoTarget } from '$lib/editor/source/sourceGotoTarget';
import { fileMode } from '$lib/workspace/fileMode.svelte';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { updateLayout } from '$lib/storage/layout';
import { SyncTexNav, sessionRelativeTarget, needsActivate } from '$lib/workspace/syncTexNav';
import { offsetAtPm } from '$lib/editor/visual/sourceMap';
import { firstWordEndOnLine } from '$lib/languages/typst/preview/caretRescue';
import { restoreVisualPosition } from '$lib/workspace/visualPositions';
import { jumpToInclude as jumpToIncludeTarget } from '$lib/workspace/editorCommands';
import { hasVisualMode, type DocumentBuffer, type FileKind } from '$lib/workspace/documentBuffer.svelte';
import type { ViewModeSwitch } from '$lib/workspace/viewModeSwitch.svelte';
import { samePath } from '$lib/workspace/fileSystem';

/** 1-based line of `\label{name}` in `source`, or null */
function labelLine(source: string, name: string): number | null {
	const re = new RegExp(String.raw`\\(?:line)?label\s*\{\s*` + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String.raw`\s*\}`);
	const m = re.exec(source);
	return m ? source.slice(0, m.index).split('\n').length : null;
}

/** 1-based line where `source` defines the command `\name` (\newcommand, \def, \NewDocumentCommand and kin), or null */
function definitionLine(source: string, name: string): number | null {
	const command = '\\\\' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-zA-Z@])';
	const re = new RegExp(
		String.raw`\\(?:(?:re|provide)?newcommand\*?|DeclareRobustCommand\*?|(?:New|Renew|Provide|Declare)DocumentCommand)\s*\{?\s*` +
			command +
			String.raw`|\\[gex]?def\s*` +
			command
	);
	const m = re.exec(source);
	return m ? source.slice(0, m.index).split('\n').length : null;
}

type NavDeps = {
	doc: DocumentBuffer;
	modes: ViewModeSwitch;
	kind: () => FileKind;
	guest: () => boolean;
	setPdfPaneOpen: (open: boolean) => void;
	getDraftRoot: () => string;
	syncDraftTo: (page: number, x: number, y: number, w: number, h: number) => void;
	expectedPdfPath: () => string | null;
	typstSyncForward: () => Promise<void> | void;
	typstSyncToLine: (line: number) => void;
	statFile: (p: string) => Promise<{ exists: boolean }>;
};

export class WorkspaceNav {
	// ref to the compile-pane PDF viewer, for SyncTeX forward search
	pdfPaneRef = $state<{ scrollToPosition: (page: number, x: number, y: number, w?: number, h?: number) => void }>();
	// a SyncTeX-inverse / Find-in-Files jump. the token distinguishes repeat jumps to the same line
	// so the editor re-fires; selectText is the word double-clicked in the PDF, anchored on to
	// correct for line drift (see SourceEditor's gotoLine effect)
	sourceGotoLine = $state<{ line: number; token: number; selectText?: string; column?: number; path: string } | undefined>(undefined);
	private gotoToken = 0;

	// forward/inverse SyncTeX resolution lives in lib/workspace/syncTexNav.ts
	private syncTex: SyncTexNav;

	constructor(private d: NavDeps) {
		this.syncTex = new SyncTexNav({
			isGuest: d.guest,
			getLoadedPath: () => d.doc.path,
			isTex: () => d.kind() === 'tex',
			getDraftRoot: d.getDraftRoot,
			expectedPdfPath: d.expectedPdfPath,
			setPdfPaneOpen: d.setPdfPaneOpen,
			scrollPdfTo: (page, x, y, w, h) => this.jumpPdf(page, x, y, w, h),
			syncDraftTo: d.syncDraftTo,
			// inverse clicks land in whichever mode the user is in; see syncJumpToFileLine
			openFileAtLine: (file, line, selectText) => this.syncJumpToFileLine(file, line, selectText)
		});
	}

	/** the visual caret as a zero-based source line/character, through the source map. Never
	 *  returns column 0: it resolves to the line's first word end instead, or null. */
	visualCaretSourcePos(): { line: number; character: number } | null {
		const v = editorViewStore.current;
		if (!v) return null;
		const off = offsetAtPm(this.d.doc.sourceMap, v.state.selection.head);
		if (off == null) return null;
		const source = this.d.doc.texSource;
		const upto = source.slice(0, Math.min(off, source.length));
		const nl = upto.lastIndexOf('\n');
		const character = upto.length - nl - 1;
		const line = (upto.match(/\n/g) ?? []).length;
		if (character > 0) return { line, character };
		// column 0: `off` is the line start, so rescue the jump onto the same line's first word
		const rescued = firstWordEndOnLine(source, off);
		return rescued == null ? null : { line, character: rescued };
	}

	/**
	 * Inverse sync landing (SyncTeX click and the typst preview's click alike): visual mode stays
	 * visual - the jump becomes a caret placement through the block map (same file) or a stored
	 * position the visual restore reads back on mount (another file). Source/diff keep the source
	 * jump. Find-in-Files style jumps keep calling openFileAtLine directly: those want the line.
	 */
	syncJumpToFileLine(file: string, line: number, selectText?: string, column?: number): void {
		const { doc, modes } = this.d;
		if (modes.mode === 'visual' && hasVisualMode(this.d.kind())) {
			const target = sessionRelativeTarget(file, this.d.guest());
			// the Typst preview names a file by its URI: forward slashes, the drive letter in either case
			const here = doc.path && samePath(target, doc.path) ? doc.path : null;
			// the clicked word, as the source editor does: SyncTeX's line is off wherever the text moved since
			// the compile, and at some places (a paragraph's indent) the engine names another line entirely
			const at =
				column !== undefined
					? { row: line - 1, column }
					: here && selectText
						? offsetToRowCol(doc.texSource, resolveGotoTarget(Text.of(doc.texSource.split('\n')), { line, selectText }).from)
						: { row: line - 1, column: 0 };
			docPositions.set(target, { ...at, firstVisibleLine: at.row + 1 }, { jump: true });
			if (here) {
				const v = editorViewStore.current;
				if (v) restoreVisualPosition(v, here, doc.texSource, doc.sourceMap);
			} else if (needsActivate(target)) {
				openFile(target);
			}
			return;
		}
		this.openFileAtLine(file, line, selectText, column);
	}

	/**
	 * The visual \ref chip's jump when the label is not drawn in the open document: its \label
	 * line, in this file (an environment the editor keeps raw) or in whichever project file defines
	 * it. False when nothing knows where it is; in single-file mode nothing can, there being no
	 * project to ask.
	 */
	jumpToLabel(name: string): boolean {
		if (fileMode.current) return false;
		const { doc } = this.d;
		const own = doc.path ? labelLine(doc.texSource, name) : null;
		if (doc.path && own) {
			this.syncJumpToFileLine(doc.path, own);
			return true;
		}
		const hit = projectIntelStore.current.labels.find((l) => l.name === name);
		if (!hit) return false;
		this.syncJumpToFileLine(hit.file, hit.line);
		return true;
	}

	/**
	 * A drawn macro call's definition, in this file's preamble or whichever project file defines it. Always the source:
	 * the visual editor shows no preamble. False when nothing knows where it is.
	 */
	jumpToDefinition(name: string): boolean {
		const { doc } = this.d;
		const own = doc.path ? definitionLine(doc.texSource, name) : null;
		if (doc.path && own) {
			this.openFileAtLine(doc.path, own);
			return true;
		}
		const hit = fileMode.current ? null : projectIntelStore.current.macros.find((m) => m.name === name);
		if (!hit) return false;
		this.openFileAtLine(hit.file, hit.line);
		return true;
	}

	/** waits for the PDF pane to mount, then scrolls it to the reported box */
	jumpPdf(page: number, x: number, y: number, w: number, h: number, tries = 0): void {
		if (this.pdfPaneRef) {
			this.pdfPaneRef.scrollToPosition(page, x, y, w, h);
			return;
		}
		if (tries < 30) setTimeout(() => this.jumpPdf(page, x, y, w, h, tries + 1), 30);
	}

	/** open a file in source mode and jump to a 1-based line (SyncTeX inverse + Find-in-Files) */
	openFileAtLine(file: string, line: number, selectText?: string, column?: number): void {
		const target = sessionRelativeTarget(file, this.d.guest());
		this.d.modes.mode = 'source';
		updateLayout({ viewMode: 'source' });
		this.sourceGotoLine = { line, token: ++this.gotoToken, selectText, column, path: target };
		if (needsActivate(target)) openFile(target);
	}

	/** A line in the source editor without choosing the view for the author: the one caller is a
	 *  file holding places a merge marked, which the pane shows in the source editor regardless
	 *  (DocumentBuffer.conflicted), and switching the mode would outlast the merge. A comparison tab
	 *  open on the file is left for the file's own tab: compared, the marked places are two
	 *  "changes" to revert rather than places to choose in. */
	showSourceLine(file: string, line: number): void {
		const target = sessionRelativeTarget(file, this.d.guest());
		this.sourceGotoLine = { line, token: ++this.gotoToken, path: target };
		if (needsActivate(target) || activeCompare.current) openFile(target);
	}

	/** a jump asked for THIS file survives a file switch; an older one must not, or every later
	 *  tab switch remounts the source editor and replays it */
	clearStaleGoto(loadedPath: string | null): void {
		if (this.sourceGotoLine && !samePath(this.sourceGotoLine.path, loadedPath ?? '')) this.sourceGotoLine = undefined;
	}

	forwardToLine(line: number): void {
		void this.syncTex.forwardToLine(line);
	}

	syncForward(): void {
		if (this.d.kind() === 'typ') {
			void this.d.typstSyncForward();
			return;
		}
		// SyncTeX from the visual editor: the PM caret's block-map line feeds the line-based
		// forward search (SyncTeX is line-granular anyway)
		if (this.d.modes.mode === 'visual') {
			const pos = this.visualCaretSourcePos();
			if (pos) void this.syncTex.forwardToLine(pos.line + 1);
			return;
		}
		void this.syncTex.forwardFromCursor();
	}

	/** per-language routing for every "jump the output to line N" entry point */
	syncToLine(line: number): void {
		if (this.d.kind() === 'typ') this.d.typstSyncToLine(line);
		else this.forwardToLine(line);
	}

	onPdfDoubleClick(page: number, x: number, y: number, selectText?: string): void {
		void this.syncTex.inverseFromClick(page, x, y, selectText);
	}

	/** F12 on an \input{...} target: resolve like LaTeX would (current dir, then root, .tex added) */
	jumpToInclude(name: string): void {
		void jumpToIncludeTarget(name, this.d.doc.path, this.d.statFile, this.d.guest());
	}
}
