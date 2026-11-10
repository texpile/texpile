// The words for an install of Texpile's own tinymist: its progress and its failures
import { megabytes } from './toolchain/install/installStepUtils';
import { m } from '$lib/paraglide/messages';

export function tinymistStepText(step: InstallStep, version: string): string {
	if (step.phase === 'verify') return m.tinymist_install_verifying();
	if (step.phase === 'extract') return m.tinymist_install_unpacking();
	if (step.total > 0) return m.tinymist_install_downloading({ version, received: megabytes(step.received), total: megabytes(step.total) });
	return m.tinymist_install_starting({ version });
}

export function tinymistFailureText(failure: { reason: InstallFailure; detail: string }): string {
	switch (failure.reason) {
		case 'unsupported':
			return m.tinymist_install_failed_unsupported();
		case 'offline':
			return m.tinymist_install_failed_offline();
		case 'checksum':
			return m.tinymist_install_failed_checksum();
		case 'disk':
			return m.tinymist_install_failed_disk({ detail: failure.detail });
		case 'extract':
			return m.tinymist_install_failed_extract({ detail: failure.detail });
		case 'broken':
			return m.tinymist_install_failed_broken();
		case 'download':
		case 'cancelled':
			return m.tinymist_install_failed_download({ detail: failure.detail });
	}
}
