// Exports the compile's resolved references FOR THE WARM DAEMON -- nothing else.
// \bibcite/\newlabel lines from the aux become _draft/live-refs.tex, and the .bbl is
// copied under the daemon's jobname, so instant patches resolve \ref/\cite.
import * as path from 'node:path';
import * as fs from 'node:fs';

export function exportDaemonRefs(outAbs: string): void {
	try {
		const aux = path.join(outAbs, 'draft.aux');
		if (fs.existsSync(aux)) {
			const refs = fs
				.readFileSync(aux, 'utf8')
				.split('\n')
				.filter((l) => /^\\(bibcite|newlabel)\b/.test(l));
			fs.writeFileSync(path.join(outAbs, 'live-refs.tex'), refs.join('\n') + '\n');
		}
		const bbl = path.join(outAbs, 'draft.bbl');
		if (fs.existsSync(bbl)) fs.copyFileSync(bbl, path.join(outAbs, 'texd_daemon.bbl'));
	} catch {
		/* refs are an enhancement, never fail the compile */
	}
}
