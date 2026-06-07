import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import { App, FileSystemAdapter } from "obsidian";
import MyPlugin from "main";

type KnowledgeEntry = {
	commentHandwriteName: string;
	commentStr: string;
	content: string;
	creationTime: number;
	dataMD5: string;
	handwriteMD5: string;
	id: number;
	knowledgeBaseUniqueAttribute: string;
	lastModifiedTime: number;
	metadata: string;
	pendingSync: boolean;
	serviceId: number;
	sourcePage: string;
	sourcePath: string;
	sourceType: number;
	state: number;
	syncLock: boolean;
	syncState: number;
};

export default async function readBackup(
	pathToBackup: string,
	app: App,
	plugin: MyPlugin,
) {
	const defaultFolderPath = "SN/Digests";

	// check if Digests folder exists folder exists
	if (!(await app.vault.adapter.exists(defaultFolderPath))) {
		await app.vault.createFolder(defaultFolderPath);
	}

	const buffer = fs.readFileSync(pathToBackup);
	const zip = await JSZip.loadAsync(buffer);

	const knowledgeFile: KnowledgeEntry[] = JSON.parse(
		(await zip.file("backup/DIGEST/knowledge.json")?.async("string")) ??
			"[]",
	);

	knowledgeFile.forEach((knowledge) => {
		const markPath = "backup/DIGEST/handwrite/";

		const markFile = zip.file(markPath + knowledge.commentHandwriteName);

		// Get Template
		const templatePath = path.join(
			(app.vault.adapter as FileSystemAdapter).getBasePath(),
			plugin.manifest.dir ?? "",
			"template/digest.md",
		);
		const template = fs.readFileSync(templatePath, "utf-8");

		// Fill In Template
		const dataFilledTemplate = template
			.replace("<SOURCE>", knowledge.sourcePath)
			.replace("<SOURCE_PAGE>", knowledge.sourcePage)
			.replace(
				"<CREATED_ON>",
				new Date(knowledge.creationTime).toISOString(),
			)
			.replace("<HIGHLIGHT>", knowledge.content)
			.replace("<SOURCE_ID>", knowledge.serviceId.toString());

		const notePath =
			defaultFolderPath +
			"/" +
			knowledge.commentHandwriteName.replace(".mark", ".md");

		console.log(notePath);

		app.vault.create(notePath, dataFilledTemplate);
	});

	return path;
}
