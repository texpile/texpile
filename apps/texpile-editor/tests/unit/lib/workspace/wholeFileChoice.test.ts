// VS Code's question for a file one side deleted (Keep Our Version / Delete File), asked here for a
// figure both sides changed too: the button that keeps the file comes first, and each button says
// what it does to this file rather than naming a side.
import { it, expect, vi } from 'vitest';

type Button = { id: string; label: string; primary?: boolean };
const promptAsk = vi.fn(async (_o: { message: string; buttons: Button[] }) => null as string | null);
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk }));

const { askWholeFile, keepLabel } = await import('$lib/workspace/wholeFileChoice');

it('offers to keep the surviving side first, and to delete the file', async () => {
	promptAsk.mockResolvedValueOnce('theirs');
	expect(await askWholeFile('methods.tex', 'deleted-by-them')).toBe('theirs');
	const first = promptAsk.mock.calls[0][0];
	expect(first.message).toContain('methods.tex');
	expect(first.buttons.map((b) => [b.id, b.label])).toEqual([
		['mine', 'Keep Our Version'],
		['theirs', 'Delete File'],
		['cancel', 'Cancel']
	]);

	promptAsk.mockResolvedValueOnce('theirs');
	await askWholeFile('methods.tex', 'deleted-by-us');
	expect(promptAsk.mock.calls[1][0].buttons.map((b) => [b.id, b.label]).slice(0, 2)).toEqual([
		['theirs', 'Keep Their Version'],
		['mine', 'Delete File']
	]);
});

it('names both versions for a figure, and backing out keeps nothing', async () => {
	promptAsk.mockResolvedValueOnce('cancel');
	expect(await askWholeFile('plot.pdf', 'binary')).toBeNull();
	expect(keepLabel('binary', 'theirs')).toBe('Keep Their Version');
	// a text file both changed keeps its old menu wording
	expect(keepLabel(undefined, 'mine')).toBe('Keep Our Version');
});
