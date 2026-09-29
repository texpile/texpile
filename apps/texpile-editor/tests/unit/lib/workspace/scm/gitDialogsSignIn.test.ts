// Signing in to GitHub from one of git's questions takes the question off screen while the browser
// is out. If the sign-in does not answer it, the question comes back - unless the operation that
// asked ended meanwhile, when there is nothing left to answer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitAskpassRequest } from '$lib/workspace/scm/git';

let finishSignIn: (ok: boolean) => void = () => {};
vi.mock('$lib/workspace/scm/remote/githubSignIn.svelte', () => ({
	answerWithGithub: vi.fn(() => new Promise<boolean>((resolve) => (finishSignIn = resolve)))
}));

let ask: (req: GitAskpassRequest) => void = () => {};
let closed: (ids: number[]) => void = () => {};
vi.mock('$lib/workspace/fileSystem', () => ({
	nativeBridge: () => ({
		onGitAskpass: (cb: typeof ask) => ((ask = cb), () => {}),
		onGitAskpassClosed: (cb: typeof closed) => ((closed = cb), () => {})
	})
}));

const { gitDialogs, listenForGitQuestions, answerWithGithubSignIn } = await import('$lib/workspace/scm/gitDialogs.svelte');

const question = (id: number): GitAskpassRequest => ({
	id,
	input: 'secret',
	subject: 'password',
	prompt: "Password for 'https://ada@github.com':",
	host: 'github.com',
	github: true
});

describe('a git question answered by signing in to GitHub', () => {
	beforeEach(() => {
		listenForGitQuestions();
	});

	it('comes back when the sign-in does not answer it', async () => {
		ask(question(1));
		const done = answerWithGithubSignIn(gitDialogs.question!);
		expect(gitDialogs.question).toBeNull();
		finishSignIn(false);
		await done;
		expect(gitDialogs.question?.id).toBe(1);
		closed([1]);
	});

	it('stays gone when the operation that asked ended during the sign-in', async () => {
		ask(question(2));
		const done = answerWithGithubSignIn(gitDialogs.question!);
		closed([2]);
		finishSignIn(false);
		await done;
		expect(gitDialogs.question).toBeNull();
	});
});
