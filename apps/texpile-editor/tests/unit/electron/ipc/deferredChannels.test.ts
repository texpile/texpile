// A handler registered after the window is up must be listed under its step, or a call that arrives first finds nothing
import { expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFERRED_STEP_CHANNELS, type DeferredStep } from '../../../../../../electron/src/ipc/deferredChannels';

const IPC_DIR = path.resolve(import.meta.dirname, '../../../../../../electron/src/ipc');
const REGISTERED = /(?:ipcMain\.handle|handleFsE?)\(\s*'([^']+)'/g;
const LOCAL_IMPORT = /from '(\.\.?\/[^']+)'/g;

// a step's channels are registered by its module or by one it imports (gitIpc registers github: through gitAskpass)
function channelsOf(file: string, seen = new Set<string>()): string[] {
	if (seen.has(file) || !fs.existsSync(file)) return [];
	seen.add(file);
	const text = fs.readFileSync(file, 'utf8');
	const own = [...text.matchAll(REGISTERED)].map((m) => m[1]);
	const nested = [...text.matchAll(LOCAL_IMPORT)].flatMap((m) =>
		channelsOf(path.resolve(path.dirname(file), m[1].replace(/\.js$/, '') + '.ts'), seen)
	);
	return [...own, ...nested];
}

it("lists every channel a deferred step registers under that step's own name", () => {
	const source = fs.readFileSync(path.join(IPC_DIR, 'deferredIpc.ts'), 'utf8');
	const steps = [...source.matchAll(/\[\s*'(\w+)',[\s\S]*?import\('(\.\.?\/[^']+)\.js'\)/g)].map((m) => ({
		name: m[1] as DeferredStep,
		file: path.join(IPC_DIR, `${m[2]}.ts`)
	}));
	expect(steps.map((s) => s.name)).toEqual(Object.keys(DEFERRED_STEP_CHANNELS));
	// what main registers at launch through its static imports is there before any window calls
	const eager = new Set(channelsOf(path.join(IPC_DIR, '..', 'main.ts')));
	const unlisted = steps.flatMap(({ name, file }) =>
		channelsOf(file)
			.filter((c) => !eager.has(c) && !DEFERRED_STEP_CHANNELS[name].some((d) => c.startsWith(d)))
			.map((c) => `${name}: ${c}`)
	);
	expect(unlisted).toEqual([]);
	expect(channelsOf(steps.find((s) => s.name === 'git')!.file)).toContain('github:account');
});
