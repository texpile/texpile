// Geometry of the three resizable regions: the left sidebar, the TOC split inside it, and the
// PDF preview pane on the right. All three share the same shape (clamp, apply, persist once the
// gesture ends) and differ only in bounds and where the value is stored.
//
// The PDF pane is persisted as a FRACTION of window width rather than a pixel count, so the pane
// stays proportional across window sizes, and it is re-clamped on every window resize: a width
// saved on a wide screen must not squeeze the editor out in a small window.
import { browser } from '$lib/runtime';
import { updateSettings } from '$lib/settings';
import { startDrag, nudgeOnKey, clampTo } from '$lib/workspace/paneResize';

const PDF_FRACTION_KEY = 'texpile:pdfPaneFraction';
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 600;
const TOC_MIN = 0.1;
const TOC_MAX = 0.9;
const PDF_MIN = 280;
/** keep this much room for the editor no matter how wide the preview was saved */
const EDITOR_RESERVE = 360;

const clampSidebar = clampTo(SIDEBAR_MIN, SIDEBAR_MAX);
const clampToc = clampTo(TOC_MIN, TOC_MAX);

export class PaneLayout {
	sidebarWidth = $state(256);
	sidebarOpen = $state(true);
	/** one sidebar view at a time (VS Code activity-bar style) */
	sidebarView = $state<'explorer' | 'search' | 'scm'>('explorer');
	/** TOC share of the sidebar's lower region (0..1) */
	tocFraction = $state(0.5);
	splitEl = $state<HTMLDivElement>();

	pdfPaneOpen = $state(false);
	pdfPaneWidth = $state(480);

	/** restore persisted geometry; call once at mount, after settings load */
	restore(s: { sidebarWidth?: number; sidebarOpen?: boolean; tocFraction?: number; pdfPaneOpen?: boolean }) {
		if (s.sidebarWidth !== undefined && s.sidebarWidth >= SIDEBAR_MIN && s.sidebarWidth <= SIDEBAR_MAX) this.sidebarWidth = s.sidebarWidth;
		if (s.sidebarOpen !== undefined) this.sidebarOpen = s.sidebarOpen;
		if (s.tocFraction !== undefined && s.tocFraction >= TOC_MIN && s.tocFraction <= TOC_MAX) this.tocFraction = s.tocFraction;
		if (browser && typeof window !== 'undefined') {
			const frac = parseFloat(localStorage.getItem(PDF_FRACTION_KEY) ?? '');
			this.pdfPaneWidth = this.clampPdf((frac > 0 && frac < 1 ? frac : 0.4) * window.innerWidth);
		}
		if (s.pdfPaneOpen !== undefined) this.pdfPaneOpen = s.pdfPaneOpen;
	}

	// --- sidebar ---

	toggleSidebar = () => {
		this.sidebarOpen = !this.sidebarOpen;
		updateSettings({ sidebarOpen: this.sidebarOpen });
	};

	private setSidebar = (w: number) => (this.sidebarWidth = clampSidebar(w));
	private commitSidebar = () => updateSettings({ sidebarWidth: this.sidebarWidth });

	startSidebarResize = (e: MouseEvent) => {
		const startX = e.clientX;
		const startW = this.sidebarWidth;
		startDrag(e, { compute: (ev) => startW + ev.clientX - startX, apply: this.setSidebar, commit: this.commitSidebar });
	};

	resizeSidebarByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, {
			keys: ['ArrowLeft', 'ArrowRight'],
			step: 16,
			current: () => this.sidebarWidth,
			apply: this.setSidebar,
			commit: this.commitSidebar
		});

	// --- TOC split ---

	private setToc = (f: number) => (this.tocFraction = clampToc(f));
	private commitToc = () => updateSettings({ tocFraction: this.tocFraction });

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

	// --- PDF preview pane ---

	/** cap: whatever is left after the sidebar, keeping room for the editor */
	private pdfMaxWidth(): number {
		const win = typeof window !== 'undefined' ? window.innerWidth : 1280;
		return Math.max(320, win - (this.sidebarOpen ? this.sidebarWidth : 0) - EDITOR_RESERVE);
	}

	clampPdf = (w: number) => Math.min(this.pdfMaxWidth(), Math.max(PDF_MIN, w));

	setPdfPaneOpen = (open: boolean) => {
		this.pdfPaneOpen = open;
		updateSettings({ pdfPaneOpen: open });
	};

	togglePdfPane = () => this.setPdfPaneOpen(!this.pdfPaneOpen);

	private setPdfWidth = (w: number) => (this.pdfPaneWidth = this.clampPdf(w));
	private savePdfFraction = () => {
		if (browser && typeof window !== 'undefined') localStorage.setItem(PDF_FRACTION_KEY, String(this.pdfPaneWidth / window.innerWidth));
	};

	/** re-clamp when the window shrinks so the preview can't squeeze the editor out */
	reclampPdf = () => {
		this.pdfPaneWidth = this.clampPdf(this.pdfPaneWidth);
	};

	startPdfResize = (e: MouseEvent) => {
		const startX = e.clientX;
		const startW = this.pdfPaneWidth;
		// drag left = wider
		startDrag(e, { compute: (ev) => startW - (ev.clientX - startX), apply: this.setPdfWidth, commit: this.savePdfFraction });
	};

	// left = wider, so ArrowRight is the one that shrinks
	resizePdfByKey = (e: KeyboardEvent) =>
		nudgeOnKey(e, {
			keys: ['ArrowRight', 'ArrowLeft'],
			step: 16,
			current: () => this.pdfPaneWidth,
			apply: this.setPdfWidth,
			commit: this.savePdfFraction
		});
}
