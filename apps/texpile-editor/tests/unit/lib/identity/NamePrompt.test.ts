// @vitest-environment jsdom
// The question for the reader's name, as drawn: what answers it and what does not
import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';

const h = vi.hoisted(() => ({
	userData: { current: { collabName: '', commentAuthor: '' } },
	updateUserData: vi.fn()
}));
vi.mock('$lib/storage/userData', () => ({ userData: h.userData, updateUserData: h.updateUserData }));
vi.mock('$lib/comments/author', () => ({ folderGitName: async () => null }));

const { ensureName, nameAsk } = await import('$lib/identity/ownName.svelte');
const { default: NamePrompt } = await import('$lib/identity/NamePrompt.svelte');

let app: Record<string, unknown> | null = null;
beforeEach(() => {
	h.userData.current = { collabName: '', commentAuthor: '' };
	h.updateUserData.mockClear();
	app = mount(NamePrompt, { target: document.body });
});
afterEach(() => {
	if (app) unmount(app);
	app = null;
	nameAsk.answer?.(null);
	document.body.innerHTML = '';
});

async function asked(): Promise<{ answer: Promise<boolean>; input: HTMLInputElement }> {
	const answer = ensureName('/p');
	await vi.waitFor(() => expect(nameAsk.open).toBe(true));
	flushSync();
	return { answer, input: document.querySelector('input')! };
}

function type(input: HTMLInputElement, text: string): void {
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

// an input method's Enter picks the characters being composed, and the half-typed name went in as the answer
it('leaves the question open on the Enter that ends an input method composition', async () => {
	const { answer, input } = await asked();
	type(input, '山田');
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(nameAsk.open).toBe(true);
	expect(h.updateUserData).not.toHaveBeenCalled();
	type(input, '山田太郎');
	input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
	expect(await answer).toBe(true);
	expect(h.updateUserData).toHaveBeenCalledWith({ collabName: '山田太郎' });
});

// the folder closed under the question: it came back in the next folder, and answering it there finished what the
// last one had asked for (suggest mode turned on in a folder that never asked)
it('says no when the question goes away unanswered', async () => {
	const { answer } = await asked();
	unmount(app!);
	app = null;
	expect(await answer).toBe(false);
	expect(nameAsk.open).toBe(false);
});
