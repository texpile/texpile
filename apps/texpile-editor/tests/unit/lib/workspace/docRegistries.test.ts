// @vitest-environment jsdom
// the editors publish this list whenever a read of it differs: a fresh copy per read republished it endlessly
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { box } from '$lib/runes/box.svelte';
import { observe } from '$lib/runes/observe.svelte';
import { DocRegistries } from '$lib/workspace/docRegistries.svelte';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';

describe('DocRegistries', () => {
	it('gives the same merged list until its entries change', () => {
		const registries = new DocRegistries({ getSource: () => '' });
		registries.bibitemRefs = [{ key: 'knuth' } as BiblatexReference];
		const other = box(0);
		const reads: BiblatexReference[][] = [];
		const stop = observe(
			() => (void other.current, registries.merged),
			(list) => reads.push(list)
		);
		flushSync();
		other.current = 1;
		flushSync();
		expect(reads.at(-1)).toBe(reads.at(-2));
		stop();
	});
});
