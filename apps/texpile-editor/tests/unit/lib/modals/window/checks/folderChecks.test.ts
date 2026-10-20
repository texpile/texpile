import { afterEach, describe, expect, it } from 'vitest';
import { chooseFolderCheck, folderChecksUnavailable } from '$lib/modals/window/checks/folderChecks';
import { GUEST_ROOT } from '$lib/collab/sessionProvider';
import { projectChecks, projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

afterEach(() => {
	workspaceRoot.current = null;
	projectChecks.current = {};
});

describe('the folder checks of a guest', () => {
	it('are unavailable and keep the host folder unchanged', () => {
		workspaceRoot.current = GUEST_ROOT;
		expect(folderChecksUnavailable()).not.toBe('');
		chooseFolderCheck('engine', 'off');
		projectConfigSync.setChecks(GUEST_ROOT, { engine: false });
		expect(projectChecks.current).toEqual({});
	});

	it('are available in a folder of the computer', () => {
		workspaceRoot.current = null;
		expect(folderChecksUnavailable()).toBe('');
		chooseFolderCheck('engine', 'off');
		expect(projectChecks.current).toEqual({ engine: false });
	});
});
