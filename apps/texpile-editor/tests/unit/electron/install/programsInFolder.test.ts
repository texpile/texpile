import { describe, expect, it } from 'vitest';
import { parseProcessList, startedFrom } from '../../../../../../electron/src/install/programsInFolder';

const TREE = 'C:\\Users\\a\\AppData\\Local\\texpile-desktop\\texlive';

const list = parseProcessList(
	JSON.stringify([
		{ ProcessId: 10, ParentProcessId: 1, Name: 'Texpile.exe', ExecutablePath: 'C:\\Program Files\\Texpile\\Texpile.exe' },
		{ ProcessId: 11, ParentProcessId: 10, Name: 'powershell.exe', ExecutablePath: 'C:\\Windows\\powershell.exe' },
		{ ProcessId: 12, ParentProcessId: 11, Name: 'latexmk.exe', ExecutablePath: `${TREE}\\bin\\windows\\latexmk.exe` },
		{ ProcessId: 13, ParentProcessId: 12, Name: 'perl.exe', ExecutablePath: `${TREE.toUpperCase()}\\TLPKG\\TLPERL\\BIN\\PERL.EXE` },
		{ ProcessId: 20, ParentProcessId: 2, Name: 'lualatex.exe', ExecutablePath: `${TREE}\\bin\\windows\\lualatex.exe` },
		{ ProcessId: 21, ParentProcessId: 10, Name: 'lualatex.exe', ExecutablePath: `${TREE}-old\\bin\\windows\\lualatex.exe` },
		{ ProcessId: 4, ParentProcessId: 0, Name: 'System', ExecutablePath: null }
	])
);

describe('startedFrom', () => {
	it('stops only what Texpile started from the tree, a terminal compile included', () => {
		expect(startedFrom(list, TREE, 10).map((p) => p.pid)).toEqual([12, 13]);
	});
});
