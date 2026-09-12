// Visibility, height and shrink state for the bottom terminal dock, plus its drag/keyboard
// resizing. The dock stays MOUNTED once opened so shells persist across toggles; only its
// visibility flips. A guest has no shells of its own, so its toggles are never persisted.
import { browser } from '$lib/runtime';
import { layout, updateLayout } from '$lib/storage/layout';
import { startDrag, nudgeOnKey, clampTo, SNAP_SLACK } from '$lib/workspace/paneResize';

const MIN_HEIGHT = 120;
const EDITOR_KEEP = 300;
function maxHeight(): number {
	return browser && typeof window !== 'undefined' ? Math.max(MIN_HEIGHT, window.innerHeight - EDITOR_KEEP) : 700;
}
const clampHeight = (h: number) => clampTo(MIN_HEIGHT, maxHeight())(h);

/** the imperative handle TerminalDock exposes */
export type DockHandle = {
	runCommand(cmd: string, onDone?: (o: string) => void): void;
	refit(): void;
	focusActive(): void;
	reset(): void;
	addTerminal(): void;
	/** create the first shell if there is none; only for opens the USER asked for */
	ensureTerminal(): void;
	interrupt(): void;
};

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

	/** restore persisted height/visibility/shrink (texpile:layout); call once at mount */
	restore() {
		const s = layout.current;
		if (s.terminalHeight >= MIN_HEIGHT) this.height = clampHeight(s.terminalHeight);
		if (this.available && s.terminalVisible) {
			this.mounted = true;
			this.visible = true;
			// No shell here. terminalVisible is set by anything that REVEALS the dock - a compile
			// showing its output, a jump to Problems - so spawning one on restore handed every
			// reopened workspace a Terminal 1 the user never asked for, sitting next to the Compile
			// shell that does the actual work. The empty pane offers one instead.
		}
		if (browser && s.terminalShrink) this.shrink = true;
	}

	/** reveal the dock WITHOUT creating a shell: a compile opens it for its output, and jumping to
	 *  Problems opens it for the problem list. Neither is a request for a terminal. */
	show() {
		this.mounted = true;
		this.visible = true;
		if (!this.isGuest()) updateLayout({ terminalVisible: true });
		setTimeout(() => this.dock?.refit(), 0);
	}

	/** put the dock away, keeping its shells: mounted stays true so they survive the next open */
	hide() {
		this.visible = false;
		if (!this.isGuest()) updateLayout({ terminalVisible: false });
	}

	/** the Terminal toggle: this one IS a request for a terminal, so it makes sure one exists */
	toggle() {
		if (this.visible) {
			this.hide();
		} else {
			this.show();
			setTimeout(() => {
				this.dock?.ensureTerminal();
				this.dock?.focusActive();
			}, 40);
		}
	}

	toggleShrink() {
		this.shrink = !this.shrink;
		if (browser) updateLayout({ terminalShrink: this.shrink });
	}

	/** on folder change, replace the shells so they respawn in the new cwd */
	resetForWorkspace() {
		this.dock?.reset();
	}

	/** menu "New Terminal": always ends with a shell the user can type in. Already mounted means add
	 *  another; a first open means create the one it has been holding off on. */
	newTerminal() {
		const wasMounted = this.mounted;
		this.mounted = true;
		this.visible = true;
		updateLayout({ terminalVisible: true });
		setTimeout(() => {
			if (wasMounted) this.dock?.addTerminal();
			else this.dock?.ensureTerminal();
			this.dock?.focusActive();
		}, 0);
	}

	/**
	 * Raw, unclamped, like the side panes: the clamp is what would hide the drag having gone past
	 * the minimum, and past the minimum is the request to close.
	 *
	 * Reopening goes through show(), not toggle(): dragging the rail out is a request for the DOCK,
	 * not for a shell, the same as a compile revealing its output. The empty pane offers one.
	 *
	 * The height is left alone on the way out, so reopening restores the size you had.
	 */
	// the xterm canvas has to re-measure on every step, not just at the end of the gesture
	private setHeight = (h: number) => {
		if (h < MIN_HEIGHT - SNAP_SLACK) {
			if (this.visible) this.hide();
			return;
		}
		if (!this.visible) this.show();
		this.height = clampHeight(h);
		this.dock?.refit();
	};
	private commit = () => updateLayout({ terminalHeight: this.height });

	reclamp = () => {
		const h = clampHeight(this.height);
		if (h === this.height) return;
		this.height = h;
		this.dock?.refit();
	};

	startResize = (e: MouseEvent) => {
		const startY = e.clientY;
		// hidden, the drag measures up from the rail at the window's foot, so pulling it into the
		// window reopens the dock; starting from the remembered height would snap it open at once
		const startH = this.visible ? this.height : 0;
		// drag up = taller
		startDrag(e, { compute: (ev) => startH + (startY - ev.clientY), apply: this.setHeight, commit: this.commit });
	};

	resizeByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, {
			keys: ['ArrowDown', 'ArrowUp'],
			step: 16,
			// hidden, the rail sits one step below the snap point, so one press upward opens it
			current: () => (this.visible ? this.height : MIN_HEIGHT - SNAP_SLACK),
			apply: this.setHeight,
			commit: this.commit
		});
}
