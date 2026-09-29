// The Source Control dialogs that need more than a message box: who is committing, where a branch
// is published, and git's own sign-in questions. ScmActions awaits the first two the way it awaits
// confirmAsk; the third arrives from main whenever git asks (electron/src/git/auth/gitAskpass.ts).
// GitDialogsHost draws all three.
import { answerWithGithub } from './remote/githubSignIn.svelte';
import { nativeBridge } from '../fileSystem';
import type { GitAskpassRequest, GitRemote } from './git';

// for the dialogs, which live where the web build's lint keeps git itself out
export type { GitAskpassRequest as GitQuestion } from './git';

export type Identity = { name: string; email: string };

/** where a branch goes: a GitHub repository made for it, a remote the repository already has, or
 *  one added by its address */
export type PublishChoice =
	{ kind: 'github'; name: string; isPrivate: boolean } | { kind: 'remote'; remote: string } | { kind: 'url'; url: string };

export type PublishAsk = {
	branch: string;
	remotes: GitRemote[];
	/** what a new GitHub repository is called unless the author says otherwise */
	defaultName: string;
	/** Runs the choice while the dialog stays up, so a taken name or a bad address is fixed in place
	 *  rather than started over. Resolves to the error to show, or null when it is done. */
	submit: (choice: PublishChoice) => Promise<string | null>;
};

/** what to clone and where: `<parent>/<name>` becomes the project's folder */
export type CloneChoice = { url: string; parent: string; name: string };

/** git's stage and how far through it; a copy of gitClone's, which the dialogs may not import */
export type CloneStep = { stage: string; percent: number };

export type CloneAsk = {
	/** where the last clone went, or next to the last folder opened; null when there is no guess */
	parent: string | null;
	pickParent: () => Promise<string | null>;
	/** Runs the clone while the dialog stays up, reporting as it goes. Resolves to the error to show,
	 *  '' when the author stopped it or closed a sign-in prompt, or null once it is done. */
	submit: (choice: CloneChoice, onStep: (step: CloneStep) => void) => Promise<string | null>;
	/** stop the clone under way */
	stop: () => void;
};

type Pending<T, A> = T & { resolve: (answer: A) => void };

let identity = $state<Pending<Identity, Identity | null> | null>(null);
let publish = $state<Pending<PublishAsk, boolean> | null>(null);
let questions = $state<GitAskpassRequest[]>([]);
let clone = $state<Pending<CloneAsk, CloneChoice | null> | null>(null);
/** questions off screen while their author signs in to GitHub: true while git still waits on one */
const signingIn = new Map<number, boolean>();

export const gitDialogs = {
	get identity() {
		return identity;
	},
	get publish() {
		return publish;
	},
	get clone() {
		return clone;
	},
	/** the question on screen; any others wait behind it */
	get question() {
		return questions[0] ?? null;
	}
};

/** the name and email to commit with, starting from what git has (either may be blank); null when
 *  the author backs out */
export function askIdentity(current: Identity): Promise<Identity | null> {
	identity?.resolve(null); // a newer ask supersedes this one
	return new Promise((resolve) => {
		identity = { ...current, resolve };
	});
}

export function answerIdentity(answer: Identity | null): void {
	const c = identity;
	identity = null;
	c?.resolve(answer);
}

/** true once the branch is published, false when the author backs out */
export function askPublish(ask: PublishAsk): Promise<boolean> {
	publish?.resolve(false);
	return new Promise((resolve) => {
		publish = { ...ask, resolve };
	});
}

export function closePublish(done: boolean): void {
	const c = publish;
	publish = null;
	c?.resolve(done);
}

/** what was cloned, once it is on disk; null when the author backs out */
export function askClone(ask: CloneAsk): Promise<CloneChoice | null> {
	clone?.resolve(null);
	return new Promise((resolve) => {
		clone = { ...ask, resolve };
	});
}

export function closeClone(done: CloneChoice | null): void {
	const c = clone;
	clone = null;
	c?.resolve(done);
}

/** Put git's questions on screen as they arrive. Returns the unsubscribe; outside the desktop app
 *  there is no git to ask anything. */
export function listenForGitQuestions(): () => void {
	const n = nativeBridge();
	if (!n?.onGitAskpass) return () => {};
	const offAsk = n.onGitAskpass((req) => {
		questions = [...questions, req];
	});
	// the operation ended (or its window went away) with the question still up
	const offClosed = n.onGitAskpassClosed?.((ids) => {
		questions = questions.filter((q) => !ids.includes(q.id));
		for (const id of ids) if (signingIn.has(id)) signingIn.set(id, false);
	});
	return () => {
		offAsk();
		offClosed?.();
	};
}

/** null is Cancel, which fails the git that asked - and every later question in the same operation */
export function answerQuestion(id: number, answer: string | null): void {
	questions = questions.filter((q) => q.id !== id);
	void nativeBridge()?.gitAskpassReply?.(id, answer);
}

/** Sign in with GitHub in the browser instead of typing a token: the question waits, off screen,
 *  while the author signs in, and comes back if they do not */
export async function answerWithGithubSignIn(question: GitAskpassRequest): Promise<void> {
	questions = questions.filter((q) => q.id !== question.id);
	signingIn.set(question.id, true);
	try {
		if (await answerWithGithub(question.id)) return;
		// not if the operation that asked ended meanwhile: a question back on screen for it would
		// answer nothing
		if (signingIn.get(question.id)) questions = [...questions, question];
	} finally {
		signingIn.delete(question.id);
	}
}
