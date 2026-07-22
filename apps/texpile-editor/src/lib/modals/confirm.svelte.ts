// A themed, in-app replacement for window.confirm(). Native dialogs are avoided in Electron: a
// native confirm/alert/prompt is a separate OS window, and closing it leaves Chromium's page-focus
// state desynced, so the editor's caret vanishes and clicks won't refocus until the OS window is
// cycled (alt-tab). Same reason window.prompt was already replaced. Await confirmAsk() anywhere;
// <ConfirmHost/> (mounted once in App) renders it.

interface ConfirmState {
	message: string;
	confirmLabel: string;
	/** label for the decline button; defaults to Cancel. */
	cancelLabel: string | null;
	danger: boolean;
	resolve: (ok: boolean) => void;
}

let current = $state<ConfirmState | null>(null);

export const confirmDialog = {
	get state() {
		return current;
	}
};

export function confirmAsk(message: string, opts?: { confirmLabel?: string; cancelLabel?: string; danger?: boolean }): Promise<boolean> {
	current?.resolve(false); // a newer ask supersedes this one: treat the abandoned one as cancelled
	return new Promise<boolean>((resolve) => {
		current = {
			message,
			confirmLabel: opts?.confirmLabel ?? 'OK',
			cancelLabel: opts?.cancelLabel ?? null,
			danger: opts?.danger ?? false,
			resolve
		};
	});
}

/** Escape / backdrop click: a passive dismissal, treated as cancel. */
export function dismissConfirm(): void {
	const c = current;
	current = null;
	c?.resolve(false);
}

export function answerConfirm(ok: boolean): void {
	const c = current;
	current = null;
	c?.resolve(ok);
}
