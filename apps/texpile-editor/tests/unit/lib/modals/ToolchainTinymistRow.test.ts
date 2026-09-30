// @vitest-environment jsdom
// Preferences › Toolchain's row for Texpile's own tinymist: offered when none is found, managed once installed
import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import ToolchainTinymistRow from '../../../../src/lib/modals/window/ToolchainTinymistRow.svelte';
import { toolchainProbe } from '../../../../src/lib/modals/window/toolchainProbe.svelte';

const MANAGED = { command: '/data/tinymist/tinymist', version: '0.15.8', typstVersion: '0.15.1' };
const ON_PATH: TinymistInfo = { command: 'tinymist', version: '0.14.2', typstVersion: '0.14.0', source: 'path' };

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) unmount(app);
	app = null;
	document.body.innerHTML = '';
});

async function render(opts: { supported?: boolean; installed: typeof MANAGED | null; inUse: TinymistInfo | null }): Promise<HTMLElement> {
	window.texpileTypst = {
		tinymistStatus: async () => ({ pinned: '0.15.8', supported: opts.supported ?? true, installed: opts.installed, step: null }),
		installTinymist: async () => ({ ok: true }),
		removeTinymist: async () => ({ ok: true })
	} as unknown as TexpileTypstBridge;
	toolchainProbe.tinymist = opts.inUse;
	toolchainProbe.probing = false;
	const target = document.body.appendChild(document.createElement('div'));
	app = mount(ToolchainTinymistRow, { target });
	await new Promise((r) => setTimeout(r, 0));
	await tick();
	flushSync();
	return target;
}

function buttons(target: HTMLElement): string[] {
	return [...target.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
}

it('offers the install when no tinymist is found', async () => {
	const target = await render({ installed: null, inUse: null });
	expect(buttons(target)).toEqual(['Install tinymist']);
	expect(target.textContent).toContain('Texpile can install tinymist 0.15.8 for you.');
});

it('offers reinstall and remove for the copy it installed', async () => {
	const target = await render({ installed: MANAGED, inUse: { ...MANAGED, source: 'managed' } });
	expect(buttons(target)).toEqual(['Reinstall', 'Remove']);
	expect(target.textContent).toContain('tinymist 0.15.8, installed by Texpile.');
});

it('stays out of the way of a tinymist the reader installed', async () => {
	const target = await render({ installed: null, inUse: ON_PATH });
	expect(target.textContent?.trim()).toBe('');
});

it('offers nothing where tinymist publishes no build', async () => {
	const target = await render({ supported: false, installed: null, inUse: null });
	expect(target.textContent?.trim()).toBe('');
});
