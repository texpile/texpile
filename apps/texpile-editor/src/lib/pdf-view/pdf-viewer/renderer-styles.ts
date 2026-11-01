/* Copyright 2024 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** shadow-DOM-isolated renderer styles; derivative work based on PDF.js text_layer_builder.css. */
export const rendererStyles = `
/* CSS Custom Properties with defaults (scrollbar vars default at their use sites, so the
   pdf-custom-scrollbar rules see unset props and fall back per-declaration) */
.pdf-renderer-container {
	--pdf-background-color: #e8e8e8;
	--pdf-page-shadow: 0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);

	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	background-color: var(--pdf-background-color);
	overflow: hidden;
	/* containing block for the reload snapshot overlay (the frozen page clones) */
	position: relative;
}

/* Scroll container */
.pdf-scroll-container {
	flex: 1;
	overflow: auto;
	position: relative;
	background-color: var(--pdf-background-color);
	/* a transparent border, not padding: moves the scrollbar in and leaves the ground reaching the edge */
	border-right: var(--pdf-scroll-inset-right, 0) solid transparent;
	scroll-padding-top: var(--pdf-top-inset, 0);
}

/* Scrollbar: native unless the host passes any scrollbar-* prop (.pdf-custom-scrollbar), so an
   unstyled viewer matches the host page's scrollers. No standard scrollbar-color/width here:
   Chromium ignores the ::-webkit-scrollbar pseudos once those are set. */
.pdf-custom-scrollbar .pdf-scroll-container::-webkit-scrollbar {
	width: var(--pdf-scrollbar-width, 10px);
	height: var(--pdf-scrollbar-width, 10px);
}

.pdf-custom-scrollbar .pdf-scroll-container::-webkit-scrollbar-track,
.pdf-custom-scrollbar .pdf-scroll-container::-webkit-scrollbar-corner {
	background: var(--pdf-scrollbar-track-color, transparent);
}

.pdf-custom-scrollbar .pdf-scroll-container::-webkit-scrollbar-thumb {
	background-color: var(--pdf-scrollbar-thumb-color, #888);
	border-radius: calc(var(--pdf-scrollbar-width, 10px) / 2);
	border: 2px solid transparent;
	background-clip: padding-box;
}

.pdf-custom-scrollbar .pdf-scroll-container::-webkit-scrollbar-thumb:hover {
	background-color: var(--pdf-scrollbar-thumb-hover-color, #666);
}

/* Viewer - dynamically created */
.pdfViewer {
	display: flex;
	flex-direction: column;
	align-items: center;
	padding: var(--pdf-top-inset, 20px) 20px 20px;
	gap: 16px;
	min-width: fit-content;
}

/* Page - dynamically created with CSS variables for text layer */
.page {
	--user-unit: 1;
	--total-scale-factor: calc(var(--scale-factor, 1) * var(--user-unit));
	--scale-round-x: 1px;
	--scale-round-y: 1px;

	position: relative;
	background-color: white;
	box-shadow: var(--pdf-page-shadow);
	border-radius: 2px;
	margin: 0;
	direction: ltr;
}

.page .canvasWrapper {
	position: absolute;
	inset: 0;
	overflow: hidden;
	z-index: 0;
}

.page .pdf-canvas {
	display: block;
}

/* Dark mode (host sets .pdf-dark on the container): render the pages themselves dark by inverting
   the rasterized canvas — invert() flips white paper to near-black and text to off-white, and
   hue-rotate(180deg) flips the inverted hues back so colors stay recognizable (blue stays blue).
   ONLY the canvas is filtered: the text layer, selection highlights, SyncTeX flash overlay and
   annotation links sit above it and keep their true colors. */
.pdf-renderer-container.pdf-dark .page {
	background-color: #1c1d20; /* pre-render placeholder — don't flash white while a page rasterizes */
}
.pdf-renderer-container.pdf-dark .pdf-canvas {
	filter: invert(94%) hue-rotate(180deg);
}

/* Text layer — styles from PDF.js 5.x pdf_viewer.css. IMPORTANT: since pdf.js 5 the core TextLayer
   no longer sets inline font-size/transform on spans; it only sets CSS custom properties
   (--font-height, --scale-x, --rotate) and RELIES on the stylesheet below to turn them into the
   actual font-size and transform. Without these rules every span renders at the inherited 16px with
   no horizontal scaling — invisible-text spans far longer than the glyphs beneath them, selections
   that don't line up, and garbage double-click word capture. Keep in sync with pdf_viewer.css. */
.textLayer {
	position: absolute;
	text-align: initial;
	inset: 0;
	overflow: clip;
	opacity: 1;
	line-height: 1;
	-webkit-text-size-adjust: none;
	-moz-text-size-adjust: none;
	text-size-adjust: none;
	forced-color-adjust: none;
	transform-origin: 0 0;
	caret-color: CanvasText;
	z-index: 2;

	/* --min-font-size is overridden inline by the TextLayer core; these defaults keep the calc valid. */
	--min-font-size: 1;
	--text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
	--min-font-size-inv: calc(1 / var(--min-font-size));
}

/* Text layer rotation transforms */
.textLayer[data-main-rotation='90'] {
	transform: rotate(90deg) translateY(-100%);
}

.textLayer[data-main-rotation='180'] {
	transform: rotate(180deg) translate(-100%, -100%);
}

.textLayer[data-main-rotation='270'] {
	transform: rotate(270deg) translateX(-100%);
}

.textLayer :is(span, br) {
	color: transparent;
	position: absolute;
	white-space: pre;
	cursor: text;
	transform-origin: 0% 0%;
}

/* The sizing/scaling contract with the pdf.js 5.x TextLayer core: consume the per-span custom
   properties it emits. This is what makes the invisible text match the rendered glyphs. */
.textLayer > :not(.markedContent),
.textLayer .markedContent span:not(.markedContent) {
	z-index: 1;

	--font-height: 0;
	font-size: calc(var(--text-scale-factor) * var(--font-height));

	--scale-x: 1;
	--rotate: 0deg;
	transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}

.textLayer .markedContent {
	display: contents;
}

.textLayer span[role='img'] {
	-webkit-user-select: none;
	-moz-user-select: none;
	user-select: none;
	cursor: default;
}

/* Selection sink (see TextLayerBuilder in pdf.js): sits below the spans and, while the user drags a
   selection ('selecting' on the layer), expands over the whole page so the browser anchors the
   selection inside this layer instead of jumping to whatever element happens to be underneath. */
.textLayer .endOfContent {
	display: block;
	position: absolute;
	inset: 100% 0 0;
	z-index: 0;
	cursor: default;
	-webkit-user-select: none;
	-moz-user-select: none;
	user-select: none;
}

.textLayer.selecting .endOfContent {
	top: 0;
}

.textLayer ::-moz-selection {
	background: rgba(0, 0, 255, 0.25);
}

.textLayer ::selection {
	background: rgba(0, 0, 255, 0.25);
}

.textLayer br::-moz-selection,
.textLayer br::selection {
	background: transparent;
}

/* Search highlights */
.textLayer .highlight {
	margin: -1px;
	padding: 1px;
	background-color: rgba(255, 255, 0, 0.4);
	border-radius: 4px;
}

.textLayer .highlight.appended {
	position: initial;
}

.textLayer .highlight.selected {
	background-color: rgba(255, 128, 0, 0.6);
}

.textLayer .highlight.begin {
	border-radius: 4px 0 0 4px;
}

.textLayer .highlight.end {
	border-radius: 0 4px 4px 0;
}

.textLayer .highlight.middle {
	border-radius: 0;
}

/* Annotation Layer - for links, form widgets, popups */
.annotationLayer {
	--annotation-unfocused-field-background: url("data:image/svg+xml;charset=UTF-8,<svg width='1px' height='1px' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' style='fill:rgba(0, 54, 255, 0.13);'/></svg>");
	--input-focus-border-color: Highlight;
	--input-focus-outline: 1px solid Canvas;
	--input-unfocused-border-color: transparent;
	--input-disabled-border-color: transparent;
	--input-hover-border-color: black;

	position: absolute;
	top: 0;
	left: 0;
	pointer-events: none;
	transform-origin: 0 0;
	z-index: 3;
}

.annotationLayer[data-main-rotation='90'] .norotate {
	transform: rotate(270deg) translateX(-100%);
}
.annotationLayer[data-main-rotation='180'] .norotate {
	transform: rotate(180deg) translate(-100%, -100%);
}
.annotationLayer[data-main-rotation='270'] .norotate {
	transform: rotate(90deg) translateY(-100%);
}

.annotationLayer section {
	position: absolute;
	text-align: initial;
	pointer-events: auto;
	box-sizing: border-box;
	transform-origin: 0 0;
	user-select: none;
}

/* Link annotations */
.annotationLayer .linkAnnotation > a,
.annotationLayer .buttonWidgetAnnotation.pushButton > a {
	position: absolute;
	font-size: 1em;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
}

.annotationLayer .linkAnnotation > a:hover,
.annotationLayer .buttonWidgetAnnotation.pushButton > a:hover {
	opacity: 0.2;
	background-color: rgb(255 255 0);
	box-shadow: 0 2px 10px rgb(255 255 0);
}

.annotationLayer .linkAnnotation.hasBorder:hover {
	background-color: rgb(255 255 0 / 0.2);
}

/* Text annotations (comments/notes) */
.annotationLayer .textAnnotation img {
	position: absolute;
	cursor: pointer;
	width: 100%;
	height: 100%;
	top: 0;
	left: 0;
}

/* Form widgets */
.annotationLayer .textWidgetAnnotation input,
.annotationLayer .textWidgetAnnotation textarea,
.annotationLayer .choiceWidgetAnnotation select,
.annotationLayer .buttonWidgetAnnotation.checkBox input,
.annotationLayer .buttonWidgetAnnotation.radioButton input {
	background-image: var(--annotation-unfocused-field-background);
	border: 2px solid var(--input-unfocused-border-color);
	box-sizing: border-box;
	font: calc(9px * var(--total-scale-factor)) sans-serif;
	height: 100%;
	margin: 0;
	vertical-align: top;
	width: 100%;
}

.annotationLayer .textWidgetAnnotation input:hover,
.annotationLayer .textWidgetAnnotation textarea:hover,
.annotationLayer .choiceWidgetAnnotation select:hover,
.annotationLayer .buttonWidgetAnnotation.checkBox input:hover,
.annotationLayer .buttonWidgetAnnotation.radioButton input:hover {
	border: 2px solid var(--input-hover-border-color);
}

.annotationLayer .textWidgetAnnotation input:focus,
.annotationLayer .textWidgetAnnotation textarea:focus,
.annotationLayer .choiceWidgetAnnotation select:focus {
	background: none;
	border: 2px solid var(--input-focus-border-color);
	border-radius: 2px;
	outline: var(--input-focus-outline);
}

.annotationLayer .textWidgetAnnotation textarea {
	resize: none;
}

.annotationLayer .buttonWidgetAnnotation.radioButton input {
	border-radius: 50%;
}

.annotationLayer .buttonWidgetAnnotation.checkBox input,
.annotationLayer .buttonWidgetAnnotation.radioButton input {
	appearance: none;
}

/* Popup annotations */
.annotationLayer .popupAnnotation {
	position: absolute;
	font-size: calc(9px * var(--total-scale-factor));
	pointer-events: none;
	width: max-content;
	max-width: 45%;
	height: auto;
}

.annotationLayer .popup {
	background-color: rgb(255 255 153);
	box-shadow: 0 calc(2px * var(--total-scale-factor)) calc(5px * var(--total-scale-factor)) rgb(136 136 136);
	border-radius: calc(2px * var(--total-scale-factor));
	outline: 1.5px solid rgb(255 255 74);
	padding: calc(6px * var(--total-scale-factor));
	cursor: pointer;
	font: message-box;
	white-space: normal;
	word-wrap: break-word;
	pointer-events: auto;
}

.annotationLayer .popup > .header {
	display: inline-block;
}

.annotationLayer .popup > .header > .title {
	font-weight: bold;
}

.annotationLayer .popupContent {
	border-top: 1px solid rgb(51 51 51);
	margin-top: calc(2px * var(--total-scale-factor));
	padding-top: calc(2px * var(--total-scale-factor));
}

.annotationLayer .popupTriggerArea {
	cursor: pointer;
}
`;
