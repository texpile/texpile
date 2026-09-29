// git's refusal of a repository another account owns, read for the folder to trust. The value must
// be the one git compares against, which on Windows is not the plain path.
import { it, expect } from 'vitest';
import { unsafeRepoFrom } from '../../../../../../electron/src/git/unsafeRepo';

it('takes the safe.directory value git suggests', () => {
	const msg = [
		"fatal: detected dubious ownership in repository at '/media/usb/thesis'",
		'To add an exception for this directory, call:',
		'',
		'\tgit config --global --add safe.directory /media/usb/thesis',
		''
	].join('\n');
	expect(unsafeRepoFrom(msg)).toBe('/media/usb/thesis');
});

it("keeps Windows' network-share form as git wrote it", () => {
	const msg = [
		"fatal: detected dubious ownership in repository at '//server/share/thesis'",
		"'//server/share/thesis' is owned by:",
		'\tS-1-5-21-1',
		'but the current user is:',
		'\tS-1-5-21-2',
		'To add an exception for this directory, call:',
		'',
		"\tgit config --global --add safe.directory '%(prefix)///server/share/thesis'"
	].join('\n');
	expect(unsafeRepoFrom(msg)).toBe('%(prefix)///server/share/thesis');
});

it('falls back to the repository named, and ignores every other error', () => {
	expect(unsafeRepoFrom("fatal: detected dubious ownership in repository at '/srv/a b'")).toBe('/srv/a b');
	expect(unsafeRepoFrom('fatal: not a git repository (or any of the parent directories): .git')).toBeNull();
});
