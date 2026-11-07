import { it, expect } from 'vitest';
import { texliveRoot } from '../../../../../../electron/src/texlive/texliveDir';

it("keeps an installed Windows Texpile's TeX out of the roaming profile", () => {
	const env = { LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local' };
	expect(texliveRoot('C:\\Users\\a\\AppData\\Roaming\\texpile-desktop', false, 'win32', env)).toBe(
		'C:\\Users\\a\\AppData\\Local\\texpile-desktop\\texlive'
	);
	expect(texliveRoot('D:\\Texpile\\data', true, 'win32', env)).toBe('D:\\Texpile\\data\\texlive');
});
