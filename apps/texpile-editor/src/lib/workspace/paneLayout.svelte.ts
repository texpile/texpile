// Geometry of the three resizable regions: the left sidebar, the TOC split inside it, and the
// PDF preview pane on the right. All three share the same shape (clamp, apply, persist once the
// gesture ends) and differ only in bounds and where the value is stored.
//
// The PDF pane is persisted as a FRACTION of window width rather than a pixel count, so the pane
// stays proportional across window sizes, and it is re-clamped on every window resize: a width
// saved on a wide screen must not squeeze the editor out in a small window.
import { browser } from '$lib/runtime';
import { layout as layoutStore, updateLayout } from '$lib/storage/layout';
import { startDrag, nudgeOnKey, clampTo, SNAP_SLACK } from '$lib/workspace/paneResize';
// the launch skeleton lays the same panes out from these, so they live where both can reach them
import { SIDEBAR_MIN, SIDEBAR_MAX, PDF_MIN, pdfMaxWidth, pdfWidthOf } from '$lib/workspace/paneGeometry';

const TOC_MIN = 0.1;
const TOC_MAX = 0.9;
// the same kind of split one level in: what has changed, against the versions behind it. Bounded
// tighter than the TOC's, because either half stops being worth showing below a couple of rows.
const HISTORY_MIN = 0.15;
const HISTORY_MAX = 0.85;

const clampSidebar = clampTo(SIDEBAR_MIN, SIDEBAR_MAX);
const clampToc = clampTo(TOC_MIN, TOC_MAX);
const clampHistory = clampTo(HISTORY_MIN, HISTORY_MAX);

export class PaneLayout {
	sidebarWidth = $state(256);
	sidebarOpen = $state(true);
	/** one sidebar view at a time (VS Code activity-bar style) */
	sidebarView = $state<'explorer' | 'search' | 'scm'>('explorer');
	/** TOC share of the sidebar's lower region (0..1) */
	tocFraction = $state(0.5);
	splitEl = $state<HTMLDivElement>();
	/** the timeline's share of the source control panel (0..1) */
	historyFraction = $state(0.5);
	scmSplitEl = $state<HTMLDivElement>();

	pdfPaneOpen = $state(false);
	pdfPaneWidth = $state(480);
	/**
	 * The preview lives in its own OS window (PreviewPopout) instead of the docked pane. Implies
	 * pdfPaneOpen - everything demand-driven (the Typst task, caret follow) keys on the pane being
	 * open, and a popped-out preview is an open pane that happens to be elsewhere. Deliberately not
	 * persisted: a restored session must not open a second window before the user asked for one.
	 */
	pdfPopout = $state(false);
	/** a splitter is being dragged right now; panes that reflow expensively can freeze while it is true */
	paneDragging = $state(false);

	/** restore persisted geometry (texpile:layout); call once at mount */
	restore() {
		const s = layoutStore.current;
		if (s.sidebarWidth >= SIDEBAR_MIN && s.sidebarWidth <= SIDEBAR_MAX) this.sidebarWidth = s.sidebarWidth;
		this.sidebarOpen = s.sidebarOpen;
		if (s.tocFraction >= TOC_MIN && s.tocFraction <= TOC_MAX) this.tocFraction = s.tocFraction;
		if (s.historyFraction >= HISTORY_MIN && s.historyFraction <= HISTORY_MAX) this.historyFraction = s.historyFraction;
		if (browser && typeof window !== 'undefined') this.pdfPaneWidth = pdfWidthOf(s, window.innerWidth);
		this.pdfPaneOpen = s.pdfPaneOpen;
	}

	// sidebar

	setSidebarOpen = (open: boolean) => {
		this.sidebarOpen = open;
		updateLayout({ sidebarOpen: open });
	};

	toggleSidebar = () => this.setSidebarOpen(!this.sidebarOpen);

	/**
	 * Takes the RAW width the pointer is asking for, not a clamped one: the clamp is what would
	 * hide the pane having been dragged past its minimum, which is the whole signal here.
	 *
	 * The stored width is left alone while shut, so reopening restores the size you last chose
	 * rather than the minimum you happened to drag through.
	 */
	private setSidebar = (w: number) => {
		if (w < SIDEBAR_MIN - SNAP_SLACK) {
			if (this.sidebarOpen) this.setSidebarOpen(false);
			return;
		}
		if (!this.sidebarOpen) this.setSidebarOpen(true);
		this.sidebarWidth = clampSidebar(w);
	};
	private commitSidebar = () => updateLayout({ sidebarWidth: this.sidebarWidth });

	startSidebarResize = (e: MouseEvent) => {
		const startX = e.clientX;
		// from shut, the drag measures out from the edge, so pulling the handle back into the window
		// is what reopens it - starting from the remembered width would snap it open on the first px
		const startW = this.sidebarOpen ? this.sidebarWidth : 0;
		startDrag(e, { compute: (ev) => startW + ev.clientX - startX, apply: this.setSidebar, commit: this.commitSidebar });
	};

	resizeSidebarByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, {
			keys: ['ArrowLeft', 'ArrowRight'],
			step: 16,
			// shut, the handle sits one step below the snap point, so one press outward opens it
			current: () => (this.sidebarOpen ? this.sidebarWidth : SIDEBAR_MIN - SNAP_SLACK),
			apply: this.setSidebar,
			commit: this.commitSidebar
		});

	// TOC split

	private setToc = (f: number) => (this.tocFraction = clampToc(f));
	private commitToc = () => updateLayout({ tocFraction: this.tocFraction });

	startTocResize = (e: MouseEvent) => {
		const rect = this.splitEl?.getBoundingClientRect();
		// drag up = taller TOC; measured against the split container, so it is a fraction not a delta
		startDrag(e, { compute: (ev) => (rect ? (rect.bottom - ev.clientY) / rect.height : null), apply: this.setToc, commit: this.commitToc });
	};

	resizeTocByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, {
			keys: ['ArrowDown', 'ArrowUp'],
			step: 0.02,
			current: () => this.tocFraction,
			apply: this.setToc,
			commit: this.commitToc
		});

	// source control split: changes above, versions below

	private setHistory = (f: number) => (this.historyFraction = clampHistory(f));
	private commitHistory = () => updateLayout({ historyFraction: this.historyFraction });

	startHistoryResize = (e: MouseEvent) => {
		const rect = this.scmSplitEl?.getBoundingClientRect();
		// drag up = more timeline; measured against the split container, so it is a fraction not a delta
		startDrag(e, {
			compute: (ev) => (rect ? (rect.bottom - ev.clientY) / rect.height : null),
			apply: this.setHistory,
			commit: this.commitHistory
		});
	};

	resizeHistoryByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, {
			keys: ['ArrowDown', 'ArrowUp'],
			step: 0.02,
			current: () => this.historyFraction,
			apply: this.setHistory,
			commit: this.commitHistory
		});

	// PDF preview pane

	private pdfMaxWidth(): number {
		const win = typeof window !== 'undefined' ? window.innerWidth : 1280;
		return pdfMaxWidth(this.sidebarOpen ? this.sidebarWidth : 0, win);
	}

	clampPdf = (w: number) => Math.min(this.pdfMaxWidth(), Math.max(PDF_MIN, w));

	setPdfPaneOpen = (open: boolean) => {
		this.pdfPaneOpen = open;
		// closing the pane closes the preview WHEREVER it is: any closer (the Live button, the
		// divider) that runs while the preview is popped out must not leave the flag armed, or the
		// next open would fling the pane straight back into a window nobody asked for
		if (!open) this.pdfPopout = false;
		updateLayout({ pdfPaneOpen: open });
	};

	togglePdfPane = () => this.setPdfPaneOpen(!this.pdfPaneOpen);

	setPdfPopout = (out: boolean) => {
		this.pdfPopout = out;
		if (out && !this.pdfPaneOpen) this.setPdfPaneOpen(true);
	};

	/** raw, unclamped - see setSidebar; the two panes snap on the same rule */
	private setPdfWidth = (w: number) => {
		if (w < PDF_MIN - SNAP_SLACK) {
			if (this.pdfPaneOpen) this.setPdfPaneOpen(false);
			return;
		}
		if (!this.pdfPaneOpen) this.setPdfPaneOpen(true);
		this.pdfPaneWidth = this.clampPdf(w);
	};
	private savePdfFraction = () => {
		if (browser && typeof window !== 'undefined') updateLayout({ pdfPaneFraction: this.pdfPaneWidth / window.innerWidth });
	};

	/** re-clamp when the window shrinks so the preview can't squeeze the editor out */
	reclampPdf = () => {
		this.pdfPaneWidth = this.clampPdf(this.pdfPaneWidth);
	};

	startPdfResize = (e: MouseEvent) => {
		const startX = e.clientX;
		// shut, measure out from the window edge so dragging the rail inwards is what reopens it
		const startW = this.pdfPaneOpen ? this.pdfPaneWidth : 0;
		// drag left = wider
		startDrag(e, {
			compute: (ev) => startW - (ev.clientX - startX),
			apply: this.setPdfWidth,
			commit: this.savePdfFraction,
			onState: (d) => (this.paneDragging = d)
		});
	};

	// left = wider, so ArrowRight is the one that shrinks
	resizePdfByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, {
			keys: ['ArrowRight', 'ArrowLeft'],
			step: 16,
			current: () => (this.pdfPaneOpen ? this.pdfPaneWidth : PDF_MIN - SNAP_SLACK),
			apply: this.setPdfWidth,
			commit: this.savePdfFraction
		});
}
