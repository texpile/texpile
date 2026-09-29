// Publish to GitHub: create the repository, record it as a remote, push the branch to it. VS Code's
// "Publish to GitHub", signed in with the credential git already uses for github.com instead of an
// OAuth app of Texpile's own - Git Credential Manager, a keychain, `gh auth setup-git`, or, when
// there is none, a token typed into the askpass prompt once. Git runs in the helper process; the
// API call runs here, on Chromium's network stack, so a system proxy applies to it as it does to
// the rest of the app.
import { net, type WebContents } from 'electron';
import { helperCall } from '../../helper/helperProcess';
import { withAskpass } from '../auth/gitAskpass';
import { createGithubRepo, type GithubFailure } from './github';
import type { GitOpResult } from '../gitService';
import type { GitCredentialResult, GitPushResult, PushFailure } from './gitRemote';

export type GithubPublishResult = {
	ok: boolean;
	reason?: 'not-a-repo' | 'no-git' | 'unsafe';
	/** signing in, creating the repository, or the upload that followed it */
	failure?: GithubFailure | PushFailure;
	error?: string;
	/** the remote the branch now tracks */
	remote?: string;
	/** the new repository's page, once it exists - even if the upload after it failed */
	url?: string;
	fullName?: string;
};

export function githubPublish(
	sender: WebContents,
	root: string,
	opts: { name: string; isPrivate: boolean; remote: string }
): Promise<GithubPublishResult> {
	return withAskpass(sender, async (env): Promise<GithubPublishResult> => {
		const cred = (await helperCall('git.gitCredentialFill', [root, 'github.com', env])) as GitCredentialResult;
		if (!cred.ok || !cred.credential) return { ok: false, reason: cred.reason, failure: 'auth', error: cred.error };
		const credential = cred.credential;

		const created = await createGithubRepo((url, init) => net.fetch(url, init), credential.password, {
			name: opts.name,
			isPrivate: opts.isPrivate
		});
		if (!created.ok) {
			// A token GitHub does not recognise is forgotten, so the next try asks for a new one
			// instead of failing the same way. One that only lacks a permission is kept: it may be
			// exactly what the author pushes with.
			if (created.failure === 'auth') await helperCall('git.gitCredentialVerdict', [root, credential, false]);
			return { ok: false, failure: created.failure, error: created.error };
		}
		// it worked, so a credential helper may keep it: the next upload does not ask
		await helperCall('git.gitCredentialVerdict', [root, credential, true]);

		const { fullName, htmlUrl, cloneUrl } = created.repo;
		const added = (await helperCall('git.gitAddRemote', [root, opts.remote, cloneUrl])) as GitOpResult;
		if (!added.ok) return { ok: false, reason: added.reason, failure: 'other', error: added.error, url: htmlUrl, fullName };
		const pushed = (await helperCall('git.gitPublish', [root, opts.remote, env])) as GitPushResult;
		return { ...pushed, url: htmlUrl, fullName };
	});
}
