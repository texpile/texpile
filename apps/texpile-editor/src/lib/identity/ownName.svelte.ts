// The reader's name where something needs one: hosting a session, a comment, suggesting. The name typed in Preferences
// first, then git's user.name; asked for only when neither has one, and then kept as the Preferences name
import { userData, updateUserData } from '$lib/storage/userData';
import { folderGitName } from '$lib/comments/author';

/** the one question open, if any: NamePrompt draws it and answers through `answer` */
export const nameAsk = $state<{ open: boolean; answer: ((name: string | null) => void) | null }>({ open: false, answer: null });

/** the name typed in Preferences, or '' */
export function typedName(): string {
	return (userData.current.commentAuthor || userData.current.collabName).trim();
}

/** the name to go by, or '' when there is none to be found */
export async function ownName(root: string | null): Promise<string> {
	return typedName() || (await folderGitName(root))?.trim() || '';
}

// one question at a time: anything else that needs a name while it is open waits on the same answer
let asking: Promise<string | null> | null = null;

function ask(): Promise<string | null> {
	const answer = new Promise<string | null>((resolve) => {
		nameAsk.answer = resolve;
		nameAsk.open = true;
	});
	return answer.finally(() => {
		nameAsk.open = false;
		nameAsk.answer = null;
		asking = null;
	});
}

/**
 * Whether there is a name to go by now, asking for one if not. False means the reader closed the question, and the
 * thing that needed a name should not go ahead.
 */
export async function ensureName(root: string | null): Promise<boolean> {
	if (await ownName(root)) return true;
	const name = (await (asking ??= ask()))?.trim();
	if (!name) return false;
	updateUserData({ collabName: name });
	return true;
}
