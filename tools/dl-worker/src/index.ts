interface R2Range {
	offset?: number;
	length?: number;
	suffix?: number;
}
interface R2Object {
	size: number;
	httpEtag: string;
	range?: R2Range;
	body?: ReadableStream | null;
	writeHttpMetadata(headers: Headers): void;
}
interface R2Bucket {
	get(key: string, options?: { range?: Headers | R2Range; onlyIf?: Headers }): Promise<R2Object | null>;
	head(key: string): Promise<R2Object | null>;
}
interface AnalyticsEngineDataset {
	writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}
interface Env {
	RELEASES: R2Bucket;
	DOWNLOADS?: AnalyticsEngineDataset;
	ACCOUNT_ID?: string;
	ANALYTICS_TOKEN?: string;
}

// zip is the mac auto-update artifact (Squirrel.Mac); the others serve both web and updater
const INSTALLER = /\.(exe|dmg|appimage|deb|zip)$/i;

const PLATFORM_ALIAS: Record<string, string> = {
	windows: 'windows',
	win: 'windows',
	mac: 'mac',
	macos: 'mac',
	linux: 'linuxAppImage',
	appimage: 'linuxAppImage',
	deb: 'linuxDeb',
	portable: 'windowsPortable'
};

function platformOf(key: string): string {
	const ext = key.toLowerCase().split('.').pop();
	return ext === 'exe' ? 'windows' : ext === 'dmg' || ext === 'zip' ? 'mac' : ext === 'appimage' ? 'linux-appimage' : 'linux-deb';
}

