// Prepares tinymist's own preview page for display inside Texpile.
//
// tinymist embeds a self-contained preview page in its binary (~1.6MB, renderer wasm inlined) and
// serves it over loopback. That page IS the viewer: incremental SVG patching, ctrl+wheel zoom,
// keybindings, click-to-jump. Rather than reimplement any of it, we fetch it and show it.
//
// This is what tinymist's own VS Code extension does - it takes the same page, does a handful of
// string substitutions, and hands it to a webview. We follow that, with two differences: we serve
// the result from our own scheme (so we are not pointing a frame at an http origin), and we inject
// a small bridge so our pane can drive the viewer.
//
// Kept free of electron imports so it can be unit tested as plain string work.

/** how the prepared page should look and what it should talk to */
export type PreparePageOptions = {
	/** `host:port` of tinymist's data plane, e.g. `127.0.0.1:52145` */
	dataPlaneHost: string;
	/** page background, behind and around the paper */
	background: string;
	/** text colour for anything the page draws itself */
	foreground: string;
};

/**
 * The page derives its websocket address from its own URL:
 *
 *     new URL("/", window.location.href)   →   protocol http: → ws:
 *
 * That works when tinymist serves it, because the page and the socket share an origin. We serve it
 * from our own scheme, where the same expression yields no `ws:` at all and the viewer would sit
 * there forever with nothing to render. So the address gets pinned at prepare time.
 *
 * The raw asset inside the binary instead carries a literal `ws://127.0.0.1:23625` placeholder,
 * which is what the VS Code extension substitutes. Both forms are handled: which one we see depends
 * on whether the page came from the static server or straight from the binary.
 */
const DERIVED_WS = 'new URL("/", window.location.href)';
const PLACEHOLDER_WS = 'ws://127.0.0.1:23625';

/** Raised rather than returning a broken page: a silent miss here is a preview that never loads. */
export class PreviewPageError extends Error {}

/**
 * Colour the page through the variables it already exposes, and open a channel we can drive it
 * with.
 *
 * The bridge deliberately steers the viewer through its OWN keyboard handler rather than poking at
 * its internals: dispatching the ctrl+= it already listens for keeps its zoom ladder, its anchor
 * maths and its re-render path intact, and leaves us reading one value back out.
 */
