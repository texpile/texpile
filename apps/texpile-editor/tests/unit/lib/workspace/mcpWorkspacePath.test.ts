// The one boundary every path an MCP caller names goes through: inside the open folder, or nothing
import { it, expect, vi } from 'vitest';

const root = { current: '/home/ana/paper' as string | null };
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: root, fileTree: { current: [] } }));

const { resolveInWorkspace } = await import('$lib/workspace/mcpWorkspacePath');

it('takes a path inside the folder and refuses one that climbs out of it', () => {
	root.current = '/home/ana/paper';
	expect(resolveInWorkspace('sections/intro.tex')).toBe('/home/ana/paper/sections/intro.tex');
	expect(resolveInWorkspace('sections/../main.tex')).toBe('/home/ana/paper/sections/../main.tex');
	expect(resolveInWorkspace('../.ssh/id_rsa')).toBeNull();
	expect(resolveInWorkspace('sections/../../paper-old/main.tex')).toBeNull();

	root.current = 'C:\\Users\\ana\\paper';
	expect(resolveInWorkspace('sections\\intro.tex')).toBe('C:\\Users\\ana\\paper\\sections\\intro.tex');
	expect(resolveInWorkspace('..\\notes.txt')).toBeNull();
});
