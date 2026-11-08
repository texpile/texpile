import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '', getVersion: () => '1.6.2' } }));

import { isMidInstall, type InstallMarker } from '../../../../../../electron/src/updates/midInstallLaunch';

const marker: InstallMarker = { from: '1.6.2', installer: 'Texpile-Setup-1.6.3.exe', at: 1_000 };
const running = (image: string): boolean => image === 'Texpile-Setup-1.6.3.exe';

describe('a launch while the Windows update installs', () => {
	it('exits when it is the old version and the installer still runs', () => {
		expect(isMidInstall(marker, '1.6.2', 30_000, running)).toBe(true);
	});

	it('goes ahead for the new version, after a failed install and long after', () => {
		expect(isMidInstall(marker, '1.6.3', 30_000, running)).toBe(false);
		expect(isMidInstall(marker, '1.6.2', 30_000, () => false)).toBe(false);
		expect(isMidInstall(marker, '1.6.2', 1_000 + 11 * 60_000, running)).toBe(false);
	});
});
