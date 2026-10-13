// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { CompletionContext, type Completion } from '@codemirror/autocomplete';

const reopened = vi.hoisted(() => ({ count: 0 }));
vi.mock('@codemirror/autocomplete', async (original) => ({
	...(await original<object>()),
	startCompletion: () => {
		reopened.count++;
		return true;
	}
}));

const { latexCompletionSource } = await import('../../../../../../src/lib/languages/latex/intellisense/completion/dispatch');

async function accept(typed: string, label: string): Promise<string> {
	const result = await latexCompletionSource(new CompletionContext(EditorState.create({ doc: typed }), typed.length, true));
	const option = result!.options.find((o) => o.label === label) as Completion;
	const view = new EditorView({ state: EditorState.create({ doc: typed, selection: { anchor: typed.length } }) });
	reopened.count = 0;
	(option.apply as (v: EditorView, c: Completion, from: number, to: number) => void)(
		view,
		option,
		result!.from,
		result!.to ?? typed.length
	);
	await new Promise((r) => setTimeout(r, 1));
	const text = view.state.doc.toString();
	view.destroy();
	return text;
}

describe('reopening the list after a completion', () => {
	it('stays closed when the caret is still right after the name, so Enter makes a new line', async () => {
		expect(await accept('\\[', '\\[')).toBe('\\[\\]');
		expect(reopened.count).toBe(0);
	});

	it('still opens for the argument the completion leads into', async () => {
		expect(await accept('\\cite', '\\cite')).toBe('\\cite{}');
		expect(reopened.count).toBe(1);
	});
});
