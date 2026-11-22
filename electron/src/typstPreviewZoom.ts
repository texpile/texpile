// The zoom and the scroll place of tinymist's viewer, injected beside the bridge (typstPreviewPage.ts).
//
// tinymist's own zoom is a ratio over fit width. The pane reports and sets a percent of the page's
// printed size instead, the PDF viewer's unit, so the same number shows the same page in both.

/** CSS px per pt at 100%: 96 px and 72 pt to the inch */
export const PX_PER_PT_AT_100 = 96 / 72;

/** `sideGap` is the px tinymist leaves beside the widest page at fit width (0 when the spacing patch missed) */
export function zoomScript(sideGap: number): string {
	return `
<script id="texpile-zoom">
(function () {
	var CHANNEL = 'texpile-preview';
	var PX_PER_PT = ${PX_PER_PT_AT_100};
	var GAPS = ${2 * sideGap};
	// tinymist's own ladder ends
	var MIN_RATIO = 0.1, MAX_RATIO = 10;
	function reply(type, value) {
		try { parent.postMessage({ channel: CHANNEL, type: type, value: value }, '*'); } catch (e) {}
	}
	function view() {
		var c = document.getElementById('typst-container');
		var list = c && c.documents;
		if (!list || !list.length) return null;
		for (var i = list.length - 1; i >= 0; i--) if (list[i] && list[i].impl) return list[i];
		return null;
	}
	function pages() {
		return document.querySelectorAll('g.typst-page[data-page-number]');
	}
	function pageNumber(pg) {
		return parseInt(pg.getAttribute('data-page-number'), 10);
	}
	function widestPage() {
		var w = 0, list = pages();
		for (var i = 0; i < list.length; i++) w = Math.max(w, parseFloat(list[i].getAttribute('data-page-width')) || 0);
		return w;
	}
	// what the viewer draws the widest page at for a ratio: it fits the page to the pane less GAPS at
	// ratio 1, and the gaps keep their px at every ratio (decorateSvgElement, rescale$svg)
	function pxPerPt(v, ratio) {
		var cw = v.impl.retrieveDOMState().width, w = widestPage(), k = cw - GAPS;
		if (!cw || !w || k <= 0) return null;
		return (cw * ratio * ratio * k) / (ratio * k + GAPS) / w;
	}
	function ratioFor(v, percent) {
		var cw = v.impl.retrieveDOMState().width, w = widestPage(), k = cw - GAPS;
		if (!cw || !w || k <= 0) return null;
		var a = (percent / 100) * PX_PER_PT * w;
		var r = (a * k + Math.sqrt(a * a * k * k + 4 * cw * k * GAPS * a)) / (2 * cw * k);
		return Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));
	}
	function percent() {
		var v = view();
		var p = v && pxPerPt(v, v.impl.currentScaleRatio);
		return p ? Math.round((p / PX_PER_PT) * 100) : null;
	}
	function scroller(v) {
		return v.impl.hookedElem && v.impl.hookedElem.parentElement;
	}
	// px per pt as drawn now: the svg's user unit is the pt, and a page's own box is not in the DOM
	function drawnPxPerPt(v) {
		var svg = v.impl.hookedElem && v.impl.hookedElem.firstElementChild;
		var vb = svg && svg.viewBox && svg.viewBox.baseVal;
		return vb && vb.width ? svg.getBoundingClientRect().width / vb.width : null;
	}
	function pageTop(v, pg, u) {
		return v.impl.hookedElem.firstElementChild.getBoundingClientRect().top + (parseFloat(pg.getAttribute('data-y')) || 0) * u;
	}
	// the page at the top of the view and how far down it the view starts, which survives a zoom and a new frame
	function place() {
		var v = view();
		var el = v && scroller(v);
		if (!el) return null;
		var u = drawnPxPerPt(v);
		if (!u) return null;
		var top = el.getBoundingClientRect().top,
			list = pages();
		for (var i = 0; i < list.length; i++) {
			var t = pageTop(v, list[i], u),
				h = (parseFloat(list[i].getAttribute('data-page-height')) || 0) * u;
			if (h > 0 && t + h > top) {
				var spare = el.scrollWidth - el.clientWidth;
				return { ratio: v.impl.currentScaleRatio, page: pageNumber(list[i]), frac: (top - t) / h, left: spare > 0 ? el.scrollLeft / spare : 0 };
			}
		}
		return null;
	}
	function goTo(p) {
		var v = view();
		var el = v && scroller(v);
		var list = pages(),
			pg = null;
		for (var i = 0; i < list.length; i++) if (pageNumber(list[i]) <= p.page) pg = list[i];
		var u = el && pg && drawnPxPerPt(v);
		if (!u) return;
		var h = (parseFloat(pg.getAttribute('data-page-height')) || 0) * u;
		// its resize anchor would put the old scroll back on the next rescale
		if (typeof v.impl.clearSvgResizeAnchor === 'function') v.impl.clearSvgResizeAnchor();
		el.scrollTop += pageTop(v, pg, u) + p.frac * h - el.getBoundingClientRect().top;
		el.scrollLeft = p.left * Math.max(0, el.scrollWidth - el.clientWidth);
	}
	// the viewer's own rescale (doRescale) without its ladder, so any ratio can be set
	function setRatio(v, ratio, done) {
		var impl = v.impl;
		impl.cachedDOMState = impl.retrieveDOMState();
		impl.currentScaleRatio = ratio;
		var fit = Math.abs(ratio - 1) < 1e-5, els = [impl.hookedElem, impl.hookedElem.parentElement];
		for (var i = 0; i < els.length; i++) if (els[i]) els[i].classList.toggle('hide-scrollbar-x', fit);
		var svg = impl.hookedElem.firstElementChild;
		if (svg && typeof impl.getSvgScaleRatio === 'function') {
			impl.hookedElem.style.height = Math.ceil(parseFloat(svg.getAttribute('data-height')) * impl.getSvgScaleRatio()) * 2 + 'px';
		}
		impl.addViewportChange();
		// the rescale lands on a later frame
		var want = pxPerPt(v, ratio),
			until = Date.now() + 2000;
		(function wait() {
			var now = drawnPxPerPt(v);
			if (!want || !now || Math.abs(now - want) / want < 0.005 || Date.now() > until) return done();
			requestAnimationFrame(wait);
		})();
	}
	// a new document is drawn over several renders, and each one puts the scroll back where it was
	function whenSettled(v, done) {
		var last = '',
			since = Date.now(),
			until = since + 3000;
		(function poll() {
			var svg = v.impl.hookedElem.firstElementChild;
			var now = svg ? svg.getAttribute('width') + 'x' + svg.getAttribute('height') + ':' + pages().length : '';
			if (now !== last) {
				last = now;
				since = Date.now();
			}
			if (Date.now() - since >= 300 || Date.now() > until) return done();
			setTimeout(poll, 50);
		})();
	}
	// a zoom asked for mid-zoom waits for it, and the view keeps the place from before the first
	var zooming = null;
	function zoomTo(ratio) {
		var v = view();
		if (!v || ratio === null) return;
		if (zooming) {
			zooming.next = ratio;
			return;
		}
		zooming = { at: place(), next: null };
		(function run(r) {
			setRatio(v, r, function () {
				if (zooming.next !== null) {
					var next = zooming.next;
					zooming.next = null;
					return run(next);
				}
				var at = zooming.at;
				zooming = null;
				if (at) goTo(at);
				reply('zoom', percent());
				reply('place', place());
			});
		})(ratio);
	}
	// the buttons step to the next whole ten, as the PDF viewer's do
	function step(dir) {
		var v = view(), now = percent();
		if (!v || now === null) return;
		var next = dir > 0 ? (Math.floor(now / 10) + 1) * 10 : Math.max(10, (Math.ceil(now / 10) - 1) * 10);
		zoomTo(ratioFor(v, next));
	}
	// a place for a frame that has no pages yet waits for them
	var pending = null;
	function restore(p) {
		var v = view();
		if (!v || !v.impl.moduleInitialized || !pages().length) {
			pending = p;
			setTimeout(function () {
				if (pending === p) restore(p);
			}, 100);
			return;
		}
		pending = null;
		setRatio(v, Math.min(MAX_RATIO, Math.max(MIN_RATIO, p.ratio)), function () {
			whenSettled(v, function () {
				goTo(p);
				reply('zoom', percent());
			});
		});
	}
	window.texpileZoomPercent = percent;
	// a pinch or ctrl+wheel zooms by the viewer's own handler; the readout and the place follow it
	var wheelReport = 0;
	window.addEventListener('wheel', function (e) {
		if (!e.ctrlKey && !e.metaKey) return;
		clearTimeout(wheelReport);
		wheelReport = setTimeout(function () {
			reply('zoom', percent());
			reply('place', place());
		}, 50);
	}, { capture: true, passive: true });
	var placeReport = 0;
	document.addEventListener('scroll', function () {
		if (pending) return;
		clearTimeout(placeReport);
		placeReport = setTimeout(function () { reply('place', place()); }, 150);
	}, { capture: true, passive: true });
	window.addEventListener('message', function (e) {
		var m = e.data;
		if (!m || typeof m !== 'object' || m.channel !== CHANNEL) return;
		if (m.type === 'zoom') step(m.value);
		else if (m.type === 'zoomTo') {
			var v = view();
			if (v) zoomTo(m.value === 'fit' ? 1 : ratioFor(v, m.value));
		} else if (m.type === 'restore' && m.value && typeof m.value === 'object') restore(m.value);
	});
})();
</script>
`;
}
