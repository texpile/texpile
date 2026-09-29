// git's refusal to work in a repository another account owns ("detected dubious ownership"), read
// apart from gitService so the trust step (gitTrust.ts) and repository discovery share one reading.

/** the safe.directory value git itself suggests, or the repository it names; null for any other error */
export function unsafeRepoFrom(message: string): string | null {
	if (!/dubious ownership/i.test(message)) return null;
	// the suggestion is exactly what git will compare against, including Windows' %(prefix)/ form
	const suggested = /safe\.directory\s+(.+?)\s*$/m.exec(message)?.[1];
	const named = /repository at '([^']+)'/.exec(message)?.[1];
	const path = (suggested ?? named ?? '').replace(/^'(.*)'$/, '$1').trim();
	return path || null;
}
