// The focused editor group's pane, drawn from the open document; a parked group keeps a copy (groups/).
// Getters, so a pane reading one prop tracks only what that prop is made of
import { activeCompare } from '$lib/workspace/workspaceStore';
import { fileMode } from '$lib/workspace/fileMode.svelte';
import type { EditorPaneProps } from './editorPaneProps';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the workspace state objects are structural here, as in WorkspaceMain
type Any = any;

/** what WorkspaceMain draws the pane from, read through getters so each stays live */
export type LivePaneSource = {
	readonly [
		K in
			| 'doc'
			| 'modes'
			| 'diff'
			| 'parser'
			| 'session'
			| 'kind'
			| 'nameOnly'
			| 'folderEmpty'
			| 'panes'
			| 'actions'
			| 'commentsCtl'
			| 'canSync'
			| 'canComment'
			| 'pickMain'
	]: Any;
};

export function livePaneProps(s: LivePaneSource): EditorPaneProps {
	return {
		get onCountWords() {
			return s.actions.countWords;
		},
		get onPickMain() {
			return s.pickMain;
		},
		get openTabs() {
			return s.panes.openTabs;
		},
		get activeTabKey() {
			return s.panes.activeTabKey;
		},
		get compare() {
			return activeCompare.current;
		},
		get previewTab() {
			return s.panes.previewTab;
		},
		get onActivateTab() {
			return s.actions.activateTab;
		},
		get onCloseTab() {
			return s.actions.closeTab;
		},
		get onKeepTab() {
			return s.actions.keepTab;
		},
		get onTabMenu() {
			return s.actions.tabMenu;
		},
		get loadedPath() {
			return s.doc.path;
		},
		get kind() {
			return s.kind;
		},
		get nameOnly() {
			return s.nameOnly;
		},
		get viewMode() {
			return s.modes.mode;
		},
		get session() {
			return s.session;
		},
		get folderEmpty() {
			return s.folderEmpty;
		},
		get loadError() {
			return s.doc.loadError;
		},
		get fileDeleted() {
			return s.doc.deletedOnDisk;
		},
		get encodingIssue() {
			return s.doc.encodingIssue;
		},
		get conflicted() {
			return s.doc.conflicted;
		},
		get conflictsLeft() {
			return s.doc.conflictsLeft;
		},
		get conflictStray() {
			return s.doc.strayMarkers;
		},
		get changeBaseline() {
			return s.panes.changeBaseline;
		},
		get onLeaveConflicts() {
			return s.actions.leaveConflicts;
		},
		get binaryWarning() {
			return s.doc.binaryWarning;
		},
		get onOpenAsText() {
			return s.actions.openAsText;
		},
		get applyingStarter() {
			return s.panes.applyingStarter;
		},
		get texSource() {
			return s.doc.texSource;
		},
		get sourceMap() {
			return s.doc.sourceMap;
		},
		get regionParser() {
			return s.doc.regionParser;
		},
		get rawContent() {
			return s.doc.rawContent;
		},
		get visualDoc() {
			return s.doc.visualDoc;
		},
		get parseProgress() {
			return s.parser.progress;
		},
		get onUseSource() {
			return s.actions.useSource;
		},
		get docMeta() {
			return s.doc.docMeta;
		},
		get allReferences() {
			return s.panes.allReferences;
		},
		get sourceGotoLine() {
			return s.panes.sourceGotoLine;
		},
		get sourceScrollAnchor() {
			return s.modes.sourceScrollAnchor;
		},
		get sourceDiagnostics() {
			return s.panes.sourceDiagnostics;
		},
		get diffOriginal() {
			return s.diff.original;
		},
		get diffModified() {
			return s.diff.modified;
		},
		get diffLayout() {
			return s.diff.layout;
		},
		get diffLoading() {
			return s.diff.loading;
		},
		get diffError() {
			return s.diff.error;
		},
		get diffHasHead() {
			return s.diff.hasHead;
		},
		get diffCompareRef() {
			return s.diff.compareRef;
		},
		get diffVersionDoc() {
			return s.diff.versionDoc;
		},
		get diffVersionPreamble() {
			return s.diff.versionPreamble;
		},
		get diffVersionUnavailable() {
			return s.diff.versionUnavailable;
		},
		get fileUrl() {
			return s.panes.fileUrl;
		},
		get onPickStarter() {
			return s.actions.pickStarter;
		},
		get onBlankStarter() {
			return s.actions.newTexFile;
		},
		get onImportStarter() {
			return s.actions.importStarter;
		},
		get onTexInput() {
			return s.actions.onTexInput;
		},
		get onRawInput() {
			return s.actions.onRawInput;
		},
		get onVisualChange() {
			return s.actions.onVisualChange;
		},
		get onVisualSelection() {
			return s.actions.onVisualSelection;
		},
		get onEditFrontmatter() {
			return s.actions.onEditFrontmatter;
		},
		get onSyncToPdf() {
			return s.canSync ? s.actions.syncToPdf : undefined;
		},
		get onJumpToFile() {
			return s.actions.jumpToFile;
		},
		get onOpenFileAt() {
			return s.actions.openFileAt;
		},
		get onJumpToLabel() {
			return s.actions.jumpToLabel;
		},
		get onJumpToDefinition() {
			return s.actions.jumpToDefinition;
		},
		get onCaretMove() {
			return s.actions.onCaretMove;
		},
		get onToggleDiffLayout() {
			return () => s.diff.toggleLayout();
		},
		get onRefreshDiff() {
			return s.actions.refreshDiff;
		},
		get commentRanges() {
			return s.panes.commentRanges;
		},
		get commentThreads() {
			return s.commentsCtl.withKnownAnchors(s.panes.comments.filter((t: Any) => t.file === s.panes.commentFile));
		},
		get selectedComment() {
			return s.panes.commentSelected;
		},
		get onAddComment() {
			return s.canComment ? s.actions.beginComment : undefined;
		},
		get onAddCommentAnchored() {
			return s.canComment ? s.actions.beginCommentAnchored : undefined;
		},
		get commentPendingActive() {
			return !!s.panes.commentPending;
		},
		get onInsertCitation() {
			return s.panes.zoteroCite ? s.actions.insertZoteroCitation : undefined;
		},
		get onCiteByDoi() {
			return s.panes.doiCite ? s.actions.citeByDoi : undefined;
		},
		get onCommentsPlaced() {
			return s.actions.visualCommentsPlaced;
		},
		get onSelectComment() {
			return s.actions.selectComment;
		},
		get commentsCtl() {
			return fileMode.current ? undefined : s.commentsCtl;
		},
		get onSetViewMode() {
			return s.actions.setViewMode;
		}
	};
}
