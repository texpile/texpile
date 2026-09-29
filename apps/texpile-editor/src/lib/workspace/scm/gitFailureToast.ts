// A git operation that failed, as a toast: the plain sentence, and git's own words one click away
// rather than pasted into the toast, where a wall of "remote:" lines buried the sentence. For a
// secret GitHub flagged, the click is GitHub's own page instead, where it can be allowed.
import { toaster } from '$lib/modals/toaster-svelte';
import { promptAsk } from '$lib/modals/confirm.svelte';
import { secretAllowUrl } from '../uploadReason';
import { m } from '$lib/paraglide/messages';

/** git's output in a dialog of its own, with a way to copy it for someone who can read it */
export async function showGitOutput(output: string): Promise<void> {
	const answer = await promptAsk({
		title: m.vcs_details_title(),
		message: m.vcs_details_message(),
		detail: output.trim(),
		buttons: [
			{ id: 'close', label: m.vcs_details_close(), primary: true },
			{ id: 'copy', label: m.vcs_details_copy() }
		],
		cancelId: 'close'
	});
	if (answer === 'copy') void navigator.clipboard.writeText(output.trim()).catch(() => {});
}

/** `description` is what to tell the author; `error` is git's output, offered as Details when the
 *  description does not already say it word for word */
export function toastGitFailure(title: string, description: string, res: { failure?: string; error?: string }): void {
	const allow = res.failure === 'secret' && res.error ? secretAllowUrl(res.error) : null;
	const raw = res.error?.trim();
	const action = allow
		? { label: m.vcs_secret_open(), onClick: () => void window.open(allow, '_blank') }
		: raw && raw !== description.trim()
			? { label: m.vcs_details(), onClick: () => void showGitOutput(raw) }
			: undefined;
	toaster.error({ title, description, action });
}
