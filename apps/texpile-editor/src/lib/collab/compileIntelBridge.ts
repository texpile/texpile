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
import { relativeTo, joinPath } from '$lib/workspace/fileSystem';
import type { EditSession } from '$lib/collab/editSession';

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

/** the project's .bib files, absolute, from the flattened tree */
export function bibPathsFrom(relPaths: string[], root: string): string[] {
	return relPaths.filter((p) => /\.bib$/i.test(p)).map((p) => joinPath(root, p));
}
