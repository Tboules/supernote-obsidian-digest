/*
 * Supernote file-format types.
 *
 * Trimmed from supernote-typescript by Brandon Philips
 * (https://github.com/philips/supernote-typescript), licensed GPL-3.0-or-later.
 * Only the fields needed to render page bitmaps are kept.
 */

export type LayerName = "MAINLAYER" | "LAYER1" | "LAYER2" | "LAYER3" | "BGLAYER";

export const LAYER_NAMES: LayerName[] = [
	"MAINLAYER",
	"LAYER1",
	"LAYER2",
	"LAYER3",
	"BGLAYER",
];

export type KeyValues = Record<string, string | string[]>;

export interface SupernoteLayer {
	/** Layer name, e.g. MAINLAYER or BGLAYER. */
	LAYERNAME: string;
	/** Bitmap encoding, usually RATTA_RLE. */
	LAYERPROTOCOL: string;
	/** Raw (still encoded) bitmap bytes, or null when the layer is empty. */
	bitmapBuffer: Uint8Array | null;
}

export interface SupernotePage {
	/** Page template; custom templates start with "user_" and are stored as PNG. */
	PAGESTYLE: string;
	/** Device orientation code; 1090 and 1270 are landscape. */
	ORIENTATION: string;
	/** Layer stacking order, top first. */
	LAYERSEQ: LayerName[];
	layers: Record<LayerName, SupernoteLayer>;
}

export interface SupernoteFile {
	/** File signature, e.g. markSN_FILE_VER_20230015. */
	signature: string;
	/** Format version in YYYYmmdd form. */
	version: number;
	pageWidth: number;
	pageHeight: number;
	header: KeyValues;
	pages: SupernotePage[];
}
