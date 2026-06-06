import JSZip from "jszip";
import * as fs from "fs";
import { App } from "obsidian";

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

export default async function readBackup(path: string, app: App) {
	console.log(path);

	// check if Digests folder exists folder exists
	if (!(await app.vault.adapter.exists("SN/Digests"))) {
		await app.vault.createFolder("SN/Digests");
	}

	const buffer = fs.readFileSync(path);
	const zip = await JSZip.loadAsync(buffer);

	const knowledgeFile: KnowledgeEntry[] = JSON.parse(
		(await zip.file("backup/DIGEST/knowledge.json")?.async("string")) ??
			"[]",
	);

	knowledgeFile.forEach((knowledge) => {
		const markPath = "backup/DIGEST/handwrite/";

		const markFile = zip.file(markPath + knowledge.commentHandwriteName);

		console.log({ knowledge, markFile });
	});

	return path;
}
