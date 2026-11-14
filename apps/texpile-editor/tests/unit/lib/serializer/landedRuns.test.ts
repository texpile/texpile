import { it, expect } from 'vitest';
import { createLandedRuns } from '$lib/serializer/landedRuns';

// typing writes the document on every key and reads no map: a block's runs must cost nothing until one is read,
// and a cut or a trimmed lead recorded before then must still reach them
it('places a block when the map is read, cut and moved as the output was', () => {
	const runs = createLandedRuns();
	let placed = 0;
	runs.land({ pmFrom: 0, pmTo: 12, srcFrom: 2, srcTo: 12, kind: 'sub' }, () => {
		placed++;
		return { key: 'k', nodes: [], leaves: [{ pmFrom: 1, pmTo: 11, srcFrom: 2, srcTo: 12, kind: 'text' }], inner: [] };
	});
	runs.cutTo(10);
	runs.leadTrimmed(2);
	const map = runs.map();
	expect(placed).toBe(0);
	expect(map.blocks).toEqual([{ pmFrom: 0, pmTo: 12, srcFrom: 0, srcTo: 8, kind: 'sub' }]);
	expect(map.leaves).toEqual([{ pmFrom: 1, pmTo: 9, srcFrom: 0, srcTo: 8, kind: 'text' }]);
	expect(placed).toBe(1);
});
