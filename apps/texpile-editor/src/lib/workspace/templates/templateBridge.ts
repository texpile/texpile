// The renderer end of templates: the user's saved ones and the Typst Universe list, both through
// the desktop app's texpileTemplates bridge (electron/src/ipc/templatesIpc.ts). Absent in the
// browser build, where every entry point stays hidden.
import { browser } from '$lib/runtime';
import type { TexpileTemplatesBridge } from './templateBridge.types';

export function templatesBridge(): TexpileTemplatesBridge | undefined {
	if (!browser) return undefined;
	return (window as unknown as { texpileTemplates?: TexpileTemplatesBridge }).texpileTemplates;
}

/** the bridge, or a clear error; the message can reach a toast */
export function requireTemplatesBridge(): TexpileTemplatesBridge {
	const bridge = templatesBridge();
	if (!bridge) throw new Error('Templates require the Texpile desktop app.');
	return bridge;
}

/** saving and listing your own templates works here (the desktop app) */
export function userTemplatesAvailable(): boolean {
	return !!templatesBridge();
}

/** an IPC rejection reads "Error invoking remote method 'x': Error: <msg>"; keep the <msg> */
export function bridgeErrorText(e: unknown): string {
	const raw = e instanceof Error ? e.message : String(e);
	return raw.replace(/^Error invoking remote method '[^']+':\s*(Error:\s*)?/, '');
}
