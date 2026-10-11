// Is this one of the files Texpile keeps in the project on the user's behalf?
//
// `.texpile/` is hidden from the file tree, so the only places it surfaces are Source Control and a
// diff - both of which are moments where an unexplained file is a question ("what is this, can I
// delete it?"). One predicate, used by both, so they cannot disagree about what counts.

/** workspace-relative or absolute; separators either way */
export function isTexpileManaged(path: string): boolean {
	const p = path.replace(/\\/g, '/');
	// the files in there people write: theirs, not kept on their behalf
	if (/(^|\/)\.texpile\/(snippets\.json$|packages\/)/.test(p)) return false;
	return p === '.texpile' || p.startsWith('.texpile/') || p.includes('/.texpile/');
}

/**
 * Which managed file this is, so the explanation can say what it actually holds.
 *
 * One predicate was enough while `.texpile/` had a single file in it. It does not any more, and a
 * banner over config.json that talks about review comments is worse than no banner - it is the app
 * telling you something untrue about your own project.
 */
export type ManagedKind = 'comments' | 'config' | 'ignore' | 'other';

export function managedKind(path: string): ManagedKind {
	const p = path.replace(/\\/g, '/');
	const name = p.split('/').pop() ?? '';
	if (name === 'comments.jsonl') return 'comments';
	if (name === 'config.json') return 'config';
	// the ONE managed file whose override mechanism is editing it: Texpile seeds it and then never
	// overwrites an existing one, so its note must invite the edit, not forbid it
	if (name === '.gitignore') return 'ignore';
	return 'other';
}
