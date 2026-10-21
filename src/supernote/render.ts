/*
 * Renders Supernote pages to image-js images.
 *
 * Adapted from supernote-typescript by Brandon Philips
 * (https://github.com/philips/supernote-typescript), licensed GPL-3.0-or-later.
 * The RATTA_RLE decoder there was itself adopted from
 * https://github.com/jya-dev/supernote-tool.
 */

import { decodePng, Image, ImageColorModel } from "image-js";
import { SupernoteFile, SupernotePage } from "./types";

type Rgba = readonly [number, number, number, number];

const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];
const DARK_GRAY: Rgba = [169, 169, 169, 255];
const GRAY: Rgba = [128, 128, 128, 255];
// Unknown color codes are rendered as fully transparent.
const UNKNOWN: Rgba = [255, 255, 255, 0];

/** Color codes used in RATTA_RLE bitmaps. */
const PALETTE: Record<number, Rgba> = {
	0x61: BLACK,
	0x62: WHITE, // background
	0x63: DARK_GRAY,
	0x64: GRAY,
	0x65: WHITE,
	0x66: BLACK, // marker
	0x67: DARK_GRAY, // marker
	0x68: GRAY, // marker
	0x9d: DARK_GRAY, // X2 series
	0xc9: GRAY, // X2 series
	0x9e: DARK_GRAY, // X2 series marker
	0xca: GRAY, // X2 series marker
};

const SPECIAL_LENGTH_MARKER = 0xff;
const SPECIAL_LENGTH = 0x4000;

/** Decode a RATTA_RLE bitmap into width * height RGBA bytes. */
export function decodeRattaRle(
	buffer: Uint8Array,
	width: number,
	height: number,
): Uint8Array {
	const expectedLength = width * height * 4;
	const output = new Uint8Array(expectedLength);
	let written = 0;

	const emit = (code: number, pixels: number) => {
		const rgba = PALETTE[code] ?? UNKNOWN;
		for (let i = 0; i < pixels; i++) {
			if (written + 4 <= expectedLength) output.set(rgba, written);
			written += 4;
		}
	};

	// A length byte with the high bit set is a "held" run whose real length
	// depends on whether the next pair continues the same color.
	let held: [number, number] | null = null;
	for (let index = 1; index < buffer.length; index += 2) {
		const code = buffer[index - 1]!;
		let length = buffer[index]!;

		if (held !== null) {
			const [heldCode, heldLength]: [number, number] = held;
			held = null;
			if (code === heldCode) {
				emit(code, 1 + length + (((heldLength & 0x7f) + 1) << 7));
				continue;
			}
			emit(heldCode, ((heldLength & 0x7f) + 1) << 7);
		}

		if (length === SPECIAL_LENGTH_MARKER) {
			emit(code, SPECIAL_LENGTH);
		} else if ((length & 0x80) !== 0) {
			held = [code, length];
		} else {
			length += 1;
			emit(code, length);
		}
	}

	// A held run at the very end is truncated to whatever space is left.
	if (held !== null) {
		const [heldCode, heldLength] = held;
		const gap = expectedLength - written;
		for (let shift = 7; shift >= 0; shift--) {
			const length = ((heldLength & 0x7f) + 1) << shift;
			if (length <= gap) {
				emit(heldCode, length);
				break;
			}
		}
	}

	if (written !== expectedLength) {
		throw new Error(
			`Decoded bitmap length ${written} doesn't match expected length ${expectedLength}.`,
		);
	}
	return output;
}

function decodeLayer(
	note: SupernoteFile,
	page: SupernotePage,
	bitmap: Uint8Array,
	layerName: string,
): Image {
	// Custom templates are stored as PNG instead of RATTA_RLE.
	if (layerName === "BGLAYER" && page.PAGESTYLE.startsWith("user_")) {
		return decodePng(bitmap);
	}
	return new Image(note.pageWidth, note.pageHeight, {
		colorModel: ImageColorModel.RGBA,
		data: decodeRattaRle(bitmap, note.pageWidth, note.pageHeight),
	});
}

/** Draw `top` over `bottom` in place; fully transparent black pixels let `bottom` show through. */
function overlay(top: Image, bottom: Image) {
	if (top.width !== bottom.width || top.height !== bottom.height) {
		throw new Error("Images must have the same dimensions for compositing.");
	}
	for (let y = 0; y < bottom.height; y++) {
		for (let x = 0; x < bottom.width; x++) {
			const pixel = top.getPixel(x, y);
			if (pixel.every((channel) => channel === 0)) continue;
			bottom.setPixel(x, y, pixel);
		}
	}
}

/** Render one page (0-based) of a parsed Supernote file as a grey + alpha image. */
export function renderPage(note: SupernoteFile, pageIndex: number): Image {
	const page = note.pages[pageIndex];
	if (!page) {
		throw new Error(`Supernote file has no page ${pageIndex + 1}.`);
	}

	// LAYERSEQ lists layers top first; composite from the bottom up.
	const images = page.LAYERSEQ.flatMap((name) => {
		const layer = page.layers[name];
		const bitmap = layer?.bitmapBuffer;
		return layer && bitmap?.length
			? [decodeLayer(note, page, bitmap, layer.LAYERNAME)]
			: [];
	}).reverse();

	const [bottom, ...rest] = images;
	if (!bottom) {
		throw new Error(`Page ${pageIndex + 1} has no layers to render.`);
	}
	const output = bottom.clone();
	for (const image of rest) overlay(image, output);

	return output.grey({ keepAlpha: true });
}
