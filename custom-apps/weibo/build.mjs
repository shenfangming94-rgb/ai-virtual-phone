// 把 src 里的样式和脚本内联进 index.html，生成 dist/ 和测试页 dev/test.html，再打成 zip
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), "utf8");
const tpl = read("src/index.html");
const css = read("src/style.css");
const js = read("src/app.js");
const fill = mock => tpl.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js).replace("<!--__MOCK__-->", () => mock);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), fill(""));
copyFileSync(join(root, "manifest.json"), join(root, "dist/manifest.json"));
copyFileSync(join(root, "presets.json"), join(root, "dist/presets.json"));
if (existsSync(join(root, "icon.png"))) copyFileSync(join(root, "icon.png"), join(root, "dist/icon.png"));
writeFileSync(join(root, "dev/test.html"), fill(`<script>${read("dev/mock.js")}</script>`));

const version = JSON.parse(read("manifest.json")).version;
const zip = join(root, `weibo-${version}.zip`);
if (existsSync(zip)) rmSync(zip);
execSync(`cd "${join(root, "dist")}" && zip -q -r "${zip}" manifest.json presets.json index.html icon.png`);
console.log("built", zip);
