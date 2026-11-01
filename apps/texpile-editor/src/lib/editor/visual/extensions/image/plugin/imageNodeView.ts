/* eslint-disable no-param-reassign -- the node view initializes the img element it is handed */
import { TextSelection } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { missingImageSvg } from '../missingImagePlaceholder';
import { fileUrlExists, pathOfFileUrl } from '$lib/editor/visual/fileAccess';
import { fileUriOf } from '$lib/files/identity/fileUris';
import { extUri } from '$lib/files/identity/extUri';
import type { FileOperationEvent } from '$lib/files/changes/fileOperations';
import type { FileChangesEvent } from '$lib/files/changes/fileChanges';
import { FILES_ARRIVED } from '$lib/editor/visual/fileAccess';
import { ImagePluginClassName, type ImagePluginSettings } from '../types';
import { createResizeControls } from './resize/createResizeControls';
import { getImageDimensions } from './resize/getImageDimensions';
import { getMaxWidth } from './resize/getMaxWidth';
import { calculateImageDimensions } from './resize/calculateImageDimensions';
import { fileService } from '$lib/files/service/fileService';
import { forgetShown, knownShownUrl, shownImageUrl } from '../crop/croppedImage';
import { START_IMAGE_CROP, startPaperCrop } from '../crop/paperCrop';

function getSrc(
	image: HTMLImageElement,
	pluginSettings: ImagePluginSettings,
	node: Node,
	root: Element,
	view: EditorView
): { newSrc: Promise<string>; appliedClass?: string } {
	if (pluginSettings.downloadImage) {
		let appliedClass;
		if (pluginSettings.downloadPlaceholder) {
			if (pluginSettings.enableResize && node.attrs.width && node.attrs.height) {
				const maxWidth = getMaxWidth(root, pluginSettings);
				const finalDimensions = calculateImageDimensions(
					maxWidth,
					maxWidth,
					node.attrs.width,
					node.attrs.height,
					pluginSettings,
					node.attrs.width,
					node.attrs.height
				);

				image.style.height = `${finalDimensions.height}px`;

				image.style.width = `${finalDimensions.width}px`;
			}
			const placeholder = pluginSettings.downloadPlaceholder(node.attrs.src, view);
			if (typeof placeholder === 'string') {
				image.src = placeholder;
			} else if (typeof placeholder === 'object') {
				if ('src' in placeholder && typeof placeholder.src === 'string') {
					image.src = placeholder.src;
				}
				if ('className' in placeholder && typeof placeholder.className === 'string') {
					appliedClass = placeholder.className;

					image.className = `${image.className} ${appliedClass}`;
				}
			}
		}
		return {
			newSrc: pluginSettings.downloadImage(node.attrs.src),
			appliedClass
		};
	}
	return { newSrc: node.attrs.src };
}

// each url's natural size once drawn, so the same picture built again is drawn at once at its size
const drawnSizes = new Map<string, { width: number; height: number; completed: boolean }>();