function injection(opts: PreparePageOptions): string {
	return `
<style id="texpile-theme">
	/* !important is load-bearing: the page sets these as INLINE styles on <html> from its own
	   script, and an inline declaration beats any stylesheet rule that is not important. Without
	   it the pane keeps tinymist's grey no matter what we pass in. */
	:root {
		--typst-preview-background-color: ${opts.background} !important;
		--typst-preview-foreground-color: ${opts.foreground} !important;
	}
	/* The paper edge tinymist leaves out: its viewer fits every page to the pane width, stacks
	   them a mere 5px apart and paints them all white, so the surround we theme has almost
	   nowhere to show and the document reads as one endless white sheet. The page rect is an
	   SVG element, which means a stylesheet stroke can draw its edge - no reaching into the
	   viewer required. Coordinates inside the rect are scaled by 100 (INNER_RECT_UNIT in their
	   typst-doc.svg.mts), so 300 here is 3pt - sized for the OUTER half being all that reliably
	   shows, since the page's own content paints over the inner half. */
	rect.typst-page-inner {
		stroke: ${opts.foreground};
		stroke-opacity: 0.5;
		stroke-width: 300px;
	}
	/* tinymist puts the grab hand on the paper. Chromium draws that hand from its own bitmap, and when
	   the pointer reaches the frame across the pane splitter (a col-resize system cursor) the bitmap
	   comes up white with no edge, invisible on a white page. The system arrow has no such state, and
	   here the paper only scrolls and click-jumps */
	#typst-container, #typst-container * {
		cursor: default !important;
	}
</style>
<script id="texpile-bridge">
(function () {
	var CHANNEL = 'texpile-preview';
	// Instrument the socket itself. The page creates it on window.load, which is after this script
	// parses, and its own error handling only console.logs - on the far side of an origin boundary.
	// A mixed-content block THROWS from the constructor, so that has to be caught here to be seen.
	var sock = { url: null, state: -1, threw: null, closeCode: null, closeReason: null };
	// While set, incoming jump/cursor frames are swallowed: a guest's forward-sync makes tinymist
	// broadcast a jump meant for THAT guest, and this direct socket would jerk the host's view
	// too. Our listener registers before the viewer subscribes (it constructs, then attaches), so
	// stopImmediatePropagation starves every later listener of the frame.
	var jumpFreezeUntil = 0;
	var Native = window.WebSocket;
	function WrappedWebSocket(url, protocols) {
		sock.url = String(url);
		sock.state = 0;
		var s;
		try {
			s = protocols === undefined ? new Native(url) : new Native(url, protocols);
		} catch (err) {
			sock.threw = String((err && err.name) || '') + ': ' + String((err && err.message) || err);
			throw err;
		}
		s.addEventListener('open', function () { sock.state = 1; });
		s.addEventListener('close', function (e) { sock.state = 3; sock.closeCode = e.code; sock.closeReason = e.reason; });
		s.addEventListener('message', function (e) {
			if (Date.now() >= jumpFreezeUntil) return;
			// tinymist sends jump/cursor as BINARY frames (a jump is ~41 bytes of ASCII inside a
			// binary message), so the sniff decodes the head of small ArrayBuffers too - a
			// string-only test never matched and the freeze did nothing.
			var head = '';
			if (typeof e.data === 'string') head = e.data.slice(0, 8);
			else if (e.data instanceof ArrayBuffer && e.data.byteLength <= 512) {
				try { head = new TextDecoder().decode(new Uint8Array(e.data, 0, Math.min(8, e.data.byteLength))); } catch (err) {}
			}
			if (/^(jump|cursor)([\\s,]|$)/.test(head)) e.stopImmediatePropagation();
		});
		return s;
	}
	WrappedWebSocket.prototype = Native.prototype;
	WrappedWebSocket.CONNECTING = 0; WrappedWebSocket.OPEN = 1; WrappedWebSocket.CLOSING = 2; WrappedWebSocket.CLOSED = 3;
	window.WebSocket = WrappedWebSocket;
	// The live viewer instance. tinymist pushes each one onto the container element, and appends
	// rather than replaces on reconnect, so the LAST entry is the current document.
	function view() {
		var c = document.getElementById('typst-container');
		var list = c && c.documents;
		if (!list || !list.length) return null;
		for (var i = list.length - 1; i >= 0; i--) if (list[i] && list[i].impl) return list[i];
		return null;
	}
	function zoomPercent() {
		var v = view();
		return v ? Math.round(v.impl.currentScaleRatio * 100) : null;
	}
	// their own shortcut: ctrl/cmd + '=' zooms in, '-' zooms out
	function step(dir) {
		var mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
		var ev = new KeyboardEvent('keydown', {
			key: dir > 0 ? '=' : '-',
			ctrlKey: !mac,
			metaKey: mac,
			bubbles: true,
			cancelable: true
		});
		document.body.dispatchEvent(ev);
	}
	function reply(type, value) {
		try { parent.postMessage({ channel: CHANNEL, type: type, value: value }, '*'); } catch (e) {}
	}
	// The viewer draws an expanding circle for EVERY jump it handles. Right for a one-shot sync -
	// the circle is a "here is where you landed" cue for a deliberate action - but wrong for
	// follow, whose jumps are ambient. The two produce identical frames, so the viewer cannot
	// tell them apart; the EDITOR can, and it posts a 'quiet' message alongside every follow
	// scroll. Ripples landing inside the quiet window are removed before they draw; the scroll
	// itself is untouched. Watched on the scroll container only, where triggerRipple appends -
	// never the SVG subtree the renderer churns on every edit.
	var quietUntil = 0;
	var rippleHost = document.getElementById('typst-container-main');
	if (rippleHost) {
		new MutationObserver(function (muts) {
			for (var a = 0; a < muts.length; a++) {
				var nodes = muts[a].addedNodes;
				for (var b = 0; b < nodes.length; b++) {
					var n = nodes[b];
					if (n.nodeType === 1 && n.classList.contains('typst-jump-ripple') && Date.now() < quietUntil && n.parentNode) {
						n.parentNode.removeChild(n);
					}
				}
			}
		}).observe(rippleHost, { childList: true });
	}
	// Whatever goes wrong in here is invisible from the host - different origin, no shared console -
	// so a failure would otherwise present as a blank pane and nothing else. Forward it instead.
	window.addEventListener('error', function (e) {
		reply('error', String((e && e.message) || 'script error') + (e && e.filename ? ' @ ' + e.filename : ''));
	});
	window.addEventListener('unhandledrejection', function (e) {
		reply('error', 'unhandled rejection: ' + String((e && e.reason && e.reason.message) || (e && e.reason) || '?'));
	});
	// A blocked connection is silent otherwise: the page's own socket error handler only console.logs,
	// and that console is on the far side of an origin boundary.
	document.addEventListener('securitypolicyviolation', function (e) {
		reply('error', 'blocked by ' + e.violatedDirective + ': ' + (e.blockedURI || '?'));
	});
	/** enough to tell apart "page never loaded", "socket never opened" and "rendered nothing". */
	function status() {
		var v = view();
		return {
			pages: document.querySelectorAll('.typst-page').length,
			// from OUR wrapper, not from the page: it only publishes its socket once open, so asking it
			// cannot distinguish "never tried" from "tried and was refused"
			socket: sock.state,
			socketUrl: sock.url,
			socketThrew: sock.threw,
			closeCode: sock.closeCode,
			closeReason: sock.closeReason,
			origin: String(location.origin),
			secureContext: !!window.isSecureContext,
			viewer: !!v,
			initialized: v ? !!v.impl.moduleInitialized : false,
			zoom: zoomPercent()
		};
	}
	// tinymist takes one zoom step per 20px of ctrl+wheel, and a trackpad pinch covers one of its steps in about 13px,
	// so the pinch reaches it scaled up and the zoom follows the fingers. A mouse notch is one step either way
	var passingPinch = false;
	window.addEventListener('wheel', function (e) {
		if (passingPinch || !e.ctrlKey || e.deltaMode !== 0 || Math.abs(e.deltaY) >= 20) return;
		e.preventDefault();
		e.stopImmediatePropagation();
		passingPinch = true;
		try {
			e.target.dispatchEvent(new WheelEvent('wheel', {
				deltaY: e.deltaY * 1.5, deltaMode: 0, ctrlKey: true,
				clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
				bubbles: true, cancelable: true
			}));
		} finally {
			passingPinch = false;
		}
	}, { capture: true, passive: false });
	// a pinch or ctrl+wheel zooms the viewer by its own handler; the toolbar's readout follows it
	var wheelZoomReport = 0;
	window.addEventListener('wheel', function (e) {
		if (!e.ctrlKey && !e.metaKey) return;
		clearTimeout(wheelZoomReport);
		wheelZoomReport = setTimeout(function () { reply('zoom', zoomPercent()); }, 50);
	}, { capture: true, passive: true });
	window.addEventListener('message', function (e) {
		var m = e.data;
		if (!m || typeof m !== 'object' || m.channel !== CHANNEL) return;
		if (m.type === 'zoom') { step(m.value); setTimeout(function () { reply('zoom', zoomPercent()); }, 0); }
		else if (m.type === 'quiet') quietUntil = Date.now() + (typeof m.value === 'number' ? m.value : 500);
		else if (m.type === 'freeze') jumpFreezeUntil = Date.now() + (typeof m.value === 'number' ? m.value : 1500);
		else if (m.type === 'query') reply('status', status());
	});
	// Report until the document is actually on screen, then stop. Reporting the whole status rather
	// than just "ready" is what makes a stuck preview say WHY it is stuck.
	//
	// NEVER give up while nothing is rendered: a compile can succeed minutes later (a fixed error,
	// an edit from an external program) and a reporter that stopped after 30 seconds left the
	// "nothing to preview yet" card stuck over the recovered document. Fast at first - the
	// transitions worth narrating happen at startup - then once a second, forever if need be.
	var tries = 0;
	function report() {
		var s = status();
		reply('status', s);
		if (s.pages > 0) return; // rendered: the last report said so, nothing left to narrate
		tries++;
		setTimeout(report, tries > 150 ? 1000 : 200);
	}
	report();
})();
</script>
`;
}

