// 把 src 里的样式和脚本内联进 index.html，生成 dist/ 和测试页 dev/test.html，再打成 zip
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const read = p => readFileSync(join(root, p), "utf8");
const tpl = read("src/index.html");
const css = read("src/style.css");
const rules = JSON.parse(read("rules.json")).rules;
const placeholder = "data:image/jpeg;base64," + readFileSync(join(root, "assets/placeholder.jpg")).toString("base64");
const npcCovers = [1, 2, 3].map(i => "data:image/jpeg;base64," + readFileSync(join(root, `assets/cover${i}.jpg`)).toString("base64"));
const js = read("src/app.js").replace("/*__PLACEHOLDER__*/", () => placeholder).replace('["/*__NPC_COVERS__*/"]', () => JSON.stringify(npcCovers)).replace("/*__VERSION__*/", () => JSON.parse(read("manifest.json")).version)
  // 整套规则打进 app，随请求发送：不依赖宿主把它挂进用户自己的预设（设置里可改成只用预设）
  .replace('"/*__INLINE_RULES__*/"', () => JSON.stringify(rules));
const NAMES = { world: "平台规则", feed: "首页刷新", comments: "评论区", reaction: "用户发博后的反应", reply: "回复评论", profile: "角色主页", hot: "热搜榜", topic: "话题页", search: "搜索", npc: "路人主页", dm: "私信聊天", super: "超话", charalt: "角色小号" };
const presets = Object.entries(rules).map(([scene, content]) => ({
  // charalt 换了 id：旧 id 在用户预设里可能留下「在条目里、不在排序里」的隐形残留，宿主会当成已存在跳过
  id: scene === "charalt" ? "weibo-charalt2" : `weibo-${scene}`, name: `微博：${NAMES[scene] || scene}`, content, enabled: true,
  tags: scene === "world" ? ["nox_weibo"] : ["nox_weibo", scene],
}));
const fill = mock => tpl.replace("/*__CSS__*/", () => css).replace("/*__JS__*/", () => js).replace("<!--__MOCK__-->", () => mock);

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), fill(""));
writeFileSync(join(root, "dist/presets.json"), JSON.stringify({ presets }, null, 2) + "\n");
copyFileSync(join(root, "manifest.json"), join(root, "dist/manifest.json"));
if (existsSync(join(root, "icon.png"))) copyFileSync(join(root, "icon.png"), join(root, "dist/icon.png"));
writeFileSync(join(root, "dev/test.html"), fill(`<script>${read("dev/mock.js")}</script>`));

const version = JSON.parse(read("manifest.json")).version;
const zip = join(root, `weibo-${version}.zip`);
// 同版本的包已经发出去过：拒绝覆盖（先改 manifest 版本号）。只想看测试页就加 --test
if (existsSync(zip) && !process.argv.includes("--test")) { console.error(`${zip} 已经存在：先改 manifest 版本号，别覆盖发出去的包（只要测试页就用 node build.mjs --test）`); process.exit(1); }
if (process.argv.includes("--test")) { console.log("test page only"); process.exit(0); }
execSync(`cd "${join(root, "dist")}" && zip -q -r "${zip}" manifest.json presets.json index.html icon.png`);
// 随站点发布：小手机启动时会按 bundled.json 自动安装/更新
const pub = join(root, "../../public/apps");
mkdirSync(pub, { recursive: true });
copyFileSync(zip, join(pub, "weibo.zip"));
writeFileSync(join(pub, "bundled.json"), JSON.stringify([{ id: JSON.parse(read("manifest.json")).id, version, url: "/apps/weibo.zip" }], null, 2) + "\n");
console.log("built", zip);
