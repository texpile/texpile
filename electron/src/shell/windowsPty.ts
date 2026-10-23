// what the terminal's xterm needs to know about the pseudo console node-pty runs a Windows shell in

export type WindowsPty = { backend: 'conpty'; buildNumber: number };

/** null off Windows; `release` is os.release(), e.g. 10.0.26200 */
export function windowsPtyFor(platform: NodeJS.Platform, release: string): WindowsPty | null {
	if (platform !== 'win32') return null;
	return { backend: 'conpty', buildNumber: Number(/(\d+)\.(\d+)\.(\d+)/.exec(release)?.[3] ?? 0) };
}
