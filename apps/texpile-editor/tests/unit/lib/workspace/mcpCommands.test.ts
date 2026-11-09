// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { attachMcpCommands, type McpCommandDeps } from '$lib/workspace/mcpCommands';
import { isGitRepo } from '$lib/workspace/scm/gitStore';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

it('reports a diff as the comparison tab it opens, not as a refused switch', async () => {
	let ask: (req: { id: number; kind: string; args?: Record<string, unknown> }) => void = () => {};
	const replies: unknown[] = [];
	(window as unknown as { texpileNative: unknown }).texpileNative = {
		onMcpRequest: (cb: typeof ask) => ((ask = cb), () => {}),
		mcpRespond: (_id: number, payload: unknown) => replies.push(payload)
	};
	const showDiff = vi.fn();
	const deps = { getLoadedPath: () => '/w/main.tex', getViewMode: () => 'visual', showDiff } as unknown as McpCommandDeps;
	workspaceRoot.current = '/w';
	isGitRepo.current = true;
	const detach = attachMcpCommands(deps);
	ask({ id: 1, kind: 'view_mode', args: { mode: 'diff' } });
	await vi.waitFor(() => expect(replies).toHaveLength(1));
	detach();
	expect(showDiff).toHaveBeenCalledOnce();
	expect(replies[0]).toMatchObject({ ok: true, opened: 'comparison tab', viewMode: 'visual' });
});
