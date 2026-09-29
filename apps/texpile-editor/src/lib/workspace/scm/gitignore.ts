// Lines added to a .gitignore: the build output patterns (ScmActions.ignoreArtifacts) and a big new
// folder from its row's menu. Always appended, never rewritten: the file may be hand-written.

/** the line that matches this one file and nothing else, for a .gitignore in the folder it is
 *  relative to. Anchored with a leading slash, since `notes.txt` alone would also ignore every
 *  notes.txt in every folder below; glob characters escaped, since a file can be named `[draft].tex`. */
export function ignoreLineFor(rel: string): string {
	const path = rel.replace(/\\/g, '/').replace(/^\/+/, '');
	const escaped = path.replace(/[*?[\\]/g, '\\$&').replace(/ $/, '\\ ');
	return `/${escaped}`;
}

/** the text with whichever of `lines` it does not have yet appended after a blank line; null when
 *  it has them all. Comment lines come along with new patterns, never on their own. */
export function withIgnoreLines(existing: string | null, lines: string[]): string | null {
	const text = existing ?? '';
	const have = new Set(
		text
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
	);
	const wanted = lines.filter((l) => l.startsWith('#') || !have.has(l));
	if (wanted.every((l) => l.startsWith('#'))) return null;
	const prefix = text && !text.endsWith('\n') ? '\n' : '';
	return `${text}${prefix}${text ? '\n' : ''}${wanted.join('\n')}\n`;
}
