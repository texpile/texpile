// @vitest-environment jsdom
// The reply box: the Enter an input method takes to end a composition is not a send. And which messages offer Delete
import { it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CommentThreadConversation from '$lib/comments/CommentThreadConversation.svelte';
import type { CommentThread } from '$lib/comments/log';
import { m } from '$lib/paraglide/messages';

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

const thread: CommentThread = {
	id: 't1',
	file: 'main.tex',
	anchor: { quote: 'some', prefix: '', suffix: ' text', start: 0, end: 4 },
	resolved: false,
	messages: [{ id: 't1', at: 'now', by: 'ana', body: 'hi' }]
};

it('sends a reply on Enter, and not on the Enter that ends an input method composition', () => {
	const onReply = vi.fn(async () => 'm1');
	app = mount(CommentThreadConversation, {
		target: document.body.appendChild(document.createElement('div')),
		props: { thread, fileGone: false, lost: false, hidden: false, onReply, onEditMessage: () => {}, onDeleteMessage: () => {} }
	});
	const box = document.querySelector('textarea')!;
	box.value = 'nihao';
	box.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();

	box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
	flushSync();
	expect(onReply).not.toHaveBeenCalled();

	box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	flushSync();
	expect(onReply).toHaveBeenCalledWith(thread, 'nihao');
});

function deleteButtons(shown: CommentThread) {
	const onDeleteMessage = vi.fn();
	app = mount(CommentThreadConversation, {
		target: document.body.appendChild(document.createElement('div')),
		props: { thread: shown, fileGone: false, lost: false, hidden: false, onReply: () => {}, onEditMessage: () => {}, onDeleteMessage }
	});
	const buttons = [...document.querySelectorAll<HTMLButtonElement>(`button[aria-label="${m.comments_delete_message()}"]`)];
	return buttons.map((b) => {
		b.click();
		return onDeleteMessage.mock.lastCall?.[1].id;
	});
}

// deleting a suggestion's own message dropped its drawing and kept its words: an accept the log never heard of
it('offers no Delete on the message a suggestion opens with, only on its replies', () => {
	const suggestion: CommentThread = {
		...thread,
		restore: 'none',
		messages: [...thread.messages, { id: 'r1', at: 'now', by: 'bo', body: 'why' }]
	};
	expect(deleteButtons(suggestion)).toEqual(['r1']);
});

it('offers Delete on the message a comment opens with', () => {
	expect(deleteButtons(thread)).toEqual(['t1']);
});
