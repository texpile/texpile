// Why saving a version, discarding or starting a repository failed, as a sentence with a next
// step. These put git's own stderr in the toast before: right, and no help to someone who has never
// used git. The raw words stay one click away (gitFailureToast.ts).
import { m } from '$lib/paraglide/messages';

const RULES: [RegExp, () => string][] = [
	[/index\.lock|unable to create '[^']*\.lock'|cannot lock ref/i, () => m.vcs_error_locked()],
	[/hook\b.*(failed|declined|rejected|exit)|pre-commit|commit-msg/i, () => m.vcs_error_hook()],
	[/unmerged|needs merge|you have unmerged|fix conflicts/i, () => m.vcs_error_conflicts()],
	[/please tell me who you are|empty ident|unable to auto-detect email/i, () => m.vcs_error_identity()],
	[/nothing to commit|no changes added to commit/i, () => m.vcs_error_nothing()],
	[/gpg failed|failed to sign|error: cannot run gpg|ssh-keygen.*sign/i, () => m.vcs_error_signing()],
	[/permission denied|read-only file system|operation not permitted/i, () => m.vcs_error_permission()]
];

export function localGitReason(error: string | undefined): string {
	const text = error ?? '';
	for (const [re, say] of RULES) if (re.test(text)) return say();
	return m.vcs_error_unknown();
}
