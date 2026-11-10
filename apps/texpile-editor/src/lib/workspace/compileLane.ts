import { compileConfig } from './projectConfigSync.svelte';
import { resolveCompileCommand } from './compileResolve';
import { isTypstCommand } from './typstCommand';
import { mainFile } from './workspaceStore';

/** which build Compile runs: the live LaTeX engine, the Typst preview, or the project's command in a terminal */
export type CompileLane = 'live' | 'typst-preview' | 'terminal';

// the same order startCompile takes them in
export function compileLane(): CompileLane {
	const cmd = resolveCompileCommand(mainFile.current).trim();
	const typst = isTypstCommand(cmd);
	if (compileConfig.current.latex.liveMode && !typst) return 'live';
	if (compileConfig.current.typst.preview && typst) return 'typst-preview';
	return 'terminal';
}
