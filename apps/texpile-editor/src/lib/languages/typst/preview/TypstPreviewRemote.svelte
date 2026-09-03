<script module lang="ts">
	// monotonic across remounts, so a reopened pane can never collide with its predecessor's epoch
	let connCounter = 0;
	function nextConn(): number {
		return ++connCounter;
	}
</script>

<script lang="ts">
	// The HOST's Typst preview, on a guest's screen.
	//
	// Same viewer page as TypstPreview - the guest received it over the session (blob 'typst-page')
	// and serves it from its own loopback under a networkless CSP. Its WebSocket is a shim
	// (electron/src/typstPreviewPage.ts) that talks to this component by postMessage; this
	// component splices that onto the session's preview frames, and the host's relay splices those
	// onto the real data plane. To the viewer it is all just a slow socket.
	//
	// Recovery is the viewer's own reconnect ladder: anything wrong (a lost frame, the host's
	// preview restarting, the relay dropping) is turned into a close at the shim, the viewer
	// constructs a new "socket", and that reattach starts over with a whole-document frame.
	import { tip } from '$lib/components/tooltip.svelte';
	import { ZoomIn, ZoomOut, Crosshair, PictureInPicture2 } from '@lucide/svelte';
	import { resolvedMode, themeName } from '$lib/theme';
	import { collabGuest } from '$lib/collab/guestStore.svelte';
	import { PreviewStream, type PreviewPayload } from '$lib/collab/protocol';
	import { settings, updateSettings } from '$lib/settings';
	import { followScrollTick } from './followSignal';
	import { themeColour } from './themeColour';
	import { m } from '$lib/paraglide/messages';

	type Props = {
		/** a splitter is being dragged; hold the frame's size instead of reflowing it every frame */
		paneDragging: boolean;
		/** move the preview into its own OS window; null (already popped out) hides the button */
		onPopout?: (() => void) | null;
	};
	let { paneDragging, onPopout = null }: Props = $props();

	const CHANNEL = 'texpile-preview';
	const NET = 'texpile-preview-net';
	const EMPTY = new Uint8Array(0);

	let frameBox = $state<HTMLDivElement | null>(null);
	let frame = $state<HTMLIFrameElement | null>(null);
	let frameUrl = $state<string | null>(null);
	let error = $state<string | null>(null);
	let zoom = $state<number | null>(null);
	/** frozen during splitter drags; see TypstPreview, same trade for the same reason */
	let frozenWidth = $state<number | null>(null);
	$effect(() => {
		if (paneDragging) {
			if (frozenWidth === null && frameBox) frozenWidth = frameBox.clientWidth;
		} else {
			frozenWidth = null;
		}
	});

	const dark = $derived(resolvedMode.current === 'dark');
	// tracked on the theme too: the probe reads computed colours, which a theme switch changes
	const background = $derived.by(() => {
		void themeName.current;
		return dark ? themeColour('--color-surface-800', '#27272a') : themeColour('--color-surface-300', '#d4d4d8');
	});
	const foreground = $derived.by(() => {
		void themeName.current;
		return dark ? themeColour('--color-surface-200', '#e4e4e7') : themeColour('--color-surface-700', '#3f3f46');
	});

	// The page travels once per session, but the ASK must repeat until it is answered: a single
	// ask could race the host's preview task coming up and was silently dropped there, leaving
	// this pane on "waiting" forever. The repeat is also what keeps the host's pending-ask demand
	// entry alive, which is what makes the host start the task for a guest-only preview at all.
	$effect(() => {
		if (collabGuest.previewPage !== null) return;
		collabGuest.requestPreviewPage();
		const t = setInterval(() => collabGuest.requestPreviewPage(true), 3000);
		return () => clearInterval(t);
	});

	$effect(() => {
		const html = collabGuest.previewPage;
		if (!html) return;
		const bg = background;
		const fg = foreground;
		let cancelled = false;
		frameUrl = null;
		error = null;
		const bridge = window.texpileTypst;
		if (typeof bridge?.prepareGuestPreview !== 'function') {
			error = m.typst_preview_unavailable();
			return;
		}
		bridge.prepareGuestPreview(html, bg, fg).then(
			(res) => {
				if (cancelled) return;
				if (res?.ok && res.url) frameUrl = res.url;
				else error = res?.error ?? m.typst_preview_failed();
			},
			(e) => {
				if (!cancelled) error = e instanceof Error ? e.message : String(e);
			}
		);
		return () => {
			cancelled = true;
			if (typeof bridge.releasePreview === 'function') bridge.releasePreview();
		};
	});

	// the socket splice
	// One live connection: `conn` is our epoch on the session wire, `shimEpoch` the page's
	// construction counter for it. Both stamped on every hop, so anything stale drops silently.
	let conn = 0;
	let shimEpoch = 0;
	let stream: PreviewStream | null = null;

	function toShim(msg: Record<string, unknown>): void {
		frame?.contentWindow?.postMessage({ channel: NET, epoch: shimEpoch, ...msg }, '*');
	}
	function sendUp(ev: 'open' | 'close'): void {
		collabGuest.sendPreview({ conn, ev, seq: 0, part: 0, parts: 1, bytes: EMPTY });
	}

	// reattach backoff
	// The viewer reconnects the instant its socket closes, so a systematically failing attach (the
	// task's port dead on the host, frames lost on the relay) otherwise becomes a tight construct/
	// close loop hammering the session with 1006 closes. A conn that dies young counts as a
	// failure and the NEXT attach waits, doubling up to 5s; a conn that lives ages them out.
	let attachTimer: ReturnType<typeof setTimeout> | null = null;
	let connOpenedAt = 0; // when the current conn's 'open' went upstream; 0 = nothing in flight
	let failTimes: number[] = [];
	function noteConnDied(): void {
		if (connOpenedAt && Date.now() - connOpenedAt < 3000) failTimes.push(Date.now());
		connOpenedAt = 0;
		const cutoff = Date.now() - 30_000;
		failTimes = failTimes.filter((t) => t >= cutoff);
	}
	function attachDelay(): number {
		return failTimes.length === 0 ? 0 : Math.min(5000, 500 * 2 ** (failTimes.length - 1));
	}

	/** kill the current connection both ways; the viewer's reconnect brings the next one */
	function drop(tellHost: boolean): void {
		if (!conn) return;
		noteConnDied();
		if (tellHost) sendUp('close');
		toShim({ ev: 'close' });
		stream = null;
	}

	// what the page posts: its bridge (status/zoom/errors, exactly as TypstPreview) and its shim.
	// Listened for on the FRAME'S window: the page posts to its parent, which is the popup's
	// window rather than this module's global when the pane is popped out.
	$effect(() => {
		const win = frameBox?.ownerDocument.defaultView;
		if (!win) return;
		function onMessage(e: MessageEvent) {
			const d = e.data;
			if (!d || typeof d !== 'object') return;
			if (d.channel === CHANNEL) {
				if (d.type === 'zoom' && typeof d.value === 'number') zoom = d.value;
				else if (d.type === 'status' && d.value && typeof d.value.zoom === 'number') zoom = d.value.zoom;
				else if (d.type === 'error' && typeof d.value === 'string') error = d.value;
				return;
			}
			if (d.channel !== NET) return;
			if (d.ev === 'open') {
				// the viewer built a new socket: a fresh epoch supersedes whatever came before
				conn = nextConn();
				shimEpoch = Number(d.epoch) || 0;
				stream = new PreviewStream();
				if (attachTimer) clearTimeout(attachTimer);
				const myConn = conn;
				function go() {
					attachTimer = null;
					if (conn !== myConn) return; // superseded while waiting
					connOpenedAt = Date.now();
					sendUp('open');
				}
				const delay = attachDelay();
				if (delay > 0) attachTimer = setTimeout(go, delay);
				else go();
			} else if (d.ev === 'send' && d.epoch === shimEpoch && conn) {
				// Upstream whitelist, same rule the host's relay enforces: 'current' (the attach
				// handshake) and 'src-point' (this viewer was clicked - the host reroutes the
				// resolved jump back to this guest's editor). Everything else the viewer emits
				// (srclocation, outline-sync) drives the HOST'S editor and must die here.
				if (typeof d.data === 'string' && (d.data === 'current' || /^src-point([\s,]|$)/.test(d.data))) {
					collabGuest.sendPreview({ conn, ev: 'text', seq: 0, part: 0, parts: 1, bytes: new TextEncoder().encode(d.data) });
				}
			} else if (d.ev === 'close' && d.epoch === shimEpoch && conn) {
				noteConnDied(); // a viewer-side close (its own connect timeout) is a failed attach too
				sendUp('close');
				stream = null;
			}
		}
		win.addEventListener('message', onMessage);
		return () => {
			win.removeEventListener('message', onMessage);
			if (attachTimer) {
				clearTimeout(attachTimer);
				attachTimer = null;
			}
		};
	});

	// host frames down to the shim, through the reassembler
	$effect(() => {
		collabGuest.onPreviewFrame = (p: PreviewPayload) => {
			if (p.conn !== conn || !conn) return;
			if (p.ev === 'open') {
				toShim({ ev: 'open' });
			} else if (p.ev === 'close') {
				drop(false); // the host already knows
			} else {
				const r = stream?.add(p);
				if (r === 'gap') {
					// a frame was lost in transit; everything after it is undecodable, so reattach
					drop(true);
				} else if (r) {
					// eslint-disable-next-line id-denylist -- the shim protocol mirrors the socket 'data' event shape
					toShim({ ev: 'data', data: r.text ? new TextDecoder().decode(r.bytes) : (r.bytes.slice() as Uint8Array<ArrayBuffer>).buffer });
				}
			}
		};
		return () => {
			collabGuest.onPreviewFrame = null;
			drop(true); // leaving the pane must not leave the host holding a socket for nobody
		};
	});

	/** `dir` is +1 to zoom in, -1 out; the far side steps through tinymist's own zoom ladder. */
	function stepZoom(dir: 1 | -1): void {
		frame?.contentWindow?.postMessage({ channel: CHANNEL, type: 'zoom', value: dir }, '*');
	}

	// same courtesy as the host pane: follow jumps are ambient, so the frame swallows the ripple
	$effect(() => {
		if (followScrollTick.current === 0) return;
		frame?.contentWindow?.postMessage({ channel: CHANNEL, type: 'quiet', value: 500 }, '*');
	});
