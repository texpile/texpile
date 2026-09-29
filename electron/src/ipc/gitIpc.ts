// the git:* surface, backing the Source Control panel. Every call runs in the helper process
// (helper/helperWorker.ts); main only relays.
import type { WebContents } from 'electron';
import { helperCall, onHelperEvent } from '../helper/helperProcess';
import { handleFs, handleFsE } from './ipcResult';
import { timeSpan } from '../startupStats';
import { withAskpass, registerAskpassIpc } from '../git/auth/gitAskpass';
import { githubPublish } from '../git/remote/githubPublish';

// channel -> gitService export
const OPS: Record<string, string> = {
	'git:status': 'gitStatus',
	'git:show': 'gitShowHead',
	'git:init': 'gitInit',
	'git:stage': 'gitStage',
	'git:unstage': 'gitUnstage',
	'git:discard': 'gitDiscard',
	'git:commit': 'gitCommit',
	'git:identity': 'gitIdentity',
	'git:setIdentity': 'gitSetIdentity',
	'git:log': 'gitLog',
	'git:fileLog': 'gitFileLog',
	'git:changesSince': 'gitChangesSince',
	'git:showAt': 'gitShowAt',
	'git:changesIn': 'gitChangesIn',
	'git:fileAt': 'gitFileAt',
	'git:restore': 'gitRestore',
	'git:restoreInTheWay': 'gitRestoreInTheWay',
	'git:remotes': 'gitRemotes',
	'git:addRemote': 'gitAddRemote',
	'git:recheck': 'gitRecheck',
	'git:trustRepo': 'gitTrustRepo',
	'git:combine': 'gitCombine',
	'git:finishCombine': 'gitFinishCombine',
	'git:cancelCombine': 'gitCancelCombine',
	'git:keepSide': 'gitKeepSide',
	'git:branches': 'gitBranches',
	'git:switch': 'gitSwitch'
};

// The calls that reach a remote, and so may have to ask someone to sign in: channel -> [gitService
// export, how many arguments the renderer sends]. The askpass environment goes after exactly that
// many, so an extra argument from a confused renderer cannot land where the environment belongs.
const NET_OPS: Record<string, [string, number]> = {
	'git:push': ['gitPush', 1],
	'git:publish': ['gitPublish', 2],
	'git:sync': ['gitSync', 2],
	'git:fetch': ['gitFetch', 1]
};

/** how long the automatic check may go without a word from git (gitFetch.ts `stall`) */
const QUIET_FETCH_STALL_MS = 3 * 60_000;

export function registerGitIpc(): void {
	for (const [channel, op] of Object.entries(OPS)) {
		handleFs(channel, (...args: unknown[]) => timeSpan(channel, helperCall(`git.${op}`, args)));
	}
	for (const [channel, [op, arity]] of Object.entries(NET_OPS)) {
		handleFsE(channel, (e, ...args: unknown[]) => {
			const given = Array.from({ length: arity }, (_, i) => args[i]);
			return timeSpan(
				channel,
				withAskpass(e.sender, (env) => helperCall(`git.${op}`, [...given, env]) as Promise<{ ok: boolean; failure?: string }>)
			);
		});
	}
	// the automatic check for new versions (VS Code's autofetch): the same fetch, with no one asked,
	// and so given up after a while without a word from git rather than left waiting for ever
	handleFsE('git:fetchQuiet', (e, root: unknown) =>
		timeSpan(
			'git:fetchQuiet',
			withAskpass(
				e.sender,
				(env) => helperCall('git.gitFetch', [root, env, QUIET_FETCH_STALL_MS]) as Promise<{ ok: boolean; failure?: string }>,
				{ quiet: true }
			)
		)
	);
	// a clone reports its progress as it goes, to the window that asked for it, and only that
	// window can stop it
	let clones = 0;
	const running = new Map<string, WebContents>();
	handleFsE('git:clone', (e, url: string, parent: string, name: string) => {
		const key = `clone-${++clones}`;
		running.set(key, e.sender);
		const off = onHelperEvent((ev) => {
			if (ev.event === 'git-progress' && ev.key === key && !e.sender.isDestroyed()) e.sender.send('git:cloneProgress', ev.data);
		});
		return timeSpan(
			'git:clone',
			withAskpass(
				e.sender,
				(env) => helperCall('git.gitClone', [url, parent, name, env, key]) as Promise<{ ok: boolean; failure?: string }>
			)
		).finally(() => {
			off();
			running.delete(key);
		});
	});
	handleFsE('git:cancelClone', async (e) => {
		for (const [key, sender] of running) if (sender === e.sender) await helperCall('git.cancelClone', [key]);
		return true;
	});
	handleFsE('git:githubPublish', (e, root: string, opts: { name: string; isPrivate: boolean; remote: string }) =>
		timeSpan('git:githubPublish', githubPublish(e.sender, root, opts))
	);
	registerAskpassIpc();
}
