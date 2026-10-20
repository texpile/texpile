// the folder's choice for a LaTeX check wins over the app's, and the app's wins over the default of on
import { describe, it, expect, afterEach } from 'vitest';
import { checkIsOn, setLatexCheck } from '$lib/languages/latex/intellisense/checks/checkSwitches';
import { settings, updateSettings } from '$lib/settings';
import { projectChecks } from '$lib/workspace/projectConfigSync.svelte';

afterEach(() => {
	updateSettings({ latexChecks: {} });
	projectChecks.current = {};
});

describe('checkIsOn', () => {
	it('is on with no choice anywhere', () => {
		expect(checkIsOn('engine')).toBe(true);
	});

	it('follows the app setting', () => {
		setLatexCheck('engine', false);
		expect(checkIsOn('engine')).toBe(false);
		setLatexCheck('engine', undefined);
		expect(settings.current.latexChecks).toEqual({});
		expect(checkIsOn('engine')).toBe(true);
	});

	it('takes the folder choice over the app setting', () => {
		setLatexCheck('engine', false);
		projectChecks.current = { engine: true };
		expect(checkIsOn('engine')).toBe(true);
		setLatexCheck('engine', true);
		projectChecks.current = { engine: false };
		expect(checkIsOn('engine')).toBe(false);
	});
});
