import { createHash } from "crypto";
import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { parseSupernote } from "../src/supernote/parse.ts";
import { decodeRattaRle, renderPage } from "../src/supernote/render.ts";

// digest_test.mark comes from the supernote-typescript test inputs.
const markFile = new Uint8Array(
	readFileSync(new URL("./fixtures/digest_test.mark", import.meta.url)),
);

describe("parseSupernote", () => {
	it("parses a .mark file", () => {
		const mark = parseSupernote(markFile);

		expect(mark.signature.startsWith("markSN_FILE_VER_")).toBe(true);
		expect(mark.pageWidth).toBe(1920);
		expect(mark.pageHeight).toBe(2560);
		expect(mark.pages).toHaveLength(1);
	});

	it("rejects files without a Supernote signature", () => {
		expect(() => parseSupernote(new Uint8Array(64))).toThrow(
			"Signature doesn't match",
		);
	});
});

describe("renderPage", () => {
	it("renders the same pixels as supernote-typescript did", () => {
		const image = renderPage(parseSupernote(markFile), 0);
		const hash = createHash("sha256")
			.update(image.getRawImage().data)
			.digest("hex");

		expect([image.width, image.height]).toEqual([1920, 2560]);
		expect(image.colorModel).toBe("GREYA");
		// SHA-256 of supernote-typescript@1e50176's toImage() output for this file.
		expect(hash).toBe(
			"bf8c88f2c51251613c51fd26315e0e70192ce3e22db447e5d6aab84d235d9266",
		);
	});
});

describe("decodeRattaRle", () => {
	it("expands runs into RGBA pixels", () => {
		// 0x61 (black) x2, then 0x62 (background) x2
		const pixels = decodeRattaRle(new Uint8Array([0x61, 1, 0x62, 1]), 2, 2);

		expect([...pixels]).toEqual([
			0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255,
		]);
	});

	it("throws when the bitmap doesn't fill the page", () => {
		expect(() =>
			decodeRattaRle(new Uint8Array([0x61, 0]), 2, 2),
		).toThrow("doesn't match expected length");
	});
});
