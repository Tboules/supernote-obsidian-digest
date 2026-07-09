export const TEMPLATE_VARIABLES = {
	atlasHead: "{{head}}",
	atlasTitle: /{{title}}/g,
	source: /{{SOURCE}}/g,
	sourcePage: "{{SOURCE_PAGE}}",
	createdOn: "{{CREATED_ON}}",
	sourceId: "{{SOURCE_ID}}",
	highlight: "{{HIGHLIGHT}}",
	imagePath: "{{IMAGE_PATH}}",
};

export const HEAD_ATLAS_FILE = "supernote_digests";

export const TEMPLATE_PATHS = {
	atlas: "template/atlas_template.md",
	atomic: "template/atomic_template.md",
	docHead: "template/document_header.md",
	docBody: "template/digest.md",
};

export const PATH_TO_KNOWLEDGE_FILE = "backup/DIGEST/knowledge.json";
export const PATH_TO_MARK_FILES = "backup/DIGEST/handwrite/";
export const FRONTMATTER_GENERATED_BY = "supernote-obsidian-digest";
