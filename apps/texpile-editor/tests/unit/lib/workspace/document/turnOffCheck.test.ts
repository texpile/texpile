import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ toasts: [] as { title: string; action: { onClick: () => void } }[] }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success: (t: (typeof h.toasts)[number]) => h.toasts.push(t) } }));

const { turnOffLatexCheck } = await import('$lib/workspace/document/turnOffCheck');
const { checkIsOn } = await import('$lib/languages/latex/intellisense/checks/checkSwitches');
const { projectChecks } = await import('$lib/workspace/projectConfigSync.svelte');
const { updateSettings } = await import('$lib/settings');

afterEach(() => {
	h.toasts.length = 0;
	updateSettings({ latexChecks: {} });
	projectChecks.current = {};
});

describe('turning off a check from its warning', () => {
	it('stops it for the app and says so', () => {
		turnOffLatexCheck('engine');
		expect(checkIsOn('engine')).toBe(false);
		h.toasts[0].action.onClick();
		expect(checkIsOn('engine')).toBe(true);
	});

	it('stops it for the folder too when the folder keeps it on, and undo restores both', () => {
		projectChecks.current = { engine: true };
		turnOffLatexCheck('engine');
		expect(checkIsOn('engine')).toBe(false);
		expect(projectChecks.current).toEqual({ engine: false });
		expect(h.toasts[0].title).toContain('this folder');
		h.toasts[0].action.onClick();
		expect(projectChecks.current).toEqual({ engine: true });
		expect(checkIsOn('engine')).toBe(true);
	});

	it('leaves a folder that follows the app alone', () => {
		projectChecks.current = { 'package-clash': false };
		turnOffLatexCheck('engine');
		expect(projectChecks.current).toEqual({ 'package-clash': false });
		expect(h.toasts[0].title).not.toContain('this folder');
	});
});
