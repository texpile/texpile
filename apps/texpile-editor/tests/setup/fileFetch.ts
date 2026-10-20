// the bundled package files are fetched beside their module, a file: URL here, which Node's fetch does not read
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const webFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
	const url = input instanceof URL ? input.href : typeof input === 'string' ? input : input.url;
	if (!url.startsWith('file:')) return webFetch(input, init);
	try {
		return new Response(await readFile(fileURLToPath(url)), { headers: { 'Content-Type': 'application/json' } });
	} catch {
		return new Response('Not found', { status: 404 });
	}
};
