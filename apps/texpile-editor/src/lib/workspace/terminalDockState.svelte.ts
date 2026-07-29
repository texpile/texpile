// Visibility, height and shrink state for the bottom terminal dock, plus its drag/keyboard
// resizing. The dock stays MOUNTED once opened so shells persist across toggles; only its
// visibility flips. A guest has no shells of its own, so its toggles are never persisted.
import { browser } from '$lib/runtime';
import { updateSettings } from '$lib/settings';
import { startDrag, nudgeOnKey, clampTo } from '$lib/workspace/paneResize';

const SHRINK_KEY = 'texpile:terminalShrink';
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 700;
const clampHeight = clampTo(MIN_HEIGHT, MAX_HEIGHT);

/** the imperative handle TerminalDock exposes */
export interface DockHandle {
	runCommand(cmd: string, onDone?: (o: string) => void): void;
	refit(): void;
	focusActive(): void;
	reset(): void;
	addTerminal(): void;
	interrupt(): void;
}

export class TerminalDockState {
	/** client-only; set at mount so SSR and the first client render agree */
	available = $state(false);
	visible = $state(false);
	height = $state(240);
	/** dock only under the editor; the preview pane keeps full height */
	shrink = $state(false);
	/** stay mounted after the first open so shells persist across toggles */
	mounted = $state(false);
	dock = $state<DockHandle | undefined>();

	constructor(private isGuest: () => boolean) {}

	/** restore persisted height/visibility/shrink; call once at mount */
	restore(settings: { terminalHeight?: number; terminalVisible?: boolean }) {
		if (settings.terminalHeight !== undefined && settings.terminalHeight >= MIN_HEIGHT && settings.terminalHeight <= MAX_HEIGHT)
			this.height = settings.terminalHeight;
		if (this.available && settings.terminalVisible) {
			this.mounted = true; // the dock creates its first shell on mount
			this.visible = true;
		}
		if (browser && localStorage.getItem(SHRINK_KEY) === '1') this.shrink = true;
	}

	show() {
		this.mounted = true;
		this.visible = true;
		if (!this.isGuest()) updateSettings({ terminalVisible: true });
		setTimeout(() => this.dock?.refit(), 0);
	}

	toggle() {
		if (this.visible) {
			this.visible = false;
			if (!this.isGuest()) updateSettings({ terminalVisible: false });
		} else {
			this.show();
			setTimeout(() => this.dock?.focusActive(), 40);
		}
	}

	toggleShrink() {
		this.shrink = !this.shrink;
		if (browser) localStorage.setItem(SHRINK_KEY, this.shrink ? '1' : '0');
	}

	/** on folder change, replace the shells so they respawn in the new cwd */
	resetForWorkspace() {
		this.dock?.reset();
	}

	/** menu "New Terminal": open the dock (its first shell is auto-created) or add another */
	newTerminal() {
		const wasMounted = this.mounted;
		this.mounted = true;
		this.visible = true;
		updateSettings({ terminalVisible: true });
		setTimeout(() => (wasMounted ? this.dock?.addTerminal() : this.dock?.focusActive()), 0);
	}

	// the xterm canvas has to re-measure on every step, not just at the end of the gesture
	private setHeight = (h: number) => {
		this.height = clampHeight(h);
		this.dock?.refit();
	};
	private commit = () => updateSettings({ terminalHeight: this.height });

	startResize = (e: MouseEvent) => {
		const startY = e.clientY;
		const startH = this.height;
		// drag up = taller
		startDrag(e, { compute: (ev) => startH + (startY - ev.clientY), apply: this.setHeight, commit: this.commit });
	};

	resizeByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, { keys: ['ArrowDown', 'ArrowUp'], step: 16, current: () => this.height, apply: this.setHeight, commit: this.commit });
}
