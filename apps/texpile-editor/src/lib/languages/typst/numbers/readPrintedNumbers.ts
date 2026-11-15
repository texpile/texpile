// asks the folder's tinymist for the numbers the document prints
import { acquireTypstLsp, fileUri, releaseTypstLsp, typstClient } from '../intellisense/lspClient';
import { TypstWorkspace } from '../intellisense/typstWorkspace';
import { joinPath, relativeInside } from '$lib/workspace/fileSystem';
import type { TypstPrintedNumber } from '$lib/stores/typstPrintedNumbers';
import { NUMBERS_PROBE_FILE, NUMBERS_PROBE_LABEL, numbersProbeText } from './numbersProbe';
import { probedNumbers } from './probedNumbers';

/** null without tinymist, for a main file outside the folder, or when the document does not compile */
export async function readTypstPrintedNumbers(root: string, main: string): Promise<TypstPrintedNumber[] | null> {
	const mainInFolder = relativeInside(root, main);
	if (!mainInFolder) return null;
	acquireTypstLsp();
	try {
		const client = await typstClient(root);
		if (!client) return null;
		await client.initializing;
		const workspace = client.workspace;
		if (!(workspace instanceof TypstWorkspace)) return null;
		const probePath = joinPath(root, NUMBERS_PROBE_FILE);
		const uri = fileUri(probePath);
		// the open editors' newest text first: the probe's project reads what the server holds when it is built
		client.sync();
		try {
			return await probedNumbers(
				{
					show: (text) => {
						if (workspace.getFile(uri)) workspace.updateText(uri, text);
						else workspace.openText(uri, 'typst', text);
						client.sync();
					},
					query: () =>
						client.request<{ command: string; arguments: unknown[] }, unknown>('workspace/executeCommand', {
							command: 'tinymist.exportQuery',
							arguments: [probePath, { format: 'json', selector: `<${NUMBERS_PROBE_LABEL}>`, field: 'value', one: true }, { write: false }]
						})
				},
				numbersProbeText(mainInFolder)
			);
		} finally {
			// left open, the probe's own names show up in the server's symbol search
			workspace.closeText(uri);
		}
	} catch {
		return null;
	} finally {
		releaseTypstLsp();
	}
}
