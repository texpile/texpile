// @vitest-environment jsdom
// a folder opened by accident held 3745 .tex files, every one of them read before the prompt drew
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MAX_MAIN_CANDIDATES } from '$lib/workspace/mainCandidates';
import { MainFilePrompt } from '$lib/workspace/mainFilePrompt.svelte';
import { workspaceRoot, texFiles, mainFile } from '$lib/workspace/workspaceStore';
import type { TexFile } from '$lib/workspace/fileSystem';

const project = vi.hoisted(() => ({
	detectMainFile: vi.fn(async (): Promise<string | null> => null),
	findDocRoots: vi.fn(async () => new Set<string>()),
	gatherProjectMacros: vi.fn(async () => '')
}));
vi.mock('$lib/workspace/project', () => project);

const ROOT = 'C:/downloads';
const file = (rel: string): TexFile => ({ path: `${ROOT}/${rel}`, name: rel.split('/').pop()!, relPath: rel });
const many = (n: number) => Array.from({ length: n }, (_, i) => file(`paper${i}.tex`));

const prompt = () => new MainFilePrompt({ loadExistingPdf: () => {}, setProjectMacros: () => {}, releaseHeldDraftCompile: () => {} });

beforeEach(() => {
	localStorage.clear();
	workspaceRoot.current = ROOT;
	mainFile.current = null;
	project.detectMainFile.mockClear();
	project.findDocRoots.mockClear();
});

describe('main file prompt past the candidate cap', () => {
	it('reads nothing at all when there are more candidates than a list can offer', async () => {
		texFiles.current = many(MAX_MAIN_CANDIDATES + 1);
		const p = prompt();
		await p.prompt();
		expect(p.tooMany).toBe(true);
		expect(project.detectMainFile).not.toHaveBeenCalled();
		expect(project.findDocRoots).not.toHaveBeenCalled();
	});

	it('still scans a folder that fits, which is every real project', async () => {
		texFiles.current = many(MAX_MAIN_CANDIDATES);
		const p = prompt();
		await p.prompt();
		expect(p.tooMany).toBe(false);
		expect(project.detectMainFile).toHaveBeenCalledOnce();
		expect(project.findDocRoots).toHaveBeenCalledOnce();
	});
});
