import { describe, expect, it } from 'vitest';
import { SpillPatches, type SpillHooks } from '$lib/draft/patch/spillPatches';
import type { Patch } from '$lib/draft/patch/patch.types';

// The decisions under test: a spill segment left on another page comes off exactly when
// the same paragraph's next render stops targeting that page, and the paired paint
// aborts (undoing its first half) when a compile lands between the two halves.
const seg = { top: 0, dropTop: 0, dropBottom: 0, delta: 0, paraLeft: 0, colL: 0, colR: 100, newRecs: [] } as Patch;

function harness() {
	const log: string[] = [];
	const hooks: SpillHooks = {
		applyPatch: async (n) => {
			log.push(`apply:${n}`);
		},
		clearPatch: async (n) => {
			log.push(`clear:${n}`);
		}
	};
	return { log, spills: new SpillPatches(hooks) };
}

describe('SpillPatches', () => {
	it('a fits render after a cross-page spill clears the spill page', async () => {
		const { log, spills } = harness();
		await spills.paint('a.tex:5', 3, 4, seg, [seg], () => false);
		await spills.drop('a.tex:5', 3);
		expect(log).toEqual(['apply:3', 'apply:4', 'clear:4']);
	});

	it('re-spilling to the same page keeps it; another paragraph never touches it', async () => {
		const { log, spills } = harness();
		await spills.paint('a.tex:5', 3, 4, seg, [seg], () => false);
		await spills.paint('a.tex:5', 3, 4, seg, [seg], () => false); // same target: no clear
		await spills.drop('b.tex:9', 7); // different paragraph: not its spill to drop
		expect(log).toEqual(['apply:3', 'apply:4', 'apply:3', 'apply:4']);
	});

	it('a compile landing between the paired paints aborts and undoes the first half', async () => {
		const { log, spills } = harness();
		expect(await spills.paint('a.tex:5', 3, 4, seg, [seg], () => true)).toBe(false);
		expect(log).toEqual(['apply:3', 'clear:3']);
		// nothing tracked: the aborted spill never reached page 4
		await spills.drop('a.tex:5', 3);
		expect(log).toEqual(['apply:3', 'clear:3']);
	});

	it('same-page spills track nothing and never split the paint', async () => {
		const { log, spills } = harness();
		await spills.paint('a.tex:5', 3, 3, seg, [seg], () => true); // stale never consulted
		await spills.drop('a.tex:5', 3);
		expect(log).toEqual(['apply:3']);
	});
});