/**
 * A stand-in for WebSocket, for the page on a GUEST's screen.
 *
 * A guest has no tinymist and no data plane; the host holds the socket and the bytes arrive over
 * the session. So the page's own network layer is replaced wholesale: constructing a socket posts
 * to the parent frame instead of connecting, and the parent feeds frames back in. The viewer keeps
 * its entire reconnect ladder - a dropped relay surfaces as a close event, the page constructs a
 * new "socket", and the parent turns that into a fresh attach. That reconnect-on-construct IS the
 * drop-and-reattach recovery; nothing else implements it.
 *
 * Placed BEFORE the theme/bridge injection on purpose: the bridge wraps whatever window.WebSocket
 * is when it parses, so this must already be it. EventTarget is load-bearing for the same reason -
 * the bridge instruments sockets via addEventListener.
 */
function remoteSocketShim(): string {
	return `
<script id="texpile-remote-socket">
(function () {
	var NET = 'texpile-preview-net';
	// exactly one live socket: the viewer replaces its socket by constructing a new one, so a
	// newer construction supersedes the old. epoch pairs parent messages with the construction
	// they belong to; a stale epoch is a message for a socket that no longer exists.
	var current = null;
	var epoch = 0;
	function post(ev, data) {
		try { parent.postMessage({ channel: NET, ev: ev, epoch: epoch, data: data }, '*'); } catch (e) {}
	}
	class RemoteSocket extends EventTarget {
		constructor() {
			super();
			this.readyState = 0;
			this.binaryType = 'blob';
			this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
			if (current) current._drop(1000, 'superseded');
			current = this;
			this._epoch = ++epoch;
			post('open');
		}
		send(data) {
			if (this.readyState !== 1) return;
			// The outline's srclocation cannot be attributed to a clicking guest and dies here.
			// src-point (a document click) passes: the parent whitelists it upstream, and the host
			// reroutes tinymist's resolved jump back to this guest instead of moving its own caret.
			if (typeof data === 'string' && data.indexOf('srclocation') !== -1) return;
			post('send', data);
		}
		close() { post('close'); this._drop(1000, ''); }
		_drop(code, reason) {
			if (this.readyState === 3) return;
			this.readyState = 3;
			if (current === this) current = null;
			var ev;
			try { ev = new CloseEvent('close', { code: code, reason: reason }); }
			catch (e) { ev = new Event('close'); }
			this.dispatchEvent(ev);
			if (this.onclose) this.onclose(ev);
		}
		_open() {
			if (this.readyState !== 0) return;
			this.readyState = 1;
			var ev = new Event('open');
			this.dispatchEvent(ev);
			if (this.onopen) this.onopen(ev);
		}
		_message(data) {
			if (this.readyState !== 1) return;
			var body = this.binaryType === 'arraybuffer' || typeof data === 'string' ? data : new Blob([data]);
			var ev = new MessageEvent('message', { data: body });
			this.dispatchEvent(ev);
			if (this.onmessage) this.onmessage(ev);
		}
	}
	RemoteSocket.CONNECTING = 0; RemoteSocket.OPEN = 1; RemoteSocket.CLOSING = 2; RemoteSocket.CLOSED = 3;
	window.WebSocket = RemoteSocket;
	window.addEventListener('message', function (e) {
		var msg = e.data;
		if (!msg || typeof msg !== 'object' || msg.channel !== NET) return;
		var s = current;
		if (!s || msg.epoch !== s._epoch) return;
		if (msg.ev === 'open') s._open();
		else if (msg.ev === 'data') s._message(msg.data);
		else if (msg.ev === 'close') s._drop(1006, 'relay closed');
	});
})();
</script>
`;
}

