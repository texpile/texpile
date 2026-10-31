import { SNAP_SLACK, clampTo, nudgePaneOnKey, startPaneDrag } from '../ui/paneResize';

const CODE_MIN = 240;
const CODE_DEFAULT = 380;
/** of the window: the canvas keeps at least as much room as the code may take */
const CODE_MOST_SHARE = 0.6;
const SIDE_MIN = 220;
const SIDE_MAX = 480;
const SIDE_DEFAULT = 272;
const INSPECTOR_SHARE_MIN = 0.1;
const INSPECTOR_SHARE_MAX = 0.9;
const PROBLEMS_MIN = 64;
const PROBLEMS_DEFAULT = 160;
/** of the window, so the code above keeps room */
const PROBLEMS_MOST_SHARE = 0.6;
const WIDTH_STEP = 16;
const SHARE_STEP = 0.02;

const clampSide = clampTo(SIDE_MIN, SIDE_MAX);
const clampInspectorShare = clampTo(INSPECTOR_SHARE_MIN, INSPECTOR_SHARE_MAX);

function clampProblemsHeight(height: number) {
	return Math.round(Math.min(Math.max(PROBLEMS_MIN, window.innerHeight * PROBLEMS_MOST_SHARE), Math.max(PROBLEMS_MIN, height)));
}

function clampCodeWidth(width: number) {
	return Math.round(Math.min(Math.max(CODE_MIN, window.innerWidth * CODE_MOST_SHARE), Math.max(CODE_MIN, width)));
}

/** the code pane on the left and the column on the right, objects over the inspector, as Texpile's PaneLayout sizes its panes */
export class PaneLayout {
	codeOpen = $state(true);
	codeWidth = $state(CODE_DEFAULT);
	sideOpen = $state(true);
	sideWidth = $state(SIDE_DEFAULT);
	objectsOpen = $state(true);
	inspectorOpen = $state(true);
	/** the inspector's share of the column below its header, while the objects are shown above it */
	inspectorShare = $state(0.55);
	/** null until asked: the problems list then opens when there is something in it */
	problemsShut = $state<boolean | null>(null);
	problemsHeight = $state(PROBLEMS_DEFAULT);
	/** what the inspector's share is measured against */
	sideSplit = $state<HTMLElement>();

	/** the column shows when it is open and has something in it */
	get sideShown() {
		return this.sideOpen && (this.objectsOpen || this.inspectorOpen);
	}

	toggleCode = () => (this.codeOpen = !this.codeOpen);
	toggleSide = () => {
		this.sideOpen = !this.sideShown;
		if (this.sideOpen && !this.objectsOpen && !this.inspectorOpen) this.objectsOpen = this.inspectorOpen = true;
	};
	toggleObjects = () => this.togglePanel('objectsOpen');
	toggleInspector = () => this.togglePanel('inspectorOpen');

	// asked for while the column is shut, a panel opens it with that panel alone shown
	private togglePanel(panel: 'objectsOpen' | 'inspectorOpen') {
		if (this.sideShown) this[panel] = !this[panel];
		else {
			this.sideOpen = true;
			this.objectsOpen = panel === 'objectsOpen';
			this.inspectorOpen = panel === 'inspectorOpen';
		}
	}

	startCodeResize = (e: MouseEvent) => {
		const startX = e.clientX;
		const startWidth = this.codeWidth;
		startPaneDrag(e, { compute: (ev) => startWidth + ev.clientX - startX, apply: (w) => (this.codeWidth = clampCodeWidth(w)) });
	};

	resizeCodeByKey = (e: KeyboardEvent) =>
		nudgePaneOnKey(e, {
			keys: ['ArrowLeft', 'ArrowRight'],
			step: WIDTH_STEP,
			current: () => this.codeWidth,
			apply: (w) => (this.codeWidth = clampCodeWidth(w))
		});

	resetCodeWidth = () => (this.codeWidth = CODE_DEFAULT);

	private setSideWidth = (width: number) => {
		this.sideOpen = width >= SIDE_MIN - SNAP_SLACK;
		if (this.sideOpen) this.sideWidth = clampSide(width);
	};

	// the column grows to the left, so the pointer's travel counts the other way
	startSideResize = (e: MouseEvent) => {
		const startX = e.clientX;
		const startWidth = this.sideShown ? this.sideWidth : 0;
		startPaneDrag(e, { compute: (ev) => startWidth - (ev.clientX - startX), apply: this.setSideWidth });
	};

	resizeSideByKey = (e: KeyboardEvent) =>
		nudgePaneOnKey(e, {
			keys: ['ArrowRight', 'ArrowLeft'],
			step: WIDTH_STEP,
			current: () => (this.sideShown ? this.sideWidth : SIDE_MIN - SNAP_SLACK),
			apply: this.setSideWidth
		});

	startInspectorResize = (e: MouseEvent) => {
		const rect = this.sideSplit?.getBoundingClientRect();
		startPaneDrag(e, {
			compute: (ev) => (rect ? (rect.bottom - ev.clientY) / rect.height : null),
			apply: (share) => (this.inspectorShare = clampInspectorShare(share))
		});
	};

	resizeInspectorByKey = (e: KeyboardEvent) =>
		nudgePaneOnKey(e, {
			keys: ['ArrowDown', 'ArrowUp'],
			step: SHARE_STEP,
			current: () => this.inspectorShare,
			apply: (share) => (this.inspectorShare = clampInspectorShare(share))
		});

	private setProblemsHeight = (height: number) => {
		this.problemsShut = height < PROBLEMS_MIN - SNAP_SLACK / 2;
		if (!this.problemsShut) this.problemsHeight = clampProblemsHeight(height);
	};

	// the list grows upward, so the pointer's travel counts the other way
	startProblemsResize = (e: MouseEvent, open: boolean) => {
		const startY = e.clientY;
		const startHeight = open ? this.problemsHeight : 0;
		startPaneDrag(e, { compute: (ev) => startHeight - (ev.clientY - startY), apply: this.setProblemsHeight });
	};

	resizeProblemsByKey = (e: KeyboardEvent, open: boolean) =>
		nudgePaneOnKey(e, {
			keys: ['ArrowDown', 'ArrowUp'],
			step: WIDTH_STEP,
			current: () => (open ? this.problemsHeight : PROBLEMS_MIN - SNAP_SLACK / 2),
			apply: this.setProblemsHeight
		});

	resetProblemsHeight = () => this.setProblemsHeight(PROBLEMS_DEFAULT);
}
