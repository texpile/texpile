// Attaches tinymist intellisense to a mounted source editor: host editors talk to the local
// server, guests relay through the session. Never awaited at mount - a missing or slow
// tinymist must not delay the editor appearing.
import type { EditorView } from '@codemirror/view';
import type { Compartment } from '@codemirror/state';
import { releaseTypstLsp, typstLspExtension } from '$lib/languages/typst/intellisense/lspClient';
import { typstGuestLspExtension, releaseGuestTypstLsp } from '$lib/languages/typst/intellisense/guest/guestLspExtension';
import { collabGuest } from '$lib/collab/guestStore.svelte';
import { guestSession } from '$lib/collab/guestSession';
import { guestRelPath } from '$lib/collab/sessionProvider';
import { workspaceRoot } from '$lib/workspace/workspaceStore';

export class TypstLspBinding {
	// attached to THIS editor, which makes it the owner of the lint state (see the diagnostics effect)
	private active = false;
	// same meaning for squiggle ownership; tracked apart only because the two release differently
	private guestActive = false;
	// acts on a gen INCREASE only; the first run just records where the counter stands
	private seenGen: number | null = null;

	constructor(
		private getView: () => EditorView | null,
		private lspConf: Compartment
	) {}

	/** while a server owns the squiggles, the compile log must not overwrite them */
	get ownsDiagnostics(): boolean {
		return this.active || this.guestActive;
	}

	arm(fileFor: string): void {
		if (!fileFor || !/\.typ$/i.test(fileFor)) return;
		// A guest has no toolchain and no project on disk; the host answers instead, over the
		// session. Its paths are already manifest-relative, which is what the host maps back.
		if (guestSession.active) {
			if (this.guestActive) return;
			// strip the synthetic 'session' root; the host joins what we send onto its REAL one
			const rel = guestRelPath(fileFor);
			if (!rel) return;
			// claimed before the await, so a second effect run cannot attach a duplicate. released
			// again on any path that does not end up attached
			this.guestActive = true;
			void typstGuestLspExtension(collabGuest.lspPort(), rel).then((ext) => {
				if (!ext) {
					this.guestActive = false;
					return;
				}
				const view = this.getView();
				if (!view) {
					this.guestActive = false;
					releaseGuestTypstLsp();
					return;
				}
				view.dispatch({ effects: this.lspConf.reconfigure(ext) });
			});
			return;
		}
		void typstLspExtension(workspaceRoot.current, fileFor)
			.then((ext) => {
				if (!ext) return;
				const view = this.getView();
				if (!view) {
					// resolved after this editor was destroyed: hand the reference straight back,
					// or the server would count a holder no unmount can ever release
					releaseTypstLsp();
					return;
				}
				this.active = true;
				view.dispatch({ effects: this.lspConf.reconfigure(ext) });
			})
			.catch(() => {
				/* no intellisense; highlighting and compiling are unaffected */
			});
	}

	/** the server died and restarted, so the mounted extension is bound to a dead client */
	onServerGen(gen: number, fileFor: string): void {
		if (this.seenGen === null || gen === this.seenGen) {
			this.seenGen = gen;
			return;
		}
		this.seenGen = gen;
		const view = this.getView();
		if (!view || !fileFor || !/\.typ$/i.test(fileFor)) return;
		this.active = false; // its holder died with the server; arm takes a fresh one
		view.dispatch({ effects: this.lspConf.reconfigure([]) });
		this.arm(fileFor);
	}

	/** the language server holds ~90MB with a project open; hand back our reference so it can be
	 *  reclaimed once no editor is left (it lingers briefly, so a file switch never restarts it) */
	release(): void {
		if (this.active) {
			this.active = false;
			releaseTypstLsp();
		}
		if (this.guestActive) {
			this.guestActive = false;
			releaseGuestTypstLsp();
		}
	}
}
