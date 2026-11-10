// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';

const settings = { current: { toolDirs: ['/opt/tex/bin'] as string[] } };
const updateSettingsSettled = vi.fn(async (patch: { toolDirs: string[] }) => {
	settings.current.toolDirs = patch.toolDirs;
});
vi.mock('$lib/settings', () => ({ settings, updateSettingsSettled }));
vi.mock('$lib/paraglide/messages', () => ({ m: { prefs_toolchain_dirs_add_title: () => 'Add folder' } }));
vi.mock('$lib/modals/window/toolchainProbe.svelte', () => ({ toolchainProbe: { run: async () => {} } }));

const pickFolders = vi.fn(async () => ['/opt/tex/bin', '/opt/new/a', '/opt/new/b']);
vi.mock('$lib/workspace/fileSystem', () => ({ nativeBridge: () => ({ pickFolders }) }));

const { toolDirs } = await import('$lib/modals/window/toolDirs.svelte');

it('adds the new picked folders in one write and skips the listed one', async () => {
	await toolDirs.refresh();
	await toolDirs.browse();
	expect(updateSettingsSettled).toHaveBeenCalledTimes(1);
	expect(updateSettingsSettled).toHaveBeenCalledWith({ toolDirs: ['/opt/tex/bin', '/opt/new/a', '/opt/new/b'] });
});
