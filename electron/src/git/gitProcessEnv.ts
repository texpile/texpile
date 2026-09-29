// The environment every git of Texpile's runs with, set on the helper process (helper/helperWorker.ts)
// so each git it starts inherits it. Its own module so the live tests can run git the same way.
//
// English (LANGUAGE, LC_ALL, LANG): several answers are read from git's own words - why a push
// failed, which files block a merge, that a file has no committed version - and a translated git
// slips past all of them. VS Code pins the same three.
//
// GIT_OPTIONAL_LOCKS=0 keeps `git status` from taking .git/index.lock to refresh the index as a
// side effect. Status runs on every watcher event and window focus, and holding that lock made a
// Save version or Sync running at the same moment fail; it would also make the watcher's own
// refresh rewrite the index it watches.
//
// Not GIT_LITERAL_PATHSPECS, which every hook inherits: a pre-commit hook's own
// `git diff --cached -- '*.tex'` matched nothing and passed everything. A file name is made literal
// where it is passed instead (literal() below).
export const GIT_PROCESS_ENV = {
	LANGUAGE: 'en',
	LC_ALL: 'en_US.UTF-8',
	LANG: 'en_US.UTF-8',
	GIT_OPTIONAL_LOCKS: '0'
} as const;

/** Repo-relative paths as pathspecs that name those files and nothing else: to git, "figure[1].tex"
 *  alone is a pattern that also matches figure1.tex, so discarding the one threw away the other's
 *  changes, Save version took both, and the Timeline mixed their histories. Never for `HEAD:path`,
 *  which is not a pathspec. */
export function literal(rel: string[]): string[] {
	return rel.map((p) => `:(literal)${p}`);
}
