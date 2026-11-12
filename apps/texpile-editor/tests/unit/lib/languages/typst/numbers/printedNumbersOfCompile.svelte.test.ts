// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { mainFile, workspaceRoot } from '$lib/workspace/workspaceStore';
import { onTypstPrintedNumbers, printedNumbersOfFile } from '$lib/stores/typstPrintedNumbers';
import { bindTypstPrintedNumbers } from '$lib/languages/typst/numbers/printedNumbersOfCompile.svelte';

const read = vi.hoisted(() => vi.fn(async () => [{ kind: 'heading', number: '1', label: null, text: 'One', level: 1, page: 1 }]));
vi.mock('$lib/languages/typst/numbers/readPrintedNumbers', () => ({ readTypstPrintedNumbers: read }));
vi.mock('$lib/workspace/document/documentFiles', () => ({ documentFiles: async (main: string) => [{ path: main, text: '' }] }));

let stop: (() => void) | null = null;
afterEach(() => {
	stop?.();
	stop = null;
	workspaceRoot.current = null;
	mainFile.current = null;
});

it('reads the numbers of a compile once an editor shows them, and forgets them with the main file', async () => {
	workspaceRoot.current = '/w';
	mainFile.current = '/w/main.typ';
	let runs = $state(0);
	stop = $effect.root(() =>
		bindTypstPrintedNumbers(
			() => runs,
			() => false
		)
	);
	flushSync();
	runs = 1;
	flushSync();
	expect(read).not.toHaveBeenCalled();

	const leave = onTypstPrintedNumbers(() => {});
	await vi.waitFor(() => expect(printedNumbersOfFile('/w/main.typ')?.items).toHaveLength(1));
	expect(read).toHaveBeenCalledTimes(1);

	mainFile.current = '/w/other.typ';
	flushSync();
	expect(printedNumbersOfFile('/w/main.typ')).toBeNull();
	leave();
});
