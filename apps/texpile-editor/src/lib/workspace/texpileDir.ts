// The .texpile directory's own rules, shared by everything that writes into it.
//
// Whichever writer gets there first decides whether the directory turns up in `git status`, so the
// ignore rule cannot belong to any one of them. It used to live in the comment store, which meant a
// user who compiled but never commented got an untracked .texpile/config.json in every project -
// exactly the "what is this, can I delete it?" the allowlist exists to prevent.
import { readTextFile, statFile, writeTextFile } from '$lib/workspace/fileSystem';

/**
 * `.texpile/` is closed by default and opens for what the project is meant to share: the comment
 * log, the snippets, the package files and the compile config (both are read on pull - the trust gate in projectConfigSync exists
 * precisely because config.json travels with a clone).
 *
 * An allowlist, so the NEXT thing put in here - a cache, per-user layout - arrives ignored and has
 * to be opted in, rather than being noticed in somebody's diff. `!.gitignore` keeps this rule
 * tracked, so every clone ignores the same things and a user's edit to it travels with the project.
 *
 * The negations work because `.texpile/` itself is not ignored - only its contents, by this file.
 */
const IGNORE_BODY = '*\n!.gitignore\n!comments.jsonl\n!config.json\n!snippets.json\n!packages/\n!packages/*.json\n';

/** bodies earlier versions seeded, verbatim: the ONLY contents safe to upgrade over. Anything
 *  else is a user's edit, and editing the file is the supported way to change what gets committed. */
const STALE_IGNORE_BODIES = [
	'*\n!.gitignore\n!comments.jsonl\n',
	'*\n!.gitignore\n!comments.jsonl\n!config.json\n',
	'*\n!.gitignore\n!comments.jsonl\n!config.json\n!snippets.json\n'
];

/**
 * A guest's workspaceRoot is the sentinel 'session', not a path - it addresses the host's files
 * over the wire. Building 'session/.texpile/...' from it produces a RELATIVE path, and fs:write
 * creates parent directories, so it would quietly make a stray folder next to the app. Nothing is
 * written unless the root is a real absolute one.
 */
export function texpilePath(root: string, name: string): string | null {
	if (!/^([a-zA-Z]:[\\/]|[\\/])/.test(root)) return null;
	// forward slashes throughout: node normalizes them on Windows, and the alternative is dragging
	// a path join into the renderer for one string
	return `${root.replace(/[\\/]+$/, '')}/.texpile/${name}`;
}

/**
 * Write the ignore rule if this project has none - never over one the user has edited, because
 * editing it IS the supported way to change what gets committed. A file still holding an older
 * seeded body verbatim was never edited, so it upgrades to the current allowlist (0.17 shipped
 * ignores that silently kept config.json out of git status).
 *
 * Deliberately not cached per session. A cache would skip the check after someone deleted
 * `.texpile` by hand, and the next write would then recreate the config or the log with no ignore
 * beside it. Writes here are rare and user-paced (a settings change, a comment), so one stat each
 * costs nothing worth reasoning about.
 */
export async function ensureTexpileIgnore(root: string): Promise<void> {
	const path = texpilePath(root, '.gitignore');
	if (!path) return;
	try {
		if (!(await statFile(path)).exists) {
			await writeTextFile(path, IGNORE_BODY);
			return;
		}
		const current = (await readTextFile(path)).replace(/\r\n/g, '\n');
		if (STALE_IGNORE_BODIES.includes(current)) await writeTextFile(path, IGNORE_BODY);
	} catch {
		// a project that will not take the file still gets its comments and settings; the ignore is
		// a courtesy, not a precondition
	}
}
