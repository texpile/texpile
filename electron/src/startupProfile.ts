// Diagnostic, for launches where startupStats shows the main thread held: with
// TEXPILE_STARTUP_PROFILE set, samples this process for the first 20 s and writes
// startup-main.cpuprofile into userData. Open it in DevTools (Performance panel, Load profile)
// or read it with a script. The doctor prints the path when it is on.
import { Session } from 'node:inspector';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const PROFILE_MS = 20_000;

let on = false;

/** where the profile lands, or null when profiling is off */
export function startupProfilePath(): string | null {
	return on ? path.join(app.getPath('userData'), 'startup-main.cpuprofile') : null;
}

export function startStartupProfile(): void {
	if (!process.env.TEXPILE_STARTUP_PROFILE) return;
	on = true;
	const session = new Session();
	session.connect();
	session.post('Profiler.enable');
	session.post('Profiler.setSamplingInterval', { interval: 500 });
	session.post('Profiler.start');
	setTimeout(() => {
		session.post('Profiler.stop', (err, result) => {
			if (!err) fs.writeFile(startupProfilePath()!, JSON.stringify(result.profile), () => {});
			session.disconnect();
		});
	}, PROFILE_MS).unref();
}
