// Windows starts a bare program name out of the working folder before PATH, and Texpile starts git, tinymist and the TeX
// tools in the project folder, which may be a download holding a git.exe of its own
import { it, expect, beforeEach, afterEach } from 'vitest';
import { stopCwdProgramLookup } from '../../../../../../electron/src/shell/findProgram';

const before = process.env.NoDefaultCurrentDirectoryInExePath;
beforeEach(() => {
	delete process.env.NoDefaultCurrentDirectoryInExePath;
});
afterEach(() => {
	if (before === undefined) delete process.env.NoDefaultCurrentDirectoryInExePath;
	else process.env.NoDefaultCurrentDirectoryInExePath = before;
});

it('tells Windows to find programs on PATH only', () => {
	stopCwdProgramLookup('linux');
	expect(process.env.NoDefaultCurrentDirectoryInExePath).toBeUndefined();
	stopCwdProgramLookup('win32');
	expect(process.env.NoDefaultCurrentDirectoryInExePath).toBe('1');
});
