// Preparing tinymist's preview page for our frame. Every failure here is a blank preview pane with
// no error, which is why the module throws rather than returning something almost-right.
import { describe, it, expect } from 'vitest';
import { preparePreviewPage, prepareGuestPreviewPage, PreviewPageError } from '../../../../../electron/src/typstPreviewPage';

const OPTS = {
	dataPlaneHost: '127.0.0.1:52145',
	background: '#131316',
	foreground: '#e4e4e7',
	scrollbarThumb: '#fafafa',
	scrollbarRadius: 5,
	dark: false
};

/** the shape the static server serves: the socket address is derived from the page's own URL */
const SERVED = `<html><body><script>
function retrieveWsArgs() {
  let urlObject = new URL("/", window.location.href);
  urlObject.protocol = urlObject.protocol.replace("https:", "wss:").replace("http:", "ws:");
  return { url: urlObject.href };
}
</script></body></html>`;

/** the shape embedded in the binary: a literal placeholder the VS Code extension substitutes */
const RAW = `<html><body><script>const u = "ws://127.0.0.1:23625";</script></body></html>`;

describe('pinning the websocket address', () => {
	it('replaces the derived URL, so the socket does not follow our own scheme', () => {
		// served from typstpreview://, `new URL("/", location.href)` yields no ws: at all and the
		// viewer would sit forever with nothing to render
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out).not.toContain('window.location.href');
		expect(out).toContain('new URL("http://127.0.0.1:52145/")');
	});

	it('substitutes the placeholder form when the page came from the binary', () => {
		const out = preparePreviewPage(RAW, OPTS);
		expect(out).toContain('ws://127.0.0.1:52145');
		expect(out).not.toContain('23625');
	});

	it('throws when neither form is present rather than serving a page that cannot connect', () => {
		expect(() => preparePreviewPage('<html><body>nothing</body></html>', OPTS)).toThrow(PreviewPageError);
	});

	it('rejects a malformed data plane host', () => {
		expect(() => preparePreviewPage(SERVED, { ...OPTS, dataPlaneHost: 'evil.example.com' })).toThrow(PreviewPageError);
		expect(() => preparePreviewPage(SERVED, { ...OPTS, dataPlaneHost: '127.0.0.1' })).toThrow(PreviewPageError);
	});
});

describe('the injected payload', () => {
	it('sets the theme variables the page already consumes', () => {
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out).toContain('--typst-preview-background-color: #131316');
		expect(out).toContain('--typst-preview-foreground-color: #e4e4e7');
	});

	it('marks the theme important, or the page overrides it from its own script', () => {
		// measured: the page sets these as inline styles on <html>, and an inline declaration beats
		// any stylesheet rule that is not important. Dropping !important silently restores their grey.
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out).toMatch(/--typst-preview-background-color:\s*#131316\s*!important/);
		expect(out).toMatch(/--typst-preview-foreground-color:\s*#e4e4e7\s*!important/);
	});

	it('shadows the pages as the PDF viewer does, or two white pages on a light surround read as one sheet', () => {
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out).toMatch(/svg:not\(svg \*\)\s*\{\s*filter:\s*drop-shadow\(0 2px 8px rgb\(0 0 0 \/ 0\.12\)\)/);
	});

	it('swallows the jump ripple inside a quiet window, or follow strobes a circle per keystroke', () => {
		// the viewer draws one expanding circle per jump frame and cannot tell follow from a
		// one-shot sync; the editor can, and posts `quiet` alongside every follow scroll. The
		// bridge must both accept that message and remove ripples arriving inside the window.
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out).toContain('typst-jump-ripple');
		expect(out).toContain('MutationObserver');
		expect(out).toContain("m.type === 'quiet'");
	});

	it('adds the bridge, since a framed page has no other way to be driven', () => {
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out).toContain('texpile-bridge');
		expect(out).toContain('texpile-preview');
	});

	it('injects inside the body, after the viewer has defined itself', () => {
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out.indexOf('texpile-bridge')).toBeGreaterThan(out.indexOf('retrieveWsArgs'));
		expect(out.indexOf('texpile-bridge')).toBeLessThan(out.lastIndexOf('</body>'));
	});

	it('still appends when there is no closing body tag', () => {
		const out = preparePreviewPage('<script>new URL("/", window.location.href)</script>', OPTS);
		expect(out).toContain('texpile-bridge');
	});

	it('reads the zoom with the side gaps only when the spacing patch applied, or 100% is not the printed size', () => {
		const spaced = `${SERVED}<script>const computedScale = container.width ? container.width / maxWidth : 1;
const heightMargin = this.isContentPreview ? 6 * scale : 5 * scale;
const widthMargin = 0;
const calculatedPaddedY = accumulatedHeight + (i == 0 ? 0 : heightMargin);
const newHeight = accumulatedHeight;</script>`;
		expect(preparePreviewPage(spaced, OPTS)).toContain('var GAPS = 40;');
		expect(preparePreviewPage(SERVED, OPTS)).toContain('var GAPS = 0;');
	});

	it('leaves the rest of the page untouched', () => {
		// it is a 1.6MB page we did not write; the less we rewrite, the less can rot
		const out = preparePreviewPage(SERVED, OPTS);
		expect(out).toContain('urlObject.protocol.replace("https:", "wss:")');
	});
});

describe('the guest page', () => {
	const GUEST_OPTS = { background: '#131316', foreground: '#e4e4e7', scrollbarThumb: '#fafafa', scrollbarRadius: 5, dark: false };

	it('replaces the network layer with the postMessage shim', () => {
		const out = prepareGuestPreviewPage(SERVED, GUEST_OPTS);
		expect(out).toContain('texpile-remote-socket');
		expect(out).toContain('window.WebSocket = RemoteSocket');
	});

	it('parses the shim before the bridge, or the bridge instruments the wrong constructor', () => {
		// the bridge captures window.WebSocket when IT parses; a shim arriving later is never seen
		const out = prepareGuestPreviewPage(SERVED, GUEST_OPTS);
		expect(out.indexOf('texpile-remote-socket')).toBeGreaterThan(-1);
		expect(out.indexOf('texpile-remote-socket')).toBeLessThan(out.indexOf('texpile-bridge'));
		// and both still sit after the viewer's own script
		expect(out.indexOf('texpile-remote-socket')).toBeGreaterThan(out.indexOf('retrieveWsArgs'));
	});

	it('swallows click-to-jump, which would move the HOST editor', () => {
		const out = prepareGuestPreviewPage(SERVED, GUEST_OPTS);
		expect(out).toContain('srclocation');
	});

	it('still validates that the html is tinymist page-shaped', () => {
		expect(() => prepareGuestPreviewPage('<html><body>not the page</body></html>', GUEST_OPTS)).toThrow(PreviewPageError);
	});

	it('keeps the theme injection a guest chose', () => {
		const out = prepareGuestPreviewPage(SERVED, GUEST_OPTS);
		expect(out).toMatch(/--typst-preview-background-color:\s*#131316\s*!important/);
	});
});
