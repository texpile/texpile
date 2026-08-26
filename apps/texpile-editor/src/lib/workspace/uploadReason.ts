// Why an upload did not happen, as a sentence someone can act on. git says "failed to push some
// refs" for every one of these, which is true and useless: the four cases want four different
// things done, and only one of them is something Texpile could ever fix by trying again.
import type { GitPushResult } from './git';
import { m } from '$lib/paraglide/messages';

export function uploadReason(res: GitPushResult): string {
	const remote = res.remote ?? '';
	switch (res.failure) {
		case 'rejected':
			return m.vcs_upload_rejected({ remote });
		case 'auth':
			return m.vcs_upload_auth({ remote });
		case 'network':
			return m.vcs_upload_network({ remote });
		case 'no-upstream':
			return m.vcs_upload_no_upstream();
		default:
			// an unclassified git failure: its own words beat a guess at what they meant
			return res.error ?? m.vcs_upload_unknown();
	}
}
