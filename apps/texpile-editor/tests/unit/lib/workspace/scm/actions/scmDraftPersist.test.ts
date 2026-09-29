// @vitest-environment jsdom
// What is unstaged outlives the window, as git's index does for VS Code: a private draft unstaged
// once must not come back staged after a restart and go out with the next Commit & Sync.
import { it, expect } from 'vitest';
import { ScmDraft } from '$lib/workspace/scm/actions/scmDraft.svelte';

it('keeps unstaged files and opted-in build output across a restart, per folder', () => {
	const before = new ScmDraft('/thesis');
	before.excluded = ['/thesis/private.tex'];
	before.artifactsOptedIn = ['/thesis/main.bbl'];
	before.message = 'not kept';

	const after = new ScmDraft('/thesis');
	expect(after.excluded).toEqual(['/thesis/private.tex']);
	expect(after.artifactsOptedIn).toEqual(['/thesis/main.bbl']);
	expect(after.message).toBe('');
	expect(new ScmDraft('/other').excluded).toEqual([]);

	// a file that left the list is forgotten, there too
	after.clear([]);
	expect(new ScmDraft('/thesis').excluded).toEqual([]);
});
