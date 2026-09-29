// @vitest-environment jsdom
// A github.com question offers signing in to GitHub in the browser, as VS Code's GitHub account
// answers git there; any other host asks only for what git asked.
import { it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const answerWithGithubSignIn = vi.fn(async () => {});
vi.mock('$lib/workspace/scm/gitDialogs.svelte', () => ({ answerQuestion: vi.fn(), answerWithGithubSignIn }));

const { default: GitQuestionModal } = await import('../../../../src/lib/modals/workspace/GitQuestionModal.svelte');

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

function render(question: Record<string, unknown>) {
	app = mount(GitQuestionModal, {
		target: document.body.appendChild(document.createElement('div')),
		props: {
			question: {
				id: 7,
				input: 'text',
				subject: 'username',
				prompt: "Username for 'https://github.com': ",
				host: 'github.com',
				...question
			}
		}
	});
	flushSync();
}

it('offers the browser sign-in for github.com, and hands the question over when chosen', () => {
	render({ github: true });
	const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Sign In with GitHub'));
	expect(button).toBeTruthy();
	button!.click();
	expect(answerWithGithubSignIn).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
});

it('does not offer it where the sign-in is not available', () => {
	render({ github: false });
	expect(document.body.textContent).not.toContain('Sign In with GitHub');
});
