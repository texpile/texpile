// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { MainFilePrompt } from '$lib/workspace/mainFilePrompt.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';
import { projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';

vi.mock('$lib/workspace/project', () => ({
	detectMainFile: vi.fn(async () => null),
	findDocRoots: vi.fn(async () => new Set<string>()),
	gatherProjectMacros: vi.fn(async () => '')
}));

describe('confirming the main file prompt', () => {
	it('writes the choice to the folder config, as Set as Main File does', async () => {
		workspaceRoot.current = '/papers/fx';
		const save = vi.spyOn(projectConfigSync, 'save').mockResolvedValue();
		const p = new MainFilePrompt({ loadExistingPdf: () => {}, setProjectMacros: () => {}, releaseHeldDraftCompile: () => {} });
		p.choice = '/papers/fx/main.tex';
		await p.confirm();
		expect(save).toHaveBeenCalledWith('/papers/fx');
	});
});
