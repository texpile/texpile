import { it, expect } from 'vitest';
import { matchCommands, slashQuery } from '$lib/ai/agentPanel/slashMatch';
import { availableCommands } from '$lib/ai/agentPanel/agentItems';

it("offers the agent's commands while the name after / is typed, those that start with it first", () => {
	const commands = availableCommands([
		{ name: 'review', description: 'Review the changes' },
		{ name: '/compact', description: 'Compact the chat', input: { hint: 'what to keep' } },
		{ name: 'pr-comments', description: 'Read the PR comments' }
	]);
	expect(commands[1]).toEqual({ name: 'compact', description: 'Compact the chat', hint: 'what to keep' });
	expect(slashQuery('/re')).toBe('re');
	expect(slashQuery('/review the intro')).toBeNull();
	expect(slashQuery('fix /re')).toBeNull();
	expect(matchCommands(commands, 'co').map((c) => c.name)).toEqual(['compact', 'pr-comments']);
});
