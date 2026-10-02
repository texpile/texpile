import { it, expect } from 'vitest';
import { configOptionButton, configOptionMenu } from '$lib/ai/agentPanel/ui/box/configOptionMenu';
import type { ConfigOption } from '$lib/ai/agentPanel/agentPanel.types';

const names = (options: { label: string }[] | undefined) => options?.map((o) => o.label);

it('keeps the newest model of each family in view and the rest a step away, the chosen one included', () => {
	const model: ConfigOption = {
		id: 'model',
		name: 'Model',
		category: 'model',
		currentValue: 'opus-4.8',
		choices: ['Default (recommended)', 'Opus 5.5', 'Sonnet 5.5', 'Sonnet 5', 'Opus 5', 'Opus 4.8'].map((name) => ({
			value: name.toLowerCase().replace(' ', '-'),
			name
		}))
	};
	const [group] = configOptionMenu(model);
	expect(names(group.options)).toEqual(['Default (recommended)', 'Opus 5.5', 'Sonnet 5.5', 'Opus 4.8']);
	expect(names(group.more?.options)).toEqual(['Sonnet 5', 'Opus 5']);
});

it('names an on/off setting beside its value, and leaves a model as its name', () => {
	const choices = [
		{ value: 'on', name: 'On' },
		{ value: 'off', name: 'Off' }
	];
	expect(configOptionButton({ id: 'fast', name: 'Fast mode', category: 'model_config', currentValue: 'off', choices })).toBe(
		'Fast mode: Off'
	);
	expect(
		configOptionButton({ id: 'm', name: 'Model', category: 'model', currentValue: 'a', choices: [{ value: 'a', name: 'Opus 5.5' }] })
	).toBe('Opus 5.5');
});
