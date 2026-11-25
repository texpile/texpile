// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { bindVisualUndo } from '$lib/editor/visual/visualUndo';
import { runInputType } from '$lib/editor/canvas/interaction/input/osInputType';
import type { KeyRouter } from '$lib/editor/canvas/interaction/keys/keyRouter';

function routerOf() {
	const keys: string[] = [];
	const intents: unknown[] = [];
	const router = {
		keydown: (event: KeyboardEvent) => (keys.push(`${event.shiftKey ? 'Shift-' : ''}${event.key}`), true),
		runIntent: (intent: unknown) => (intents.push(intent), true)
	} as unknown as KeyRouter;
	return { router, keys, intents };
}

describe('runInputType', () => {
	it('insertParagraph and insertLineBreak reach the router as Enter and Shift-Enter', () => {
		const { router, keys } = routerOf();
		runInputType(router, 'insertParagraph');
		runInputType(router, 'insertLineBreak');
		expect(keys).toEqual(['Enter', 'Shift-Enter']);
	});

	it('the OS deletions run the intent of their key and history steps the file undo', () => {
		const { router, intents } = routerOf();
		const step = vi.fn(() => true);
		bindVisualUndo(step);
		expect(runInputType(router, 'deleteWordBackward')).toBe(true);
		expect(intents).toEqual([{ kind: 'delete', by: 'word', dir: -1 }]);
		runInputType(router, 'historyUndo');
		runInputType(router, 'historyRedo');
		expect(step.mock.calls).toEqual([['undo'], ['redo']]);
		expect(runInputType(router, 'formatBold')).toBe(false);
		bindVisualUndo(null);
	});
});
