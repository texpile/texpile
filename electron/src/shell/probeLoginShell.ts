import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// the marker is per-run and the payload is JSON, so rc-file chatter cannot be mistaken for output
export function probeLoginShell(timeoutMs: number): Promise<NodeJS.ProcessEnv> {
	return new Promise((resolve, reject) => {
		const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
		const mark = randomUUID().replace(/-/g, '').slice(0, 12);
		const name = shell.slice(shell.lastIndexOf('/') + 1);

		let args: string[];
		let command: string;
		if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
			command = `& '${process.execPath}' -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`;
			args = ['-Login', '-Command'];
		} else {
			command = `'${process.execPath}' -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
			args = name === 'tcsh' || name === 'csh' ? ['-ic'] : ['-i', '-l', '-c'];
		}

		const child = spawn(shell, [...args, command], {
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1', TEXPILE_RESOLVING_ENVIRONMENT: '1' }
		});

		const timer = setTimeout(() => {
			child.kill();
			reject(new Error(`the login shell (${shell}) did not answer within ${Math.round(timeoutMs / 1000)}s`));
		}, timeoutMs);

		const out: Buffer[] = [];
		child.stdout.on('data', (b: Buffer) => out.push(b));
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code, signal) => {
			clearTimeout(timer);
			if (code || signal) {
				reject(new Error(`the login shell (${shell}) exited with code ${code}, signal ${signal}`));
				return;
			}
			const match = new RegExp(`${mark}(.*)${mark}`, 's').exec(Buffer.concat(out).toString('utf8'));
			if (!match) {
				reject(new Error(`the login shell (${shell}) printed no environment`));
				return;
			}
			try {
				const env = JSON.parse(match[1]) as NodeJS.ProcessEnv;
				delete env.ELECTRON_RUN_AS_NODE;
				delete env.ELECTRON_NO_ATTACH_CONSOLE;
				delete env.TEXPILE_RESOLVING_ENVIRONMENT;
				resolve(env);
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	});
}
