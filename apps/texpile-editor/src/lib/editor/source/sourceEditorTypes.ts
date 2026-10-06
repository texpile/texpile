import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

// diagnostics: compile-log problems for this file, line-anchored (the log gives no columns).
export type SourceDiagnostic = {
	line: number;
	lineEnd?: number;
	severity: 'error' | 'warning' | 'info';
	message: string;
	/** 1-based column of the error point (from the log's l.NN context). */
	column?: number;
	/** source text just before the error point, or the offending \ref/\cite key. */
	anchorText?: string;
	/** the offending \command, sized for the underline when found on the line. */
	token?: string;
};

// the file's text binding: the Y.Text is the doc (value is ignored), remote cursors render via
// awareness, undo becomes CRDT-aware (only your own edits).
export type CollabBinding = {
	ytext: Y.Text;
	awareness: Awareness;
	readOnly?: boolean;
	/** the file's own history, outliving this editor; absent, the editor keeps one of its own */
	undo?: Y.UndoManager;
};
