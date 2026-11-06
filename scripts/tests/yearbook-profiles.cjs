const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const file = "lib/idol-roster-live.ts";
const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const stubs = {
  "./kv-db": { kvGet: () => null, kvSet: () => {} },
  "./trainee-card": { loadTraineeCard: () => null },
  "./idol-career": { loadCareer: () => ({ stage: "pre" }) },
  "./idol-people": { createPerson: () => ({}), emptyProfile: () => ({}), herAge: () => null, loadProfiles: () => ({}), saveProfile: () => {} },
  "./idol-kakao": { genKakaoId: () => "" },
  "./idol-training": { ATTITUDE_LABEL: {}, coursePoints: () => 0, settleProgress: () => {} },
  "./idol-roster": { generateRosterState: () => ({}), settleNpcWeeks: () => {} },
  "./api-helpers": { simpleLLMCall: async () => ({ content: "" }) },
  "./settings-storage": { loadApiConfigs: () => [], loadBindingConfig: () => ({}), resolveBinding: () => ({}) },
};
const loadedModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: loadedModule,
  exports: loadedModule.exports,
  require: (id) => stubs[id] ?? require(id),
  console,
}, { filename: file });

const { parseRosterProfileBatch } = loadedModule.exports;
const profiles = [
  { charId: "npc-a", nationality: "韩国", heightCm: 163, appearance: "短发，眼尾微微上挑", privateLines: ["说话直接，熟悉之后会照顾大家"], familyBackground: "和父母住在大田，家里经营小餐馆。", tmi: ["会把便利店收据夹进手机壳里"], mbti: "ISFP", speech: "等我一下，我马上就来。" },
  { charId: "npc-b", nationality: "日本", heightCm: 158, appearance: "圆眼睛，笑起来有酒窝", privateLines: ["安静地观察一会儿，再加入话题"], familyBackground: "从小在大阪长大，家人支持她来韩国练习。", tmi: ["总在包里放一卷薄荷糖"], mbti: "ENFJ", speech: "这个我也想试试看。" },
];
const parsed = parseRosterProfileBatch(JSON.stringify({ profiles }), ["npc-a", "npc-b"]);
assert.deepEqual(Array.from(parsed, x => x.charId), ["npc-a", "npc-b"]);
assert.equal(parsed[1].nationality, "日本");
assert.equal(parsed[0].tmi.length, 1);
assert.throws(() => parseRosterProfileBatch(JSON.stringify({ profiles: profiles.slice(0, 1) }), ["npc-a", "npc-b"]), /覆盖整批/);
assert.throws(() => parseRosterProfileBatch(JSON.stringify({ profiles: [profiles[0], { ...profiles[1], tmi: profiles[0].tmi }] }), ["npc-a", "npc-b"]), /TMI/);
assert.throws(() => parseRosterProfileBatch(JSON.stringify({ profiles: [{ ...profiles[0], mbti: "UNKNOWN" }, profiles[1]] }), ["npc-a", "npc-b"]), /字段不完整/);
console.log("PASS: roster profile batches keep the expected IDs, accept complete bilingual-free profile data, and reject missing, duplicate-TMI, or invalid-MBTI records.");
