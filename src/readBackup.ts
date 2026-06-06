import JSZip from "jszip";
import * as fs from "fs";

export default async function readBackup(path: string) {
	console.log(path);
	const buffer = fs.readFileSync(path);
	const zip = await JSZip.loadAsync(buffer);

	const knowledgeFile = JSON.parse(
		(await zip.file("backup/DIGEST/knowledge.json")?.async("string")) ??
			"[]",
	);

	console.log(knowledgeFile);

	return path;
}
