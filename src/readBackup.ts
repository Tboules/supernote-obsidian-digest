import JSZip from "jszip";
import * as fs from "fs";

export default async function readBackup(path: string) {
	console.log(path);
	const buffer = fs.readFileSync(path);
	const zip = await JSZip.loadAsync(buffer);

	console.log(zip.forEach((p, f) => console.log({ p, f })));

	const knowledgeFile = JSON.parse(
		(await zip.file("backup/DIGEST/knowledge.json")?.async("string")) ??
			"[]",
	);

	console.log(knowledgeFile);

	knowledgeFile.forEach(async (knowledge: any) => {
		console.log(knowledge.commentHandwriteName);

		const markPath = "backup/DIGEST/handwrite/";

		const markFile = await zip.file(
			markPath + knowledge.commentHandwriteName,
		);

		console.log(markFile);
	});

	return path;
}
