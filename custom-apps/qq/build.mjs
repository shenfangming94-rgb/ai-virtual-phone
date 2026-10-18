// 把 src 里的样式和脚本内联进 index.html，生成 dist/ 和测试页 dev/test.html，再打成 zip（同版本 zip 存在就拒绝，别覆盖发出去的包）
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), "utf8");
const version = JSON.parse(read("manifest.json")).version;
const peng = "data:image/png;base64," + readFileSync(join(root, "assets/penguin.png")).toString("base64");
const js = (read("src/qqshow.js") + "\n" + read("src/pixel.js") + "\n" + read("src/app.js")).replace("/*__VERSION__*/", () => version).replace("/*__PENGUIN__*/", () => peng);
const pixel = "data:font/woff2;base64," + readFileSync(join(root, "assets/pixel.woff2")).toString("base64"); // 像素皮肤用的字（缝合像素，OFL）
// 小手机只读入口页面的前 1800000 个字（多了直接截掉，代码不完整就白屏），所以字体放进包里当单独文件，宿主打开时会把 url("pixel.woff2") 换成真数据；测试页没有宿主，还是内联
const css = font => read("src/style.css") + "\n" + read("src/themes.css").replace("url(/*__PIXEL__*/)", () => `url("${font}")`);
const fill = (mock, font = "pixel.woff2") => read("src/index.html").replace("/*__CSS__*/", () => css(font)).replace("/*__JS__*/", () => js).replace("<!--__MOCK__-->", () => mock);
const HOST_MAX = 1800000;

mkdirSync(join(root, "dist"), { recursive: true });
const html = fill("");
if (html.length > HOST_MAX - 100000) { console.error(`index.html 有 ${html.length} 字，小手机最多读 ${HOST_MAX}，快超了：把大东西挪进包里当单独文件`); process.exit(1); }
writeFileSync(join(root, "dist/index.html"), html);
copyFileSync(join(root, "assets/pixel.woff2"), join(root, "dist/pixel.woff2"));
copyFileSync(join(root, "manifest.json"), join(root, "dist/manifest.json"));
if (existsSync(join(root, "icon.png"))) copyFileSync(join(root, "icon.png"), join(root, "dist/icon.png"));
writeFileSync(join(root, "dev/test.html"), fill(`<script>${read("dev/mock.js")}</script>`, pixel));
if (process.argv.includes("--test")) process.exit(0);

const zip = join(root, `qq-${version}.zip`);
if (existsSync(zip)) { console.error(`${zip} 已经存在：先改 manifest 版本号，别覆盖旧包`); process.exit(1); }
execSync(`cd "${join(root, "dist")}" && zip -q -r "${zip}" manifest.json index.html pixel.woff2${existsSync(join(root, "icon.png")) ? " icon.png" : ""}`);
console.log("built", zip);
