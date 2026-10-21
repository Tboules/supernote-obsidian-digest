/*
 * Parser for Supernote .note and .mark files.
 *
 * Adapted from supernote-typescript by Brandon Philips
 * (https://github.com/philips/supernote-typescript), licensed GPL-3.0-or-later.
 * Keywords, titles, covers and text recognition were dropped; only what is
 * needed to render page bitmaps is parsed.
 */

import {
	KeyValues,
	LAYER_NAMES,
	LayerName,
	SupernoteFile,
	SupernoteLayer,
	SupernotePage,
} from "./types";

const ADDRESS_SIZE = 4;
const LENGTH_FIELD_SIZE = 4;
const DEFAULT_HEADER_ADDRESS = 24;

// Known vertical orientations are 1000 and 1180.
const HORIZONTAL_ORIENTATIONS = ["1090", "1270"];

function readUint32LE(buffer: Uint8Array, offset: number): number {
	if (offset < 0 || offset + ADDRESS_SIZE > buffer.length) {
		throw new RangeError("Trying to access beyond buffer length");
	}
	return new DataView(
		buffer.buffer,
		buffer.byteOffset,
		buffer.byteLength,
	).getUint32(offset, true);
}

/** Read a length-prefixed block. Address 0 means "no block". */
function blockAt(buffer: Uint8Array, address: number): Uint8Array | null {
	if (!address) return null;
	const length = readUint32LE(buffer, address);
	const start = address + LENGTH_FIELD_SIZE;
	return buffer.subarray(start, start + length);
}

/** Parse a `<KEY:value><KEY:value>` block; repeated keys become arrays. */
function keyValuesAt(buffer: Uint8Array, address: number): KeyValues {
	const block = blockAt(buffer, address);
	if (!block) return {};

	const result: KeyValues = {};
	const text = new TextDecoder("utf8").decode(block);
	for (const [, key, value] of text.matchAll(/<([^:<>]+):([^:<>]+)>/gm)) {
		if (key === undefined || value === undefined) continue;
		const existing = result[key];
		if (existing === undefined) result[key] = value;
		else if (typeof existing === "string") result[key] = [existing, value];
		else existing.push(value);
	}
	return result;
}

function stringValue(values: KeyValues, key: string): string | undefined {
	const value = values[key];
	return typeof value === "string" ? value : undefined;
}

function addressValue(values: KeyValues, key: string): number {
	return parseInt(stringValue(values, key) ?? "0");
}

function parseSignature(buffer: Uint8Array) {
	const signature = new TextDecoder("utf8").decode(buffer.slice(0, 24));
	const match = /^(mark|note)SN_FILE_VER_(\d{8})/.exec(signature);
	if (!match?.[2]) {
		throw new Error("Cannot parse this file. Signature doesn't match.");
	}
	return { signature, version: parseFloat(match[2]) };
}

function parseLayer(buffer: Uint8Array, address: number): SupernoteLayer {
	const values = keyValuesAt(buffer, address);
	return {
		LAYERNAME: stringValue(values, "LAYERNAME") ?? "MAINLAYER",
		LAYERPROTOCOL: stringValue(values, "LAYERPROTOCOL") ?? "RATTA_RLE",
		bitmapBuffer: blockAt(buffer, addressValue(values, "LAYERBITMAP")),
	};
}

function parsePage(buffer: Uint8Array, address: number): SupernotePage {
	const values = keyValuesAt(buffer, address);
	const sequence = stringValue(values, "LAYERSEQ");
	const layers = {} as Record<LayerName, SupernoteLayer>;
	for (const name of LAYER_NAMES) {
		layers[name] = parseLayer(buffer, addressValue(values, name));
	}

	return {
		PAGESTYLE: stringValue(values, "PAGESTYLE") ?? "0",
		ORIENTATION: stringValue(values, "ORIENTATION") ?? "0",
		LAYERSEQ: sequence
			? (sequence.split(",") as LayerName[])
			: [...LAYER_NAMES],
		layers,
	};
}

/** Parse a Supernote .note or .mark file. */
export function parseSupernote(buffer: Uint8Array): SupernoteFile {
	const { signature, version } = parseSignature(buffer);

	// The last 4 bytes point at the footer, which indexes everything else.
	const footer = keyValuesAt(
		buffer,
		readUint32LE(buffer, buffer.length - ADDRESS_SIZE),
	);

	const headerAddress =
		parseInt(stringValue(footer, "FILE_FEATURE") ?? "") ||
		DEFAULT_HEADER_ADDRESS;
	const header = keyValuesAt(buffer, headerAddress);

	// Footer page entries look like PAGE1, PAGE2, ... PAGE10.
	const collator = new Intl.Collator([], { numeric: true });
	const pages = Object.keys(footer)
		.filter((key) => /^PAGE\d+$/.test(key))
		.sort((a, b) => collator.compare(a, b))
		.map((key) => parsePage(buffer, addressValue(footer, key)));

	// Manta (N5) is the first device with a different page size.
	let [pageWidth, pageHeight] =
		stringValue(header, "APPLY_EQUIPMENT") === "N5"
			? [1920, 2560]
			: [1404, 1872];

	// Orientation is stored per page but appears to be uniform per file.
	if (
		pages.every((page) => HORIZONTAL_ORIENTATIONS.includes(page.ORIENTATION))
	) {
		[pageWidth, pageHeight] = [pageHeight, pageWidth];
	}

	return { signature, version, pageWidth, pageHeight, header, pages };
}
