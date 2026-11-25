// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SELECTION_EVENT } from '$lib/editor/canvas';
import { provideAgentHost } from '$lib/ai/agentPanel/agentHost.svelte';
import { EditorSelection } from '$lib/ai/agentPanel/attach/editorSelection.svelte';
import { activeFilePath } from '$lib/workspace/workspaceStore';

describe('EditorSelection', () => {
	let span: { text: string; from: number; to: number } | null;
	let release: () => void;
	beforeEach(() => {
		vi.useFakeTimers();
		span = { text: 'one\ntwo\nthree', from: 0, to: 3 };
		activeFilePath.current = 'a.tex';
		release = provideAgentHost({ selection: () => span } as never);
	});
	afterEach(() => {
		release();
		vi.useRealTimers();
	});

	it('follows the canvas editor, whose selection fires its own event, and ignores the editor input textarea only', () => {
		const selection = new EditorSelection();
		const stop = selection.watch();
		expect(selection.current?.lines).toEqual({ first: 1, last: 1, text: 'one' });
		span = { text: 'one\ntwo\nthree', from: 4, to: 7 };
		document.dispatchEvent(new Event(SELECTION_EVENT));
		vi.advanceTimersByTime(200);
		expect(selection.current?.lines).toEqual({ first: 2, last: 2, text: 'two' });
		const box = document.createElement('textarea');
		document.body.append(box);
		box.focus();
		span = { text: 'one\ntwo\nthree', from: 8, to: 11 };
		document.dispatchEvent(new Event('selectionchange'));
		vi.advanceTimersByTime(200);
		expect(selection.current?.lines, 'a text box elsewhere').toEqual({ first: 2, last: 2, text: 'two' });
		box.setAttribute('data-canvas-input', '');
		document.dispatchEvent(new Event('selectionchange'));
		vi.advanceTimersByTime(200);
		expect(selection.current?.lines, 'the canvas input').toEqual({ first: 3, last: 3, text: 'thr' });
		stop();
		box.remove();
	});
});
