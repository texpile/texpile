// a figure's settings from the handle's gear or the context menu: its size, label and caption switches
import type { Component } from 'svelte';
import type { BlockSettingsOffer } from '$lib/editor/canvas';
import { settingsPanelOffer, type PanelProps } from '$lib/editor/visual/extensions/blockHandle/settingsPanelOffer.svelte';
import type { Dialect } from '$lib/editor/visual/dialect';
import { m } from '$lib/paraglide/messages';
import type { ImageMeasure } from '../imageMeasure';
import { imagePluginKey } from '../imagepluginutils';
import type { ImagePluginSettings } from '../types';
import ImageSettingsPopover from './ImageSettingsPopover.svelte';
import { pictureFor } from './imagePicture';

type ImagePanelProps = PanelProps & { dialect: Dialect; measure(): ImageMeasure };

function measureOf(block: PanelProps): ImageMeasure {
	const { view } = block;
	const pos = block.getPos();
	const columnWidth = (pos === undefined ? null : view.canvas.nodeClientRect(pos)?.rect.width) ?? 600;
	const settings = view.state.plugins.find((p) => p.spec.key === imagePluginKey)?.spec.settings as ImagePluginSettings | undefined;
	const picture = settings && pictureFor(view.dom.ownerDocument.defaultView!, settings, block.node);
	return { columnWidth, natural: picture?.state === 'ready' ? { width: picture.width, height: picture.height } : null };
}

export function imageSettingsOffer(dialect: Dialect): BlockSettingsOffer {
	return settingsPanelOffer<ImagePanelProps>({
		nodeType: 'image',
		label: () => m.imageoverlay_settings_title(),
		component: ImageSettingsPopover as unknown as Component<ImagePanelProps>,
		opener: 'open',
		props: (block) => ({
			view: block.view,
			getPos: block.getPos,
			get node() {
				return block.node;
			},
			dialect,
			measure: () => measureOf(block)
		})
	});
}
