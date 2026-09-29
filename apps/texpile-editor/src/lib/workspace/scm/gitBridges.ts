// The preload's optional git halves, one type per client module, joined here so the bridge type in
// fileSystem.ts names them once. Each is optional throughout: an older preload lacks it, and the
// feature it backs is simply not offered.
import type { GitRemoteBridge } from './git';
import type { GitCombineBridge } from './branches/gitCombine';
import type { GitCloneBridge } from './remote/gitClone';
import type { GitVersionBridge } from './gitVersion';
import type { GitBranchBridge } from './branches/gitBranches';
import type { GitTrustBridge } from './gitTrust';
import type { GitFetchBridge } from './remote/scmFetch.svelte';
import type { GitAutoCheckBridge } from './actions/scmAutoCheck.svelte';
import type { LocalHistoryBridge } from '../localHistory/localHistory.svelte';
import type { GithubAuthBridge } from './remote/githubSignIn.svelte';

export type GitBridges = GitRemoteBridge &
	GitCombineBridge &
	GitCloneBridge &
	GitVersionBridge &
	GitBranchBridge &
	GitTrustBridge &
	GitFetchBridge &
	GitAutoCheckBridge &
	LocalHistoryBridge &
	GithubAuthBridge;
