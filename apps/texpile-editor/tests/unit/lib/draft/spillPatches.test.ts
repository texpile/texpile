import { describe, expect, it } from 'vitest';
import { SpillPatches, type SpillHooks } from '$lib/draft/patch/spillPatches';
import type { Patch } from '$lib/draft/patch/patch.types';

// The decisions under test: a chain comes off as a UNIT when the next render stops
// targeting its pages (the edit page's segment is the one that clips the carried rows
// away, so leaving it behind would strand them), a chain paint aborts (unwinding its
// painted prefix) when a compile lands mid-chain, and same-page segments compose.
const seg = { top: 0, dropTop: 0, dropBottom: 0, delta: 0, paraLeft: 0, colL: 0, colR: 100, newRecs: [] } as Patch;
const on = (page: number) => ({ page, segs: [seg] });

function harness() {
	const log: string[] = [];
	const hooks: SpillHooks = {
		applyPatch: async (n, p) => {
			log.push(`apply:${n}x${Array.isArray(p) ? p.length : 1}`);
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
		await spills.paint([on(3), on(4)], () => false);
		await spills.drop(3);
		expect(log).toEqual(['apply:3x1', 'apply:4x1', 'clear:4']);
	});

	it('a render elsewhere takes the WHOLE chain off, clipping edit page included', async () => {
		const { log, spills } = harness();
		await spills.paint([on(2), on(3)], () => false);
		// page 2 holds the clip; leaving it would erase the rows page 3 was drawing
		expect(await spills.drop(9)).toEqual([2, 3]);
		expect(log).toEqual(['apply:2x1', 'apply:3x1', 'clear:2', 'clear:3']);
	});

	it('a shorter chain clears the pages it no longer reaches, and names them', async () => {
		const { log, spills } = harness();
		await spills.paint([on(3), on(4), on(5)], () => false);
		// the caller needs the orphans back: an exact render must drop their tint too
		expect(await spills.paint([on(3), on(4)], () => false)).toEqual([5]);
		expect(log).toEqual(['apply:3x1', 'apply:4x1', 'apply:5x1', 'clear:5', 'apply:3x1', 'apply:4x1']);
	});

	it('re-painting the same pages never clears them first', async () => {
		const { log, spills } = harness();
		await spills.paint([on(3), on(4)], () => false);
		await spills.paint([on(3), on(4)], () => false);
		expect(log).toEqual(['apply:3x1', 'apply:4x1', 'apply:3x1', 'apply:4x1']);
	});

	it('a compile landing mid-chain aborts and unwinds the painted prefix', async () => {
		const { log, spills } = harness();
		let calls = 0;
		expect(await spills.paint([on(3), on(4), on(5)], () => ++calls >= 2)).toBeNull();
		expect(log).toEqual(['apply:3x1', 'apply:4x1', 'clear:3', 'clear:4']);
		// nothing tracked: the aborted chain never reached page 5
		await spills.drop(3);
		expect(log).toEqual(['apply:3x1', 'apply:4x1', 'clear:3', 'clear:4']);
	});

	it('same-page segments compose into ONE paint and track nothing', async () => {
		const { log, spills } = harness();
		await spills.paint([on(3), on(3)], () => true); // stale never consulted
		await spills.drop(3);
		expect(log).toEqual(['apply:3x2']);
	});
});
