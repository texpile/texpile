// Switch branch in the command palette lists the other local branches and the remote-only ones;
// picking one switches to it.
import { it, expect, vi } from 'vitest';
import { branchItemsFrom } from '$lib/palette/paletteBranchItems';

it('lists the branches other than the one checked out, with what each syncs with', () => {
	const switchTo = vi.fn();
	const items = branchItemsFrom(
		{
			ok: true,
			current: 'main',
			local: [
				{ name: 'main', upstream: 'origin/main', date: '' },
				{ name: 'draft', upstream: null, date: '' },
				{ name: 'camera-ready', upstream: 'origin/camera-ready', date: '' }
			]
		},
		switchTo
	);
	expect(items.map((i) => [i.label, i.hint])).toEqual([
		['draft', undefined],
		['camera-ready', 'origin/camera-ready']
	]);
	items[1].run();
	expect(switchTo).toHaveBeenCalledWith('camera-ready');
});

it("lists a co-author's branch on the remote after the local ones, and picking it asks for it by that name", () => {
	const switchTo = vi.fn();
	const items = branchItemsFrom(
		{
			ok: true,
			current: 'main',
			local: [{ name: 'main', upstream: 'origin/main', date: '' }],
			remote: [{ name: 'origin/revisions', upstream: null, date: '' }]
		},
		switchTo
	);
	expect(items.map((i) => i.label)).toEqual(['origin/revisions']);
	items[0].run();
	expect(switchTo).toHaveBeenCalledWith('origin/revisions');
});

it('lists every branch when none is checked out, and nothing when the list could not be read', () => {
	const detached = branchItemsFrom({ ok: true, current: null, local: [{ name: 'main', upstream: null, date: '' }] }, vi.fn());
	expect(detached.map((i) => i.label)).toEqual(['main']);
	expect(branchItemsFrom({ ok: false, error: 'boom' }, vi.fn())).toEqual([]);
});
