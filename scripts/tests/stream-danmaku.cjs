const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("lib/idol-world.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const stubs = {
  "./character-storage": { HIDDEN_WORLD_CHAR_ID: "__world__", loadAllCharacters: () => [], saveCharacters: () => {} },
  "./idol-scenes": { parseReply: text => ({ text: text.replace(/\[時間[:：][^\]]*\]/g, "").replace(/\[收尾\]/g, "").trim(), newFaces: [], minutes: 0, closing: false, facts: [] }) },
  "./idol-kakao": { extractKakaoTags: text => ({ text, tags: {} }) },
};
const loadedModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: loadedModule,
  exports: loadedModule.exports,
  require: id => stubs[id] ?? {},
  console,
}, { filename: "lib/idol-world.ts" });

const raw = "弹幕飘过。[弹幕:이분 누구예요?|这位女生是谁？；둘이 진짜 친한가 봐ㅋㅋ|两个人看起来好熟ㅋㅋ]";
const parsed = loadedModule.exports.extractSceneTags(raw);
assert.equal(parsed.text, "弹幕飘过。");
assert.deepEqual(JSON.parse(JSON.stringify(parsed.tags.danmaku)), [
  { ko: "이분 누구예요?", zh: "这位女生是谁？" },
  { ko: "둘이 진짜 친한가 봐ㅋㅋ", zh: "两个人看起来好熟ㅋㅋ" },
]);
assert.ok(!parsed.text.includes("[弹幕:"), "hidden danmaku marker should not enter the dialogue");
console.log("PASS: live chat extracts paired Korean/Chinese danmaku and removes the hidden marker from dialogue.");