// Version from the immutable path (v0.10.0/...) or the filename; root aliases fall back to 'root'.
function versionOf(key: string): string {
	const m = key.match(/^v(\d+\.\d+\.\d+[^/]*)\//) ?? key.match(/(\d+\.\d+\.\d+(?:-[\w.]+)?)/);
	return m ? m[1] : 'root';
}

// the download page's links are cross-origin (dl.texpile.com vs the site itself), where the
// HTML `download` attribute can't force a filename/silent save on its own - browsers fall back
// to Content-Disposition, and without it some show a Save As prompt instead of saving straight
// to Downloads. only the actual installers need this; latest.json/versions.json are fetch()ed, not downloaded.
function attachmentName(key: string): string {
	return key.split('/').pop() ?? key;
}

// Coarse agent family; the raw UA is kept (truncated) as its own dimension for later filtering.
function agentFamily(ua: string): string {
	if (/curl|wget|powershell|httpie/i.test(ua)) return 'cli';
	if (/bot|crawler|spider|preview|scan/i.test(ua)) return 'bot';
	return ua ? 'browser' : 'none';
}

// count a request once per download: plain requests, or the first chunk ("bytes=0-...") of a ranged one
function countable(request: Request): boolean {
	const range = request.headers.get('range');
	return range === null || /^bytes=0-/.test(range);
}

// /_stats: aggregate download counts from Analytics Engine. Needs the ACCOUNT_ID + ANALYTICS_TOKEN
// secrets (token scope: Account Analytics Read). Public by design, aggregate totals only.
const STATS_QUERIES: Record<string, string> = {
	platforms:
		'SELECT blob2 AS name, SUM(_sample_interval) AS downloads FROM texpile_downloads GROUP BY name ORDER BY downloads DESC FORMAT JSON',
	versions:
		'SELECT blob3 AS name, SUM(_sample_interval) AS downloads FROM texpile_downloads GROUP BY name ORDER BY downloads DESC LIMIT 12 FORMAT JSON',
	agents:
		'SELECT blob5 AS name, SUM(_sample_interval) AS downloads FROM texpile_downloads GROUP BY name ORDER BY downloads DESC FORMAT JSON',
	// rows written before the channel blob existed have blob7 = '' and show up as 'web' here
	channels:
		"SELECT if(blob7 = '', 'web', blob7) AS name, SUM(_sample_interval) AS downloads FROM texpile_downloads GROUP BY name ORDER BY downloads DESC FORMAT JSON",
	daily:
		"SELECT toStartOfInterval(timestamp, INTERVAL '1' DAY) AS name, SUM(_sample_interval) AS downloads FROM texpile_downloads WHERE timestamp > NOW() - INTERVAL '30' DAY GROUP BY name ORDER BY name FORMAT JSON"
};

interface StatRow {
	name: string;
	downloads: number;
}

async function sqlQuery(env: Env, sql: string): Promise<StatRow[]> {
	const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`, {
		method: 'POST',
		headers: { authorization: `Bearer ${env.ANALYTICS_TOKEN}` },
		body: sql
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`SQL API ${res.status}: ${text.slice(0, 200)}`);
	const parsed = JSON.parse(text) as { data?: { name: string; downloads: number | string }[] };
	return (parsed.data ?? []).map((r) => ({ name: String(r.name), downloads: Number(r.downloads) }));
}

function statsJson(payload: unknown, status = 200): Response {
	return new Response(JSON.stringify(payload, null, '\t') + '\n', {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			// only cache real data; a cached error would mask a fresh configuration
			'cache-control': status === 200 ? 'public, max-age=300' : 'no-store',
			'access-control-allow-origin': '*'
		}
	});
}

async function statsPage(env: Env): Promise<Response> {
	if (!env.ACCOUNT_ID || !env.ANALYTICS_TOKEN) {
		return statsJson(
			{
				error: 'stats not configured',
				hint: 'Set the ACCOUNT_ID and ANALYTICS_TOKEN Worker secrets (token needs Account Analytics: Read) with wrangler secret put. See tools/dl-worker/README.md.'
			},
			501
		);
	}
	try {
		const [platforms, versions, agents, channels, daily] = await Promise.all([
			sqlQuery(env, STATS_QUERIES.platforms),
			sqlQuery(env, STATS_QUERIES.versions),
			sqlQuery(env, STATS_QUERIES.agents),
			sqlQuery(env, STATS_QUERIES.channels),
			sqlQuery(env, STATS_QUERIES.daily)
		]);
		return statsJson({
			// Analytics Engine keeps ~92 days of data points
			retentionDays: 92,
			total: platforms.reduce((sum, r) => sum + r.downloads, 0),
			platforms,
			versions,
			agents,
			// web = site downloads, updater = in-app updates (full or differential first chunk)
			channels,
			daily: daily.map((r) => ({ ...r, name: r.name.slice(0, 10) }))
		});
	} catch (err) {
		return statsJson({ error: `query failed: ${String(err).slice(0, 300)}` }, 502);
	}
}

async function latestRedirect(env: Env, alias: string): Promise<Response> {
	const fileKey = PLATFORM_ALIAS[alias.toLowerCase()];
	if (!fileKey) return new Response('Unknown platform', { status: 404 });
	const manifest = await env.RELEASES.get('latest.json');
	if (!manifest || !manifest.body) return new Response('No manifest', { status: 404 });
	try {
		const parsed = (await new Response(manifest.body).json()) as { files?: Record<string, string> };
		const target = parsed.files?.[fileKey];
		if (target) return Response.redirect(`https://dl.texpile.com/${target}`, 302);
	} catch {
		// ignored
	}
	return new Response('No manifest entry', { status: 404 });
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const key = decodeURIComponent(url.pathname.slice(1));

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD' }
			});
		}
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, OPTIONS' } });
		}
		if (!key) return Response.redirect('https://texpile.com/download', 302);

		const latestAlias = key.match(/^latest\/([\w-]+)$/);
		if (latestAlias) return latestRedirect(env, latestAlias[1]);

		if (key === '_stats') return statsPage(env);

		if (request.method === 'HEAD') {
			const head = await env.RELEASES.head(key);
			if (!head) return new Response(null, { status: 404 });
			const headers = new Headers();
			head.writeHttpMetadata(headers);
			headers.set('etag', head.httpEtag);
			headers.set('content-length', String(head.size));
			headers.set('accept-ranges', 'bytes');
			if (INSTALLER.test(key)) headers.set('content-disposition', `attachment; filename="${attachmentName(key)}"`);
			return new Response(null, { status: 200, headers });
		}

		// only pass ranges through when the client sent one: R2 can report a `range` on the
		// returned object either way, which must not turn a plain GET into a 206
		const wantsRange = request.headers.has('range');
		const object = await env.RELEASES.get(key, {
			range: wantsRange ? request.headers : undefined,
			onlyIf: request.headers
		});
		if (!object) return new Response('Not found', { status: 404 });

		const headers = new Headers();
		object.writeHttpMetadata(headers);
		headers.set('etag', object.httpEtag);
		headers.set('accept-ranges', 'bytes');
		if (key === 'latest.json' || key === 'versions.json') {
			// the download page fetches these cross-origin; keep them fresh but not hammering
			headers.set('access-control-allow-origin', '*');
			headers.set('cache-control', 'public, max-age=300');
		} else if (/^v\d/.test(key)) {
			headers.set('cache-control', 'public, max-age=31536000, immutable'); // versioned copies never change
		}
		if (INSTALLER.test(key)) headers.set('content-disposition', `attachment; filename="${attachmentName(key)}"`);

		// Precondition (If-None-Match) matched: no body comes back.
		if (!object.body) return new Response(null, { status: 304, headers });

		let status = 200;
		const r = object.range;
		if (wantsRange && r && r.offset !== undefined && r.length !== undefined) {
			status = 206;
			headers.set('content-range', `bytes ${r.offset}-${r.offset + r.length - 1}/${object.size}`);
			headers.set('content-length', String(r.length));
		} else {
			headers.set('content-length', String(object.size));
		}

		if (INSTALLER.test(key) && countable(request)) {
			const ua = request.headers.get('user-agent') ?? '';
			const country = ((request as unknown as { cf?: { country?: string } }).cf?.country ?? '').toString();
			// the in-app updater stamps x-texpile-version on every request (electron/src/updates.ts),
			// splitting update traffic from real acquisition downloads
			const channel = request.headers.has('x-texpile-version') ? 'updater' : 'web';
			// fire-and-forget; the runtime buffers and ships data points itself
			env.DOWNLOADS?.writeDataPoint({
				blobs: [key, platformOf(key), versionOf(key), country, agentFamily(ua), ua.slice(0, 96), channel],
				doubles: [1],
				indexes: [platformOf(key)]
			});
		}

		return new Response(object.body, { status, headers });
	}
};
