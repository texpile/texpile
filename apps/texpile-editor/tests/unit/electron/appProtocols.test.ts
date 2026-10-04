// texfile:// serves what lies inside a folder a window has open. Electron and the window list are stood in for; the
// files are real
import { it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

type Handle = (request: { url: string; headers: Headers }) => Promise<Response>;

const h = vi.hoisted(() => ({ handlers: new Map<string, Handle>() }));

vi.mock('electron', () => ({
	app: { isPackaged: false, getName: () => 'Texpile', getPath: () => os.tmpdir() },
	protocol: { handle: (scheme: string, fn: Handle) => h.handlers.set(scheme, fn), registerSchemesAsPrivileged: () => {} }
}));
vi.mock('../../../../../electron/src/fontT1Map', () => ({ isAllowedFontPath: () => false }));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'texpile-texfile-'));
const project = path.join(dir, 'project');
const outside = path.join(dir, 'outside');

beforeAll(async () => {
	fs.mkdirSync(project);
	fs.mkdirSync(outside);
	fs.writeFileSync(path.join(project, 'fig.png'), 'png');
	fs.writeFileSync(path.join(outside, 'secret.png'), 'secret');
	fs.symlinkSync(outside, path.join(project, 'link'), 'junction');
	const { windowRoots, normRoot } = await import('../../../../../electron/src/windows/windowRegistry');
	windowRoots.set(1, { raw: project, norm: normRoot(project) });
	(await import('../../../../../electron/src/appProtocols')).registerProtocolHandlers();
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function texfile(p: string): Promise<Response> {
	return h.handlers.get('texfile')!({ url: `texfile://local/?path=${encodeURIComponent(p)}`, headers: new Headers() });
}

it('serves a file of the open folder, and nothing a link in it reaches outside', async () => {
	expect(await (await texfile(path.join(project, 'fig.png'))).text()).toBe('png');
	expect((await texfile(path.join(project, 'link', 'secret.png'))).status).toBe(403);
});

it('turns away a path outside every open folder before touching it, so a network path is never dialed', async () => {
	const realpath = vi.spyOn(fs.promises, 'realpath');
	const network = '//attacker.example/share/x.png';
	expect((await texfile(network)).status).toBe(403);
	expect((await texfile(path.join(outside, 'secret.png'))).status).toBe(403);
	expect(realpath.mock.calls.map(([p]) => String(p))).not.toContain(network);
	expect(realpath.mock.calls.map(([p]) => String(p))).not.toContain(path.join(outside, 'secret.png'));
	realpath.mockRestore();
});
