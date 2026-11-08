// the numbers an install's progress shows, for tinymist and TeX Live alike

export function megabytes(bytes: number): string {
	return (bytes / 1048576).toFixed(1);
}

/** 0-100 for the bar; the steps after the download have no size of their own and show it full */
export function installStepPercent(step: InstallStep): number {
	if (step.phase !== 'download') return 100;
	return step.total > 0 ? Math.min(100, (step.received / step.total) * 100) : 0;
}