export function imageNodeView(pluginSettings: ImagePluginSettings) {
	return (node: Node, view: EditorView, getPos: () => number | undefined): NodeView => {
		let finalSrc: string | undefined;
		let currentNodeSrc: string = node.attrs.src;
		let currentNode = node;
		let currentCropKey = pluginSettings.cropFormat?.key(node) ?? '';
		const root = document.createElement('div');
		root.className = ImagePluginClassName.IMAGE_PLUGIN_ROOT;
		const image = document.createElement('img');
		image.className = ImagePluginClassName.IMAGE_PLUGIN_IMG;
		image.contentEditable = 'false';
		let resizeActive = false;
		function setResizeActive(value: boolean) {
			resizeActive = value;
		}
		root.appendChild(image);

		// failed loads show the bundled placeholder, re-checked on folder changes so a stale
		// cached image doesn't linger
		let notFound = false;
		function showNotFound() {
			if (notFound) return; // already showing the placeholder
			notFound = true;
			image.src = missingImageSvg(node.attrs.src);
			image.classList.add('image-not-found');
			image.title = `File not found: ${node.attrs.src}`;
			// the controls were sized from the missing image's synthetic dimensions while the
			// placeholder sizes itself (auto !important) - a large orphan outline over the text
			resizeControls?.remove();
			resizeControls = undefined;
		}
		image.addEventListener('error', showNotFound);
		async function revalidate() {
			if (!finalSrc || /^(data:|blob:)/.test(finalSrc)) return; // placeholders / inline data never go missing
			try {
				if (!(await fileUrlExists(finalSrc))) return showNotFound();
				if (notFound) {
					// file came back: bust the cache and show it again
					notFound = false;
					image.classList.remove('image-not-found');
					image.title = node.attrs.alt ?? '';
					const freshSrc = `${finalSrc}${finalSrc.includes('?') ? '&' : '?'}_=${Date.now()}`;
					await show(freshSrc);
				}
			} catch {
				showNotFound();
			}
		}
		function onFolderChanged() {
			return void revalidate();
		}
		// written by the image tab or another program: drawn again from the new bytes
		function shownFile(): ReturnType<typeof fileUriOf> | null {
			const path = finalSrc ? pathOfFileUrl(finalSrc) : null;
			return path ? fileUriOf(path) : null;
		}
		function redrawFile(): void {
			if (!finalSrc || notFound) return;
			forgetShown(finalSrc);
			void show(`${finalSrc}${finalSrc.includes('?') ? '&' : '?'}_=${Date.now()}`);
		}
		function onOperation(e: FileOperationEvent) {
			const file = shownFile();
			if (file && e.isOperation('write') && extUri.isEqual(e.resource, file)) redrawFile();
			else onFolderChanged();
		}
		function onFilesChange(e: FileChangesEvent) {
			const file = shownFile();
			if (file && e.contains(file, 'updated')) redrawFile();
		}
		const offOperations = fileService.onDidRunOperation(onOperation);
		const offChanges = fileService.onDidFilesChange(onFilesChange);
		window.addEventListener('focus', onFolderChanged);
		// a guest's picture comes from the host after the first lookup came up empty
		async function lookUpAgain(): Promise<void> {
			if ((!notFound && finalSrc) || !pluginSettings.downloadImage) return;
			const src = await pluginSettings.downloadImage(node.attrs.src);
			if (!src) return;
			const shown = await shownImageUrl(src, currentNode, pluginSettings.cropFormat);
			const size = pluginSettings.enableResize ? await getImageDimensions(shown) : undefined;
			if (size && !size.completed) return;
			notFound = false;
			image.classList.remove('image-not-found');
			image.title = node.attrs.alt ?? '';
			finalSrc = src;
			dimensions = size;
			image.src = shown;
			updateDom();
		}
		function onFilesArrived() {
			return void lookUpAgain();
		}
		window.addEventListener(FILES_ARRIVED, onFilesArrived);

		let dimensions: { width: number; height: number; completed: boolean } | undefined;
		Object.keys(node.attrs).map((key) => root.setAttribute(`imageplugin-${key}`, node.attrs[key]));
		const contentEl = pluginSettings.hasTitle && document.createElement('div');
		if (contentEl) {
			contentEl.className = 'imagePluginContent';
			contentEl.addEventListener('click', (e) => {
				const pos = getPos();
				if (!pos || contentEl.innerText.length > 1) {
					return;
				}
				e.preventDefault();
				view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos + 1))));
				view.focus();
			});
			contentEl.className = 'text';
			root.appendChild(contentEl);
		}

		const overlay = pluginSettings.createOverlay(node, getPos, view);
		if (overlay) {
			root.appendChild(overlay);
			pluginSettings.updateOverlay(overlay, getPos, view, node);
		}

		image.alt = node.attrs.alt ?? '';
		let resizeControls: HTMLDivElement | undefined;
		function updateDom() {
			if (resizeActive) {
				return;
			}
			if (notFound) {
				// no resize chrome around the placeholder; revalidate rebuilds it if the file returns
				resizeControls?.remove();
				resizeControls = undefined;
				return;
			}

			const pos = getPos();
			if (!pos || (pluginSettings.enableResize && !dimensions)) {
				return;
			}

			const updatedNode = view.state.doc.nodeAt(pos);

			if (!updatedNode) {
				return;
			}

			Object.keys(updatedNode.attrs).map((attr) => root.setAttribute(`imageplugin-${attr}`, updatedNode.attrs[attr]));

			if (pluginSettings.enableResize && dimensions) {
				const maxWidth = getMaxWidth(root, pluginSettings);
				const finalDimensions = calculateImageDimensions(
					maxWidth,
					maxWidth,
					dimensions.width,
					dimensions.height,
					pluginSettings,
					updatedNode.attrs.width,
					updatedNode.attrs.height,
					updatedNode.attrs.maxWidth
				);
				image.style.height = `${finalDimensions.height}px`;
				image.style.width = `${finalDimensions.width}px`;
				if (resizeControls) {
					resizeControls.remove();
				}
				resizeControls = createResizeControls(
					finalDimensions.height,
					finalDimensions.width,
					getPos,
					updatedNode,
					view,
					image,
					setResizeActive,
					maxWidth,
					pluginSettings
				);
				root.appendChild(resizeControls);
			}
		}
		// the url drawn with its trim and turn; finalSrc stays the whole image
		async function show(src: string): Promise<void> {
			const shown = await shownImageUrl(src, currentNode, pluginSettings.cropFormat);
			if (pluginSettings.enableResize) {
				dimensions = await getImageDimensions(shown);
				if (dimensions.completed) drawnSizes.set(shown, dimensions);
			}
			image.src = shown;
			updateDom();
		}
		let endCrop: (() => void) | undefined;
		root.addEventListener(START_IMAGE_CROP, () => {
			const format = pluginSettings.cropFormat;
			if (endCrop || !finalSrc || notFound || !format) return;
			const target = {
				root,
				url: finalSrc,
				shownWidth: image.offsetWidth,
				maxWidth: getMaxWidth(root, pluginSettings),
				view,
				getPos,
				format
			};
			endCrop = startPaperCrop(target, () => (endCrop = undefined));
		});
		let unsubscribeResizeObserver: (() => void) | undefined;
		(async () => {
			const { newSrc, appliedClass } = getSrc(image, pluginSettings, node, root, view);
			finalSrc = await newSrc;
			if (appliedClass) {
				image.className = image.className
					.split(' ')
					.filter((c: string) => c !== appliedClass)
					.join(' ');
			}
			await show(finalSrc);
			const parent = root.parentElement;
			if (!parent || !pluginSettings.enableResize) return;
			unsubscribeResizeObserver = pluginSettings.resizeCallback(parent, updateDom);
		})();
		// the text around it would otherwise be drawn a frame without it, then pushed down; the lookup above still runs
		const known = pluginSettings.knownImage?.(node.attrs.src) ?? null;
		const knownShown = known ? knownShownUrl(known, currentNode, pluginSettings.cropFormat) : null;
		const knownSize = knownShown ? drawnSizes.get(knownShown) : undefined;
		if (known && knownShown && (knownSize || !pluginSettings.enableResize)) {
			finalSrc = known;
			dimensions = knownSize;
			image.decoding = 'sync';
			image.src = knownShown;
			// once ProseMirror has put it on the page, which its width is measured from
			queueMicrotask(updateDom);
		}
		return {
			...(contentEl
				? {
						contentDOM: contentEl,
						selectable: true,
						content: 'text*'
					}
				: {}),
			stopEvent: (e: Event) => e.target === contentEl || (e.target instanceof Element && !!e.target.closest('.paper-cropper')),
			dom: root,
			update: (updateNode: Node) => {
				if (updateNode.type.name !== 'image' || !finalSrc) {
					return false;
				}

				const cropKey = pluginSettings.cropFormat?.key(updateNode) ?? '';
				const cropChanged = cropKey !== currentCropKey;
				currentCropKey = cropKey;
				currentNode = updateNode;
				// src changed (e.g. a foreign image was copied), re-resolve the url
				if (updateNode.attrs.src !== currentNodeSrc) {
					currentNodeSrc = updateNode.attrs.src;
					if (pluginSettings.downloadImage) {
						pluginSettings.downloadImage(updateNode.attrs.src).then((newUrl) => {
							finalSrc = newUrl;
							void show(newUrl);
						});
					}
				} else if (cropChanged) {
					void show(finalSrc);
				}

				if (overlay) pluginSettings.updateOverlay(overlay, getPos, view, updateNode);
				updateDom();
				return true;
			},
			ignoreMutation: () => true,
			destroy: () => {
				endCrop?.();
				unsubscribeResizeObserver?.();
				offOperations();
				offChanges();
				window.removeEventListener(FILES_ARRIVED, onFilesArrived);
				window.removeEventListener('focus', onFolderChanged);
				pluginSettings.deleteSrc(node.attrs.src);
			}
		};
	};
}
