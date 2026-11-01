import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

// a lualatex that is not installed: spawn answers with ENOENT and nothing ever exits
vi.mock('node:child_process', () => ({
	spawn: () => {
		const child = Object.assign(new EventEmitter(), {
			stdout: Object.assign(new EventEmitter(), { setEncoding: () => {} }),
			stderr: { resume: () => {} },
			stdin: Object.assign(new EventEmitter(), { write: () => true }),
			kill: () => true
		});
		// as node does: on the next tick, before a picture queued in the same task starts
		process.nextTick(() => child.emit('error', Object.assign(new Error('spawn lualatex ENOENT'), { code: 'ENOENT' })));
		return child;
	}
}));

const { engineFile, renderPicture } = await import('../../../../../../electron/src/draw/drawDaemon');

describe('drawDaemon', () => {
	it('reads only a font the engine reported', () => {
		expect(() => engineFile('C:/Users/me/secret.png')).toThrow('not a font the engine reported');
	});

	it('reports a missing lualatex at once, and the next picture asks again', async () => {
		const job = { root: '/tmp', preamble: '\\documentclass{article}', picture: '', luaDir: '/tmp' };
		// from a task of its own, as a window's request arrives
		const asked = () => new Promise((resolve, reject) => setTimeout(() => renderPicture(job, 1).then(resolve, reject)));
		await expect(asked()).rejects.toThrow('program missing: lualatex');
		await expect(asked()).rejects.toThrow('program missing: lualatex');
	}, 3000);
});
