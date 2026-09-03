// The one prompt in the app: a message with a few buttons. Await promptAsk() (or confirmAsk()
// for a yes/no) anywhere; on the desktop it is the OS message box, VS Code's default, and on the
// web ConfirmHost draws it (lib/platformSurfaces.ts).
//
// The native path is Electron's main-process box, modal to the window. It is not window.confirm:
// that one blocked the renderer and left Chromium's focus state desynced afterwards (the caret
// vanished until the window was cycled), which is why an in-app dialog replaced it at all.
import { nativeBridge } from '$lib/workspace/fileSystem';
import { nativeDialogs } from '$lib/platformSurfaces';

export type PromptButton = { id: string; label: string; primary?: boolean };

export type PromptOptions = {
	title?: string;
	message: string;
	detail?: string;
	/** listed in any order; the row (or the OS) decides where each goes */
	buttons: PromptButton[];
	/** the button Escape, the X and the backdrop mean; omitted, the prompt cannot be dismissed */
	cancelId?: string;
	/** a destructive primary */
	danger?: boolean;
};

type Pending = PromptOptions & { resolve: (id: string | null) => void };

let current = $state<Pending | null>(null);

export const promptDialog = {
	get state() {
		return current;
	}
};

/** primary first, cancel last: the order the native box starts from */
export function promptOrder(buttons: PromptButton[], cancelId?: string): PromptButton[] {
	const primary = buttons.filter((b) => b.primary);
	const cancel = buttons.filter((b) => b.id === cancelId && !b.primary);
	const rest = buttons.filter((b) => !b.primary && b.id !== cancelId);
	return [...primary, ...rest, ...cancel];
}

async function askNative(o: PromptOptions): Promise<string | null> {
	const ordered = promptOrder(o.buttons, o.cancelId);
	const cancelIndex = ordered.findIndex((b) => b.id === o.cancelId);
	const index = await nativeBridge()!.showMessageBox!({
		kind: o.danger ? 'warning' : 'question',
		title: o.title,
		message: o.message,
		detail: o.detail,
		buttons: ordered.map((b) => b.label),
		cancelId: cancelIndex === -1 ? undefined : cancelIndex
	});
	return index === null ? null : (ordered[index]?.id ?? null);
}

/** resolves to the chosen button's id; null when dismissed */
export function promptAsk(o: PromptOptions): Promise<string | null> {
	if (nativeDialogs()) return askNative(o);
	current?.resolve(null); // a newer ask supersedes this one: the abandoned one was dismissed
	return new Promise((resolve) => {
		current = { ...o, resolve };
	});
}

export function confirmAsk(message: string, opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
	return promptAsk({
		message,
		buttons: [
			{ id: 'ok', label: opts?.confirmLabel ?? 'OK', primary: true },
			{ id: 'cancel', label: opts?.cancelLabel ?? 'Cancel' }
		],
		cancelId: 'cancel',
		danger: opts?.danger
	}).then((id) => id === 'ok');
}

/** Escape / backdrop / X: the cancel button's answer, or null for a prompt without one */
export function dismissPrompt(): void {
	answerPrompt(current?.cancelId ?? null);
}

export function answerPrompt(id: string | null): void {
	const c = current;
	current = null;
	c?.resolve(id);
}
