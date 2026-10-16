// 把 src 里的样式和脚本内联进 index.html，生成 dist/ 和测试页 dev/test.html，再打成 zip（同版本 zip 存在就拒绝，别覆盖发出去的包）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), "utf8");
const version = JSON.parse(read("manifest.json")).version;
const js = read("src/app.js").replace("/*__VERSION__*/", () => version);
const css = read("src/style.css");
const fill = mock => read("src/index.html").replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js).replace("<!--__MOCK__-->", () => mock);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), fill(""));
copyFileSync(join(root, "manifest.json"), join(root, "dist/manifest.json"));
if (existsSync(join(root, "icon.png"))) copyFileSync(join(root, "icon.png"), join(root, "dist/icon.png"));
writeFileSync(join(root, "dev/test.html"), fill(`<script>${read("dev/mock.js")}</script>`));
if (process.argv.includes("--test")) process.exit(0);

const zip = join(root, `qq-${version}.zip`);
if (existsSync(zip)) { console.error(`${zip} 已经存在：先改 manifest 版本号，别覆盖旧包`); process.exit(1); }
execSync(`cd "${join(root, "dist")}" && zip -q -r "${zip}" manifest.json index.html${existsSync(join(root, "icon.png")) ? " icon.png" : ""}`);
console.log("built", zip);
