import { describe, expect, it } from 'vitest';
import { packageOptions } from '$lib/languages/latex/knowledge/keyCompletions';

describe('packageOptions', () => {
	it("offers the options a class hands on to the class it loads (llncs's go to article)", async () => {
		const labels = ((await packageOptions(['class-llncs'])) ?? []).map((o) => o.label);
		expect(labels).toContain('runningheads');
		expect(labels).toContain('a4paper');
	});
});
