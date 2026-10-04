// @vitest-environment jsdom
// The new comment's box: the keys an input method takes while composing neither add the comment nor throw it away
import { it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CommentComposerCard from '$lib/comments/rail/CommentComposerCard.svelte';

globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

it('keeps a comment being composed with an input method through its Enter and its Escape', () => {
	const onSubmit = vi.fn();
	const onCancel = vi.fn();
	app = mount(CommentComposerCard, {
		target: document.body.appendChild(document.createElement('div')),
		props: { quote: 'some', top: 0, onSubmit, onCancel, onSize: () => {} }
	});
	const box = document.querySelector('textarea')!;
	box.value = 'nihao';
	box.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();

	for (const key of ['Enter', 'Escape'])
		box.dispatchEvent(new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true }));
	flushSync();
	expect(onSubmit).not.toHaveBeenCalled();
	expect(onCancel).not.toHaveBeenCalled();
	expect(box.value).toBe('nihao');

	box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
	expect(onSubmit).toHaveBeenCalledWith('nihao', true);
});
