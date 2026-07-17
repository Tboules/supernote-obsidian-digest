import { App, TFile } from "obsidian";
import MyPlugin from "./main";
import { FRONTMATTER_GENERATED_BY } from "./constants";

export default function cleanDigests(app: App, plugin: MyPlugin) {
	const { pathToAtlas, pathToDigests } = plugin.settings;

	const digests = app.vault.getFolderByPath(pathToDigests);

	const atlasFiles = app.vault.getFolderByPath(pathToAtlas);

	const combinedFiles =
		digests?.children.concat(atlasFiles?.children ?? []) ?? [];

	for (const file of combinedFiles) {
		if (!(file instanceof TFile)) continue;

		if (
			app.metadataCache.getFileCache(file)?.frontmatter?.[
				"generated_by"
			] == FRONTMATTER_GENERATED_BY
		) {
			app.vault.delete(file);
		}
	}
}
