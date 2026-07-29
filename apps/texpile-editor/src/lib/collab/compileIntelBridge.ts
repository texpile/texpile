// Publishing the host's parsed compile products to guests, and rebuilding them guest-side.
//
// We parse the .aux/.log ONCE on the host and share small JSON through the session meta, rather
// than syncing the artifacts wholesale: they rewrite on every compile and would bloat the shared
// doc's history. The raw log never crosses the wire; the guest rebuilds the parsed shape so its
// Problems panel is the same UI the host has.
import { get } from 'svelte/store';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { compileLog, resolveLogPath } from '$lib/stores/compileLogStore';
import { relativeTo, joinPath, samePath } from '$lib/workspace/fileSystem';
import type { EditSession } from '$lib/collab/editSession';
import type { LogLevel } from '$lib/latex-log';

type Level = 'error' | 'warning' | 'badbox';

/** host -> guests. Shares every error/warning/badbox, line-anchored or not: line-less warnings
 * (undefined \ref/\cite, package warnings) still belong in the guest's Problems panel. */
export function shareCompileState(session: EditSession, isGuest: boolean): void {
	const root = get(workspaceRoot);
	if (isGuest || !root || !session.active) return;
	const intel = get(projectIntelStore);
	const log = get(compileLog);
	const entries = (log?.entries ?? [])
		.filter((e) => e.level !== 'info')
		.map((e) => {
			const abs = e.file ? resolveLogPath(root, e.file) : null;
			return {
				file: abs ? relativeTo(root, abs).replace(/\\/g, '/') : '',
				line: e.line,
				lineEnd: e.lineEnd,
				level: e.level as Level,
				message: e.message,
				hint: e.hint,
				column: e.column,
				anchorText: e.anchorText,
				command: e.command
			};
		});
	session.shareCompileIntel({ auxNumbers: intel.auxNumbers, auxPages: intel.auxPages, log: entries });
}

/** A shared entry rendered for the editor gutter. Badboxes ride along as "info" so they underline
 * without alarming colours. */
export interface SourceDiagnostic {
	line: number;
	lineEnd?: number;
	severity: 'error' | 'warning' | 'info';
	message: string;
	column?: number;
	anchorText?: string;
	token?: string;
}

type SharedEntry = {
	level: LogLevel;
	message: string;
	file?: string;
	line?: number;
	lineEnd?: number;
	column?: number;
	anchorText?: string;
	hint?: string;
	command?: string;
};

const severityOf = (level: LogLevel): SourceDiagnostic['severity'] =>
	level === 'error' ? 'error' : level === 'badbox' ? 'info' : 'warning';

const toDiagnostic = (e: SharedEntry): SourceDiagnostic => ({
	line: e.line!,
	lineEnd: e.lineEnd,
	severity: severityOf(e.level),
	message: e.hint ? `${e.message}\n\n${e.hint}` : e.message,
	column: e.column,
	anchorText: e.anchorText,
	token: e.command
});

/** guests -> the Problems panel. The raw log never crosses the wire, so rebuild the parsed shape
 * the host's UI uses from the shared intel. Null intel clears the panel. */
export function guestCompileLog(intel: { log: SharedEntry[] } | null, now: number) {
	if (!intel) return null;
	const entries = intel.log.map((e) => ({
		level: e.level,
		message: e.message,
		file: e.file,
		line: e.line,
		lineEnd: e.lineEnd,
		column: e.column,
		anchorText: e.anchorText,
		hint: e.hint,
		command: e.command,
		raw: e.message
	}));
	return {
		entries,
		errors: entries.filter((e) => e.level === 'error'),
		warnings: entries.filter((e) => e.level === 'warning'),
		badboxes: entries.filter((e) => e.level === 'badbox'),
		files: [],
		status: { fatal: false, emergencyStop: false, noPages: false },
		logPath: '',
		updatedAt: now
	};
}

/** guest side: the host's shared parse already carries root-relative paths */
export function guestDiagnosticsFor(intel: { log: SharedEntry[] } | null, loadedPath: string | null): SourceDiagnostic[] {
	const file = loadedPath?.replace(/^session\//, '');
	if (!intel || !file) return [];
	return intel.log.filter((e) => e.line !== undefined && samePath(e.file ?? '', file)).map(toDiagnostic);
}

/** host side: filter the parsed log down to the open file, resolving each entry's path first */
export function hostDiagnosticsFor(
	log: { entries: SharedEntry[] } | null,
	root: string | null,
	loadedPath: string | null
): SourceDiagnostic[] {
	if (!log || !root || !loadedPath) return [];
	return log.entries
		.filter((e) => e.level !== 'info' && e.line !== undefined)
		.filter((e) => {
			const abs = resolveLogPath(root, e.file ?? '');
			return abs !== null && samePath(abs, loadedPath);
		})
		.map(toDiagnostic);
}

/** the project's .bib files, absolute, from the flattened tree */
export function bibPathsFrom(relPaths: string[], root: string): string[] {
	return relPaths.filter((p) => /\.bib$/i.test(p)).map((p) => joinPath(root, p));
}
