import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

/** a one-click repair, as data so a diagnostic stays plain */
/** into: the document's main file, where the line goes when the open file holds none of the document's preamble */
export type SourceDiagnosticFix =
	| { kind: 'add-package'; name: string; into?: string }
	/** the line of `first` goes above the line of `second` */
	| { kind: 'move-package'; first: string; second: string }
	/** the diagnostic's text becomes `text` */
	| { kind: 'replace-text'; text: string };

// diagnostics: compile-log problems for this file, line-anchored (the log gives no columns).
export type SourceDiagnostic = {
	line: number;
	lineEnd?: number;
	severity: 'error' | 'warning' | 'info';
	message: string;
	/** 1-based column of the error point (from the log's l.NN context); with a rule, where the anchor starts. */
	column?: number;
	/** source text just before the error point, or the offending \ref/\cite key. */
	anchorText?: string;
	/** the offending \command, sized for the underline when found on the line. */
	token?: string;
	/** the kind of live check that found it; one that can be turned off */
	rule?: string;
	/** the card's header when no rule names it */
	heading?: string;
	fix?: SourceDiagnosticFix;
};

// the file's text binding: the Y.Text is the doc (value is ignored), remote cursors render via
// awareness, undo becomes CRDT-aware (only your own edits).
export type CollabBinding = {
	ytext: Y.Text;
	awareness: Awareness;
	readOnly?: boolean;
	/** the file's own history, outliving this editor */
	undo: Y.UndoManager;
};