/**
 * Prepare the host-shipped page for a GUEST's frame: same theming and bridge, but the network
 * layer swapped for the parent-fed shim above. The websocket address is still pinned - to a
 * dead loopback port the shim never dials - because pinning is also the check that this html
 * is actually tinymist's page and not something else the wire handed us.
 */
export function prepareGuestPreviewPage(html: string, opts: Omit<PreparePageOptions, 'dataPlaneHost'>): string {
	const out = preparePreviewPage(html, { ...opts, dataPlaneHost: '127.0.0.1:9' });
	// the shim must parse before the bridge (which sits last in body); anchor it before both
	const close = out.lastIndexOf('<style id="texpile-theme">');
	const shim = remoteSocketShim();
	return close >= 0 ? out.slice(0, close) + shim + out.slice(close) : out + shim;
}

/**
 * Rewrite the served page so it can run inside our frame.
 *
 * Throws when the websocket address cannot be pinned - better a clear failure at start than a
 * preview pane that stays blank with no explanation.
 */
export function preparePreviewPage(html: string, opts: PreparePageOptions): string {
	if (!/^[\w.-]+:\d+$/.test(opts.dataPlaneHost)) {
		throw new PreviewPageError(`refusing a malformed data plane host: ${opts.dataPlaneHost}`);
	}

	let out = html;
	if (out.includes(DERIVED_WS)) {
		out = out.replace(DERIVED_WS, `new URL(${JSON.stringify(`http://${opts.dataPlaneHost}/`)})`);
	} else if (out.includes(PLACEHOLDER_WS)) {
		out = out.split(PLACEHOLDER_WS).join(`ws://${opts.dataPlaneHost}`);
	} else {
		throw new PreviewPageError('tinymist preview page has neither the derived nor the placeholder websocket address');
	}

	// last thing in the body, so the viewer's own script has already defined everything we reach for
	const inject = injection(opts);
	const close = out.lastIndexOf('</body>');
	return close >= 0 ? out.slice(0, close) + inject + out.slice(close) : out + inject;
}
