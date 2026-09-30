// what the terminal's xterm needs to know about the pseudo console node-pty runs a Windows shell in

export type WindowsPty = { backend: 'conpty' | 'winpty'; buildNumber: number };

// node-pty's own cut: ConPTY from this Windows 10 build on, winpty before it
const FIRST_CONPTY_BUILD = 18309;

/** null off Windows; `release` is os.release(), e.g. 10.0.26200, read the way node-pty reads it */
export function windowsPtyFor(platform: NodeJS.Platform, release: string): WindowsPty | null {
	if (platform !== 'win32') return null;
	const buildNumber = Number(/(\d+)\.(\d+)\.(\d+)/.exec(release)?.[3] ?? 0);
	return { backend: buildNumber >= FIRST_CONPTY_BUILD ? 'conpty' : 'winpty', buildNumber };
}
