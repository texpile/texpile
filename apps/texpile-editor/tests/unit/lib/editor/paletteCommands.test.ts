// A guest joins over the CRDT and owns none of the host's toolchain: no latexindent, no grep, no
// git, no compile. It does take tree writes, which execute on the host, so New document belongs to
// both roles; Open folder does not, since swapping the folder abandons a live session.
import { afterEach, describe, it, expect } from 'vitest';
import { buildCommands } from '$lib/palette/paletteCommands';
import { registerCommands } from '$lib/keybindings/commands/commandRegistry';
import { windowCommands } from '$lib/workspace/commands/windowCommands';
import type { PaletteActions } from '$lib/workspace/commandPalette.svelte';
import { bindPaletteCommands } from '../../../../src/views/workspace/workspaceShortcuts.svelte';

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
		isProject: () => true,
		canSearch: () => host,
		hasSidebar: () => true,
		canFormat: () => host,
		formatTool: () => 'latexindent' as const,
		canGit: () => host,
		openFile: () => {},
		toggleSidebar: () => {},
		sidebarOpen: () => true,
		toggleBottomPanel: () => {},
		bottomPanelOpen: () => false,
		agentTabOffered: () => true,
		agentTabOpen: () => false,
		toggleAgentTab: () => {},
		toggleTerminal: () => {},
		terminalVisible: () => false,
		terminalAvailable: () => host,
		newTerminal: () => {},
		openCompileModal: () => {},
		openFormatModal: () => {},
		openGlobalSearch: () => {},
		openSourceControl: () => {},
		openPreferences: () => {},
		newFile: () => {},
		openFolder: () => {},
		refreshTree: () => {},
		openTypstPreview: () => {},
		isTypstProject: () => false
	};
}

let unbind: (() => void)[] = [];
afterEach(() => {
	for (const off of unbind) off();
	unbind = [];
});

/** what the palette lists once the workspace has registered its commands, as it does on mount */
function paletteIds(host: boolean): string[] {
	const a = actions(host);
	const window = windowCommands({ closeTab() {}, reopenTab() {}, toggleGlobalSearch() {}, stepDocumentHistory() {} });
	unbind.push(bindPaletteCommands(a), registerCommands(window));
	return buildCommands(a).map((c) => c.id);
}

const HOST_ONLY = ['view.findInFiles', 'editor.format', 'view.diff', 'file.openFolder'];
const BOTH = ['file.newTex', 'file.newBib', 'file.save', 'view.sidebar', 'file.preferences'];

describe('palette commands', () => {
	it('offers the host-only commands to a host', () => {
		const ids = paletteIds(true);
		expect(HOST_ONLY.filter((id) => !ids.includes(id))).toEqual([]);
	});

	it('offers none of them to a guest', () => {
		const ids = paletteIds(false);
		expect(HOST_ONLY.filter((id) => ids.includes(id))).toEqual([]);
	});

	it('still gives a guest the commands that are legitimately its own', () => {
		const ids = paletteIds(false);
		expect(BOTH.filter((id) => !ids.includes(id))).toEqual([]);
	});
});
