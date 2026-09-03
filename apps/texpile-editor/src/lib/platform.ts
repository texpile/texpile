import { browser } from '$lib/runtime';

function detectMac(): boolean {
	if (!browser || typeof navigator === 'undefined') return false;
	const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
	if (uaData?.platform) return /mac/i.test(uaData.platform);
	if (navigator.platform) return /Mac|iPhone|iPad|iPod/.test(navigator.platform);
	return /Mac/i.test(navigator.userAgent);
}

function detectWindows(): boolean {
	if (!browser || typeof navigator === 'undefined') return false;
	const uaData = (navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData;
	if (uaData?.platform) return /win/i.test(uaData.platform);
	if (navigator.platform) return /Win/.test(navigator.platform);
	return /Windows/i.test(navigator.userAgent);
}

export const isMac = detectMac();
/** Linux is not Windows: for dialog button order it follows macOS */
export const isWindows = detectWindows();

export const modLabel = isMac ? '⌘' : 'Ctrl';

export function modKey(...rest: string[]): string {
	return [modLabel, ...rest].join('+');
}
