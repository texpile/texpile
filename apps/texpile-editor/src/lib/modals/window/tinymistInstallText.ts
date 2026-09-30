// The words for an install of Texpile's own tinymist: its progress, its failures, and which copy is in use
import { m } from '$lib/paraglide/messages';

function megabytes(bytes: number): string {
	return (bytes / 1048576).toFixed(1);
}

export function tinymistStepText(step: TinymistInstallStep, version: string): string {
	if (step.phase === 'verify') return m.tinymist_install_verifying();
	if (step.phase === 'extract') return m.tinymist_install_unpacking();
	if (step.total > 0) return m.tinymist_install_downloading({ version, received: megabytes(step.received), total: megabytes(step.total) });
	return m.tinymist_install_starting({ version });
}

/** 0-100 for the bar; the steps after the download have no size of their own and show it full */
export function tinymistStepPercent(step: TinymistInstallStep): number {
	if (step.phase !== 'download') return 100;
	return step.total > 0 ? Math.min(100, (step.received / step.total) * 100) : 0;
}

export function tinymistFailureText(failure: { reason: TinymistInstallFailure; detail: string }): string {
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

export function tinymistSourceLabel(source: TinymistInfo['source']): string {
	return source === 'managed' ? m.tinymist_source_managed() : m.tinymist_source_path();
}
