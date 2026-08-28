// the git:* surface, backing the Source Control panel
import * as gitService from '../gitService';
import { handleFs } from './ipcResult';
import { shellEnvReady } from '../shell/shellEnv';

// simple-git spawns git with our own environment (see gitService), so every call waits on the
// login shell's PATH instead of being handed one
function withShellEnv(fn: (...args: never[]) => Promise<unknown>): (...args: never[]) => Promise<unknown> {
	return async (...args: never[]) => {
		await shellEnvReady();
		return fn(...args);
	};
}

export function registerGitIpc(): void {
	handleFs('git:status', withShellEnv(gitService.gitStatus));
	handleFs('git:show', withShellEnv(gitService.gitShowHead));
	handleFs('git:init', withShellEnv(gitService.gitInit));
	handleFs('git:stage', withShellEnv(gitService.gitStage));
	handleFs('git:unstage', withShellEnv(gitService.gitUnstage));
	handleFs('git:discard', withShellEnv(gitService.gitDiscard));
	handleFs('git:commit', withShellEnv(gitService.gitCommit));
	handleFs('git:userName', withShellEnv(gitService.gitUserName));
	handleFs('git:log', withShellEnv(gitService.gitLog));
	handleFs('git:changesSince', withShellEnv(gitService.gitChangesSince));
	handleFs('git:showAt', withShellEnv(gitService.gitShowAt));
	handleFs('git:restore', withShellEnv(gitService.gitRestore));
	handleFs('git:push', withShellEnv(gitService.gitPush));
}
