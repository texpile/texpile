// The palette's Forget saved Git sign-ins: asked first, since the next push will ask for the
// password (or token) again.
import { gitForgetSignIns } from './scm/git';
import { confirmAsk } from '$lib/modals/confirm.svelte';
import { toaster } from '$lib/modals/toaster-svelte';
import { m } from '$lib/paraglide/messages';

export async function forgetSignIns(): Promise<void> {
	const detail = m.vcs_forget_signins_confirm_detail();
	if (!(await confirmAsk(m.vcs_forget_signins_confirm(), { detail, confirmLabel: m.vcs_forget_signins(), cancelLabel: m.vcs_cancel() })))
		return;
	if (await gitForgetSignIns()) toaster.success({ title: m.vcs_toast_signins_forgotten() });
}
