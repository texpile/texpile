// The caret in the Agent tab's message box, for whatever opens the tab. The box can come seconds later, once the agent
// has started, so the ask ends at the reader's next key or click
let asked = $state(false);

function forget(): void {
	asked = false;
	removeEventListener('keydown', forget, true);
	removeEventListener('pointerdown', forget, true);
}

export function askForAgentBoxCaret(): void {
	asked = true;
	addEventListener('keydown', forget, true);
	addEventListener('pointerdown', forget, true);
}

/** on the message box */
export function takeAskedCaret(box: HTMLElement): void {
	if (!asked) return;
	forget();
	box.focus();
}
