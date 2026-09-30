// The platform dialog that asks where an export goes (electron/src/ipc/exportTargetIpc.ts).
import { browser } from '$lib/runtime';

export type ExportTargetRequest = {
	kind: 'file' | 'folder';
	defaultPath: string;
	extension?: string;
	title: string;
};

type ExportTargetApi = { pickExportTarget?: (req: ExportTargetRequest) => Promise<string | null> };

function api(): ExportTargetApi | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileNative?: ExportTargetApi }).texpileNative;
}

/** false in the browser build and under a preload that predates the dialog */
export function exportTargetAvailable(): boolean {
	return typeof api()?.pickExportTarget === 'function';
}

/** the chosen path, or null when the dialog was cancelled */
export async function pickExportTarget(req: ExportTargetRequest): Promise<string | null> {
	const pick = api()?.pickExportTarget;
	if (!pick) return null;
	return (await pick(req)) ?? null;
}