</script>

<div class="bg-surface-200-800 flex h-full w-full flex-col">
	<!-- the local pane's header, minus what a guest cannot do: no Save as PDF (the exporter is the
	     host's tinymist). Zoom is local to this viewer; follow works (see the toggle below). -->
	<div class="bg-surface-100-900 border-surface-200-800 text-muted flex h-9 shrink-0 items-center gap-1 border-b px-3 text-xs">
		<span class="shrink-0 font-medium">{m.typst_preview_label()}</span>
		<span class="bg-surface-300-700 mx-1 h-4 w-px shrink-0"></span>
		{#if error}
			<span class="text-error-ink truncate" use:tip={error}>{error}</span>
		{:else}
			<span class="text-surface-700-200 truncate">{frameUrl ? m.typst_preview_live() : m.typst_preview_connecting()}</span>
		{/if}
		<div class="flex-1"></div>
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			onclick={() => stepZoom(-1)}
			disabled={!frameUrl}
			use:tip={m.draft_toolbar_zoom_out()}
			aria-label={m.draft_toolbar_zoom_out()}
		>
			<ZoomOut class="size-4" />
		</button>
		<span class="min-w-11 text-center tabular-nums">{zoom !== null ? `${zoom}%` : '—'}</span>
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			onclick={() => stepZoom(1)}
			disabled={!frameUrl}
			use:tip={m.draft_toolbar_zoom_in()}
			aria-label={m.draft_toolbar_zoom_in()}
		>
			<ZoomIn class="size-4" />
		</button>
		<span class="bg-surface-300-700 mx-1 h-4 w-px shrink-0"></span>
		<!-- follow works for guests too: the caret position travels to the host, tinymist resolves
		     it, and the relay hands the resulting jump to only this viewer -->
		<button
			class="hover:preset-tonal rounded-base p-1 disabled:opacity-40"
			class:preset-tonal={settings.current.typstPreviewFollow === true}
			class:text-primary-ink={settings.current.typstPreviewFollow === true}
			onclick={() => updateSettings({ typstPreviewFollow: settings.current.typstPreviewFollow !== true })}
			disabled={!frameUrl}
			use:tip={settings.current.typstPreviewFollow === true ? m.typst_preview_follow_on() : m.typst_preview_follow_off()}
			aria-label={m.typst_preview_follow_aria()}
			aria-pressed={settings.current.typstPreviewFollow === true}
		>
			<Crosshair class="size-4" />
		</button>
		<!-- no close button, exactly as the host pane: the divider's lozenge (docked) or the OS
		     window's close (popped out) is the way off -->
		{#if onPopout}
			<span class="bg-surface-300-700 mx-1 h-4 w-px shrink-0"></span>
			<button
				class="hover:preset-tonal shrink-0 rounded-base p-1"
				onclick={onPopout}
				use:tip={m.wsview_popout_preview()}
				aria-label={m.wsview_popout_preview()}
			>
				<PictureInPicture2 class="size-4" />
			</button>
		{/if}
	</div>

	<div bind:this={frameBox} class="relative min-h-0 flex-1 overflow-hidden">
		{#if frameUrl}
			<iframe
				bind:this={frame}
				src={frameUrl}
				title={m.typst_preview_label()}
				class="h-full border-0 transition-[filter] duration-100"
				class:blur-[1.5px]={frozenWidth !== null}
				class:pointer-events-none={frozenWidth !== null}
				style:width={frozenWidth !== null ? `${frozenWidth}px` : '100%'}
				onerror={() => (error = m.typst_preview_frame_failed())}
			></iframe>
		{:else if !error}
			<div class="text-muted flex h-full items-center justify-center p-6 text-center text-sm">
				{m.typst_preview_guest_waiting()}
			</div>
		{/if}
	</div>
</div>
