// The change bars are drawn against the open file's last committed text, which git is asked for
// after the file opens. Until it answers, the bars must not be drawn against the file before.
import { it, expect, vi } from 'vitest';

let answer: (content: string) => void = () => {};
vi.mock('$lib/workspace/scm/git', () => ({
	gitShowHead: vi.fn(() => new Promise((resolve) => (answer = (content) => resolve({ ok: true, hasHead: true, content }))))
}));
vi.mock('$lib/workspace/scm/gitStore', () => ({
	isGitRepo: { current: true },
	gitHeldBack: { current: false },
	gitChanges: { current: [] },
	isConflicted: () => false
}));

const { ChangeBaseline } = await import('$lib/workspace/changeBaseline.svelte');

it("does not keep one file's baseline while the next file's is read", async () => {
	const base = new ChangeBaseline();
	const a = base.load('/p/a.tex');
	answer('A as committed\n');
	await a;
	expect(base.text).toBe('A as committed\n');

	const b = base.load('/p/b.tex');
	expect(base.text).toBeNull();
	answer('B as committed\n');
	await b;
	expect(base.text).toBe('B as committed\n');

	// the same file again (a new commit): its bars stay until the new text is in
	const again = base.load('/p/b.tex');
	expect(base.text).toBe('B as committed\n');
	answer('B, newer\n');
	await again;
	expect(base.text).toBe('B, newer\n');
});
