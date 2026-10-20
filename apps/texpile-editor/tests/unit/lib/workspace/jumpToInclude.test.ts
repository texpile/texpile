import { describe, it, expect, vi } from 'vitest';

const opened: (string | null)[] = [];

vi.mock('$lib/workspace/workspaceStore', () => ({ openFile: (p: string | null) => opened.push(p), workspaceRoot: { current: '/r' } }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { info: () => {}, error: () => {} } }));
vi.mock('$lib/modals/window/missingProgram/missingProgram.svelte', () => ({ askForProgram: () => false }));

const { jumpToInclude } = await import('$lib/workspace/editorCommands');

describe('jumpToInclude', () => {
	it('skips a folder named like the include and reaches the file at the root', async () => {
		const stat = async (p: string) => ({ exists: p === '/r/sub/chap' || p === '/r/chap.tex', isDirectory: p === '/r/sub/chap' });
		await jumpToInclude(['chap.tex', 'chap'], '/r/sub/a.tex', stat);
		expect(opened).toEqual(['/r/chap.tex']);
	});
});
