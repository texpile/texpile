// A guest joins over the CRDT and owns none of the host's toolchain: no latexindent, no grep, no
// git, no compile. It does take tree writes, which execute on the host, so New document belongs to
// both roles; Open folder does not, since swapping the folder abandons a live session.
import { describe, it, expect } from 'vitest';
import { buildCommands } from '$lib/palette/paletteCommands';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';

/** `host` false is exactly what a guest's session provider reports */
function actions(host: boolean): PaletteActions {
	return {
		save: () => {},
		runCompile: () => {},
		stopCompile: () => {},
		isCompiling: () => false,
		compileAvailable: () => host,
		setViewMode: () => {},
		getViewMode: () => 'visual',
		hasFile: () => true,
		canManageTree: () => true,
		isHostWorkspace: () => host,
		canSearch: () => host,
		hasSidebar: () => true,
		canFormat: () => host,
		formatTool: () => 'latexindent' as const,
		canGit: () => host,
		openFile: () => {},
		toggleSidebar: () => {},
		sidebarOpen: () => true,
		toggleTerminal: () => {},
		terminalVisible: () => false,
		terminalAvailable: () => host,
		newTerminal: () => {},
		openCompileModal: () => {},
		openFormatModal: () => {},
		openGlobalSearch: () => {},
		openPreferences: () => {},
		newFile: () => {},
		openFolder: () => {},
		refreshTree: () => {},
		openTypstPreview: () => {},
		isTypstProject: () => false
	};
}

const HOST_ONLY = ['view.findInFiles', 'editor.format', 'view.diff', 'file.openFolder'];
const BOTH = ['file.newTex', 'file.newBib', 'file.save', 'view.sidebar', 'file.preferences'];

describe('palette commands', () => {
	it('offers the host-only commands to a host', () => {
		const ids = buildCommands(actions(true)).map((c) => c.id);
		expect(HOST_ONLY.filter((id) => !ids.includes(id))).toEqual([]);
	});

	it('offers none of them to a guest', () => {
		const ids = buildCommands(actions(false)).map((c) => c.id);
		expect(HOST_ONLY.filter((id) => ids.includes(id))).toEqual([]);
	});

	it('still gives a guest the commands that are legitimately its own', () => {
		const ids = buildCommands(actions(false)).map((c) => c.id);
		expect(BOTH.filter((id) => !ids.includes(id))).toEqual([]);
	});
});
