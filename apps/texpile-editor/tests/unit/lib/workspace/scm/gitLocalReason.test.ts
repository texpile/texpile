// git's stderr, turned into what to do next. The raw words stay behind Details.
import { it, expect } from 'vitest';
import { localGitReason } from '$lib/workspace/scm/gitLocalReason';
import { m } from '$lib/paraglide/messages';

it.each([
	["fatal: Unable to create '/p/.git/index.lock': File exists.", m.vcs_error_locked()],
	['husky - pre-commit hook exited with code 1 (error)', m.vcs_error_hook()],
	['error: Committing is not possible because you have unmerged files.', m.vcs_error_conflicts()],
	['*** Please tell me who you are.', m.vcs_error_identity()],
	['nothing to commit, working tree clean', m.vcs_error_nothing()],
	['error: gpg failed to sign the data', m.vcs_error_signing()],
	["error: open('main.tex'): Permission denied", m.vcs_error_permission()]
])('%s', (stderr, said) => {
	expect(localGitReason(stderr)).toBe(said);
});

it('says git could not do it, rather than guessing, for anything else', () => {
	expect(localGitReason('fatal: bad object HEAD')).toBe(m.vcs_error_unknown());
	expect(localGitReason(undefined)).toBe(m.vcs_error_unknown());
});
