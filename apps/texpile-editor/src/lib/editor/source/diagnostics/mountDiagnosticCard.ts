import { mount, unmount } from 'svelte';
import DiagnosticCard from './DiagnosticCard.svelte';
import type { DiagnosticCardProps } from './diagnosticCardTypes';

/** the card as a node for a lint tooltip, which has no hook for its own removal */
export function mountDiagnosticCard(props: DiagnosticCardProps, body: HTMLElement): HTMLElement {
	const host = document.createElement('div');
	const card = mount(DiagnosticCard, { target: host, props });
	let attached = false;
	const watcher = new MutationObserver(() => {
		if (host.isConnected) attached = true;
		else if (attached) stop();
	});
	function stop() {
		watcher.disconnect();
		clearTimeout(giveUp);
		void unmount(card);
	}
	watcher.observe(body, { childList: true, subtree: true });
	const giveUp = setTimeout(() => host.isConnected || stop(), 2000);
	return host;
}
