import { describe, expect, it } from 'vitest';
import { SWITCHES } from '$lib/languages/latex/drawnCommands';
import { commandsWith } from '$lib/languages/latex/knowledge/commands/commandFacts';

describe('drawnCommands', () => {
	it('draws only commands the package data calls font or size switches', () => {
		const known = new Set([...commandsWith('declares', 'font'), ...commandsWith('declares', 'size')]);
		expect(Object.keys(SWITCHES).filter((name) => !known.has(name))).toEqual([]);
	});
});
