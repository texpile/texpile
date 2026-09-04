// the git:* surface, backing the Source Control panel. Every call runs in the helper process
// (helper/helperWorker.ts); main only relays.
import { helperCall } from '../helper/helperProcess';
import { handleFs } from './ipcResult';
import { shellEnvReady } from '../shell/shellEnv';
import { timeSpan } from '../startupStats';

// channel -> gitService export
const OPS: Record<string, string> = {
	'git:status': 'gitStatus',
	'git:show': 'gitShowHead',
	'git:init': 'gitInit',
	'git:stage': 'gitStage',
	'git:unstage': 'gitUnstage',
	'git:discard': 'gitDiscard',
	'git:commit': 'gitCommit',
	'git:userName': 'gitUserName',
	'git:log': 'gitLog',
	'git:changesSince': 'gitChangesSince',
	'git:showAt': 'gitShowAt',
	'git:restore': 'gitRestore',
	'git:push': 'gitPush'
};

export function registerGitIpc(): void {
	for (const [channel, op] of Object.entries(OPS)) {
		handleFs(channel, (...args: unknown[]) => timeSpan(channel, helperCall(`git.${op}`, args)));
	}
}
