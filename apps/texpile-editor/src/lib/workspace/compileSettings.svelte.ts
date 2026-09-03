// The compile-command dialog's own state: the draft command, the per-folder output overrides, and
// persisting both. Which typesetter they belong to is not a choice here - the main file's extension
// decides it (see effectiveCompileFormat) - but latex and typst still keep separate slots, so a
// project holding both never loses one side's setup by changing its main file.
//
// Everything persists through projectConfigSync into .texpile/config.json - the compile surface
// has ONE home now. There is no global default command to update any more: the stock command is a
// constant, and a lane's slot is either the project's own command or that constant.
import { workspaceRoot, mainFile, effectiveCompileFormat } from '$lib/workspace/workspaceStore';
import { compileConfig, projectConfigSync } from '$lib/workspace/projectConfigSync.svelte';
import { resolveFormatCommand } from '$lib/workspace/compilePipeline.svelte';

export class CompileSettings {
	modalOpen = $state(false);
	draft = $state('');
	outputsDraft = $state<{ pdf: string; log: string }>({ pdf: '', log: '' });
	advancedOpen = $state(false);

	constructor(
		private getCommand: () => string,
		private setCommand: (c: string) => void,
		private runCompile: () => void
	) {}

	/** the typesetter this folder builds with, from its main file */
	lane(): 'latex' | 'typst' {
		return effectiveCompileFormat(mainFile.current);
	}

	/** what the command field shows: this lane's adopted command, else its default. */
	commandFor(): string {
		return resolveFormatCommand(this.lane(), mainFile.current);
	}

	open() {
		this.draft = this.commandFor();
		const ov = compileConfig.current[this.lane()].outputs;
		this.outputsDraft = { pdf: ov.pdf ?? '', log: ov.log ?? '' };
		this.advancedOpen = !!(ov.pdf || ov.log); // start expanded only if overrides exist
		this.modalOpen = true;
	}

	save(thenRun: boolean) {
		const root = workspaceRoot.current;
		const lane = this.lane();
		const command = this.draft.trim();
		// into the lane the main file selects, which is the only lane anything reads. Clearing the
		// box is how you go back to that lane's default. setCommand trusts what the user typed and
		// writes the file; setOutputs rides the same save.
		projectConfigSync.setCommand(root, lane, command || null);
		projectConfigSync.setOutputs(root, lane, { pdf: this.outputsDraft.pdf.trim(), log: this.outputsDraft.log.trim() });
		this.setCommand(command);
		this.modalOpen = false;
		if (thenRun && command) this.runCompile();
	}

	/**
	 * Apply a command and/or output overrides with no modal involved - the MCP path.
	 *
	 * Stored in the lane the MAIN FILE selects, not the lane the command's binary suggests: filing
	 * a command under the other lane would put it in the one slot nothing ever reads, so an MCP
	 * client would set a command and see no effect at all. A command that does not match the main
	 * file fails out loud upstream instead, which is findable.
	 */
	applyCommand(command?: string, outputs?: { pdf?: string; log?: string }) {
		const root = workspaceRoot.current;
		const lane = this.lane();
		if (command !== undefined) {
			const c = command.trim();
			projectConfigSync.setCommand(root, lane, c || null);
			this.setCommand(c || this.commandFor());
		}
		if (outputs) {
			// merge, so setting only the PDF does not silently clear a log override the user set
			const cur = compileConfig.current[lane].outputs;
			projectConfigSync.setOutputs(root, lane, { pdf: outputs.pdf ?? cur.pdf ?? '', log: outputs.log ?? cur.log ?? '' });
		}
		// keep an open dialog showing what was just applied under it
		if (this.modalOpen) this.open();
	}
}
