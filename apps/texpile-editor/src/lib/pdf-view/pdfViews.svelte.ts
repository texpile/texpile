// The views of one document: each renderer is one, with its own page, zoom and find, and its own toolbar
// (PdfViewScope). The one the pointer was last over is the one a jump or a shortcut goes to
import { PresentationModeState, type PdfView, type PdfViewHandle, type PdfViewerActions, type PdfViewerState } from './pdf-viewer/context';

function freshViewState(scale: number, canSavePdf: boolean): PdfViewerState {
	const fresh = $state<PdfViewerState>({
		loading: true,
		error: null,
		totalPages: 0,
		currentPage: 1,
		scale,
		rotation: 0,
		searchQuery: '',
		searchCurrent: 0,
		searchTotal: 0,
		isSearching: false,
		presentationMode: PresentationModeState.NORMAL,
		canSavePdf
	});
	return fresh;
}

export class PdfViews {
	list = $state.raw<PdfView[]>([]);
	active = $state.raw<PdfView | null>(null);
	/** the state while no renderer has mounted yet */
	private readonly idle: PdfViewerState;

	constructor(
		private readonly initialScale: number,
		private readonly canSavePdf: boolean
	) {
		this.idle = freshViewState(initialScale, canSavePdf);
	}

	/** the active view's state */
	get state(): PdfViewerState {
		return this.active?.state ?? this.idle;
	}

	/** a new view opens at the zoom of the one in use */
	attach(): PdfViewHandle {
		const view: PdfView = { state: freshViewState(this.active?.state.scale ?? this.initialScale, this.canSavePdf), actions: null };
		this.list = [...this.list, view];
		if (!this.active) this.active = view;
		return {
			state: view.state,
			register: (a) => (view.actions = a),
			activate: () => (this.active = view),
			detach: () => {
				this.list = this.list.filter((v) => v !== view);
				if (this.active === view) this.active = this.list[0] ?? null;
			}
		};
	}

	/** the view a jump lands in becomes the one in use, so the toolbar follows it */
	jumpIn(place?: number): PdfViewerActions | null {
		const view = place === undefined ? null : this.list[place];
		if (view) this.active = view;
		return this.actions();
	}

	/** the active view's renderer, looked up per call: a view registers it once it has mounted */
	actions(): PdfViewerActions | null {
		return this.active?.actions ?? null;
	}
}
