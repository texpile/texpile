import { it, expect } from 'vitest';
import { windowsPtyFor } from '../../../../../electron/src/shell/windowsPty';

it('names the pseudo console node-pty picks for the Windows build, and none off Windows', () => {
	expect(windowsPtyFor('win32', '10.0.26200')).toEqual({ backend: 'conpty', buildNumber: 26200 });
	expect(windowsPtyFor('win32', '10.0.17763')).toEqual({ backend: 'winpty', buildNumber: 17763 });
	expect(windowsPtyFor('linux', '6.8.0-45-generic')).toBeNull();
});
