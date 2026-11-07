// the words for an install of Texpile's own TeX Live
import { megabytes } from './installStepUtils';
import { m } from '$lib/paraglide/messages';

export function texLiveStepText(step: InstallStep, year: number): string {
	if (step.phase === 'verify') return m.texlive_install_verifying();
	if (step.phase === 'extract') return m.texlive_install_unpacking();
	const y = String(year);
	if (step.total > 0) return m.texlive_install_downloading({ year: y, received: megabytes(step.received), total: megabytes(step.total) });
	return m.texlive_install_starting({ year: y });
}

export function texLiveFailureText(failure: { reason: InstallFailure; detail: string }): string {
	switch (failure.reason) {
		case 'unsupported':
			return m.texlive_install_failed_unsupported();
		case 'offline':
			return m.texlive_install_failed_offline();
		case 'checksum':
			return m.texlive_install_failed_checksum();
		case 'disk':
			return m.texlive_install_failed_disk({ detail: failure.detail });
		case 'extract':
			return m.texlive_install_failed_extract({ detail: failure.detail });
		case 'broken':
			return m.texlive_install_failed_broken();
		case 'download':
		case 'cancelled':
			return m.texlive_install_failed_download({ detail: failure.detail });
	}
}

/** the installed tree's year as its programs name it, which a later pin can move past */
export function texLiveInstalledText(detail: string, pinnedYear: number): string {
	const year = /\(TeX Live (\d{4})\)/.exec(detail)?.[1] ?? String(pinnedYear);
	return m.prefs_texlive_managed_installed({ year });
}
