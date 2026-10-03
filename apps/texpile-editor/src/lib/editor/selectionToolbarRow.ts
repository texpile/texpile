// The buttons over a selection, the same in both editors: Comment, Refine when an agent is set up, and the control that
// turns the row off. Each editor places the row itself (cmSelectionToolbar, pmSelectionToolbar)
import { updateSettings } from '$lib/settings';
import { m } from '$lib/paraglide/messages';
import { tip } from '$lib/components/tooltip.svelte';
import { agentName, refiner } from '$lib/ai/selectionRefiner';
import { refineAgentsOffered } from '$lib/ai/refineAgents.svelte';
import { openRefineCard } from '$lib/ai/refineCardState.svelte';

function svgIcon(body: string) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
const COMMENT_ICON = svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>');
const REFINE_ICON = svgIcon(
	'<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>'
);
const X_ICON = svgIcon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>');

export type SelectionToolbarRow = {
	dom: HTMLDivElement;
	/** shows Refine when an agent is set up here; called whenever the row is placed */
	sync(): void;
};

export function selectionToolbarRow(commentLabel: string, comment: () => void, hide: () => void): SelectionToolbarRow {
	const dom = document.createElement('div');
	dom.className = 'cm-comment-add-row';
	dom.style.display = 'none';
	const hints = new Map<HTMLButtonElement, ReturnType<typeof tip>>();
	// the app's own hint card, never the browser's: `title` draws an OS box wherever it likes, over the words the
	// reader just selected. Above the row, which sits over those words itself
	function button(title: string, svg: string, extra: string, onDown: (b: HTMLButtonElement) => void): HTMLButtonElement {
		const b = dom.appendChild(document.createElement('button'));
		b.className = `cm-comment-add${extra}`;
		b.setAttribute('aria-label', title);
		hints.set(b, tip(b, title, { above: true }));
		b.innerHTML = svg;
		// mousedown, not click: by the time click fires the editor has collapsed the selection under the pointer
		b.onmousedown = (e) => {
			e.preventDefault();
			onDown(b);
		};
		return b;
	}
	button(commentLabel, COMMENT_ICON, '', comment);
	const refine = button('', REFINE_ICON, '', (b) => openRefineCard(b.getBoundingClientRect()));
	button(m.comments_pill_off(), X_ICON, ' cm-comment-add-off', () => {
		updateSettings({ commentPill: false });
		hide(); // the setting keeps it off; this is only so it leaves under the pointer
	});
	return {
		dom,
		sync() {
			const r = refiner.current;
			refine.hidden = !r?.available;
			refine.disabled = !!r?.busy;
			// named for its agent where there is one; with several, the card asks which
			const offered = refineAgentsOffered();
			const title = offered.length === 1 ? m.ai_refine_menu({ agent: agentName(offered[0]) }) : m.ai_refine();
			refine.setAttribute('aria-label', title);
			hints.get(refine)?.update(title);
		}
	};
}
