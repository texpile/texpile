// OpenCode as a plain model for one task: a profile of Texpile's own with the task's rules for its prompt and no tools,
// read from a config folder of Texpile's own. The reader's own config and sign-ins still load, their AGENTS.md does not
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import { findProgram } from '../../shell/findProgram';
import type { HeldPlace } from './heldProcess';

const PROFILE = 'texpile';

function profile(system: string): object {
	return {
		$schema: 'https://opencode.ai/config.json',
		autoupdate: false,
		share: 'disabled',
		default_agent: PROFILE,
		agent: {
			[PROFILE]: { mode: 'primary', description: 'Texpile', prompt: system, tools: { '*': false } },
			// else every new session asks the model for a title as well
			title: { disable: true }
		}
	};
}

// OpenCode files a folder's sessions under its git repository, and a folder outside one under the list every such folder
// shows. One empty commit keeps Texpile's requests out of the reader's lists
function makeOwnRepository(dir: string): Promise<void> {
	const git = findProgram('git');
	if (!git || fs.existsSync(path.join(dir, '.git'))) return Promise.resolve();
	const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull };
	const own = ['-c', 'user.name=Texpile', '-c', 'user.email=texpile@localhost', '-c', 'commit.gpgsign=false'];
	const run = (args: string[]) => new Promise<void>((done) => execFile(git, args, { cwd: dir, env, windowsHide: true }, () => done()));
	return run(['init', '-q']).then(() => run([...own, 'commit', '-q', '--allow-empty', '-m', 'Texpile']));
}

/** each task has its own config folder, which its process reads once as it starts */
export async function openCodePlace(task: string, system: string): Promise<HeldPlace> {
	const root = path.join(app.getPath('userData'), 'opencode');
	const config = path.join(root, task);
	const kept = path.join(root, 'work');
	fs.mkdirSync(config, { recursive: true });
	fs.mkdirSync(kept, { recursive: true });
	fs.writeFileSync(path.join(config, 'opencode.json'), JSON.stringify(profile(system), null, 1), 'utf8');
	await makeOwnRepository(kept);
	return { kept, env: { OPENCODE_CONFIG_DIR: config, OPENCODE_DISABLE_CLAUDE_CODE: '1' } };
}
