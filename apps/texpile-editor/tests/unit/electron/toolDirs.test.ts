import { it, expect, afterEach } from 'vitest';
import * as path from 'node:path';
import {
	appDir,
	applyToolDirs,
	dirForms,
	onToolPathChange,
	setPathFallback,
	setToolDirs
} from '../../../../../electron/src/shell/toolDirs';

const key = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
const saved = process.env[key];
const sep = process.platform === 'win32' ? ';' : ':';

afterEach(() => {
	setPathFallback(null);
	setToolDirs([]);
	process.env[key] = saved;
	delete process.env.APPIMAGE;
});

it('puts the configured folders in front of the shell PATH and takes them out again', () => {
	process.env[key] = ['/usr/bin', '/bin'].join(sep);
	setToolDirs(['/opt/texlive/bin']);
	expect(process.env[key]).toBe(['/usr/bin', '/bin'].join(sep));
	applyToolDirs();
	expect(process.env[key]).toBe(['/opt/texlive/bin', '/usr/bin', '/bin'].join(sep));
	setToolDirs(['/opt/other', '/bin', '  ']);
	expect(process.env[key]).toBe(['/opt/other', '/bin', '/usr/bin'].join(sep));
	setToolDirs(['tools']);
	expect(process.env[key]).toBe([path.resolve(path.dirname(process.execPath), 'tools'), '/usr/bin', '/bin'].join(sep));
	setToolDirs([]);
	expect(process.env[key]).toBe(['/usr/bin', '/bin'].join(sep));
});

it('counts a relative folder from the AppImage file, not from its temporary mount', () => {
	process.env.APPIMAGE = path.resolve('/', 'media', 'stick', 'Texpile.AppImage');
	expect(appDir()).toBe(path.resolve('/', 'media', 'stick'));
});

it('spells a folder relative to the app only for a portable app, and only on its drive', () => {
	const base = path.resolve('/', 'tools', 'texpile');
	const tex = path.resolve('/', 'texlive', 'bin');
	expect(dirForms(tex, false, base)).toEqual({ absolute: tex, relative: null });
	expect(dirForms(tex, true, base)).toEqual({ absolute: tex, relative: path.join('..', '..', 'texlive', 'bin') });
	expect(dirForms(path.join('..', '..', 'texlive', 'bin'), true, base)).toEqual({
		absolute: tex,
		relative: path.join('..', '..', 'texlive', 'bin')
	});
	if (process.platform === 'win32')
		expect(dirForms('Q:\\texlive\\bin', true, base)).toEqual({ absolute: 'Q:\\texlive\\bin', relative: null });
});

it('tells a listener the new PATH each time the folders move it', () => {
	process.env[key] = ['/usr/bin', '/bin'].join(sep);
	applyToolDirs();
	const seen: string[] = [];
	onToolPathChange((p) => seen.push(p));
	setToolDirs(['/opt/other']);
	expect(seen).toEqual([['/opt/other', '/usr/bin', '/bin'].join(sep)]);
});

it("puts Texpile's own TeX after the shell PATH, and in front once it is picked", () => {
	const tex = path.resolve('/', 'data', 'texlive', 'bin', 'x86_64-linux');
	process.env[key] = ['/usr/bin', '/bin'].join(sep);
	applyToolDirs();
	setPathFallback(tex);
	expect(process.env[key]).toBe(['/usr/bin', '/bin', tex].join(sep));
	setToolDirs([tex]);
	expect(process.env[key]).toBe([tex, '/usr/bin', '/bin'].join(sep));
});
