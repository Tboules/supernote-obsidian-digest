import { execSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const submodulePath = path.join(root, "supernote-typescript");
const linkTarget = path.join(root, "node_modules", "supernote-typescript");
const relativeLinkSource = path.join("..", "supernote-typescript");

function run(cmd, cwd) {
	console.log(`$ ${cmd}`);
	execSync(cmd, { cwd, stdio: "inherit" });
}

// 1. Make sure the submodule is actually checked out (an uninitialized
// submodule is just an empty directory).
if (!existsSync(path.join(submodulePath, "package.json"))) {
	run("git submodule update --init --recursive", root);
}

// 2. Install its deps. --ignore-scripts because v8-profiler-next (a
// vitest-coverage devDependency, unrelated to building the library) fails
// to compile its native bindings against newer Node/clang and isn't needed
// just to run `tsc`.
run("npm install --ignore-scripts", submodulePath);

// 3. Build the library (tsc -> lib/*.js + lib/*.d.ts).
run("npm run build", submodulePath);

// 4. Drop the submodule's own nested image-js install. If it's left in
// place, root code and the submodule's emitted .d.ts files each resolve
// "image-js" to a *different* installed copy, and TypeScript treats their
// (structurally identical) classes as incompatible types because of private
// field nominal typing. Deleting it makes both sides resolve to the single
// copy in root node_modules instead (Node's module resolution walks up).
const nestedImageJs = path.join(submodulePath, "node_modules", "image-js");
if (existsSync(nestedImageJs)) {
	rmSync(nestedImageJs, { recursive: true, force: true });
}

// 5. Link the built submodule into root node_modules. Plain `npm link`
// needs a writable global npm prefix, which isn't available on a
// Nix-managed Node install, so symlink directly instead.
if (existsSync(linkTarget)) {
	const stat = lstatSync(linkTarget);
	const alreadyLinked = stat.isSymbolicLink() && readlinkSync(linkTarget) === relativeLinkSource;
	if (!alreadyLinked) {
		rmSync(linkTarget, { recursive: true, force: true });
	}
}
if (!existsSync(linkTarget)) {
	symlinkSync(relativeLinkSource, linkTarget, "dir");
}

console.log("supernote-typescript is built and linked into node_modules.");
