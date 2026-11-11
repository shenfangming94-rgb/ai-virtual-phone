const fs=require('fs'),vm=require('vm'),ts=require('typescript'),a=require('assert/strict');const e={},calls=[];
const mocks={
 './character-storage':{loadAllCharacters:()=>[{id:'a',name:'甲'},{id:'b',name:'乙'},{id:'absent',name:'不在场'}]},
 './memory-storage':{loadMemoryConfig:()=>({shortTermTokenBudget:1000})},
 './memory-service':{retrieveCoreMemoriesForPrompt:async id=>{calls.push(['core',id]);return[{content:id+'核心'}]},retrieveMemoriesForPrompt:async(id,q)=>{a.ok(q.trim());calls.push(['long',id]);return[{content:id+'长期'}]}},
 './memory-injector':{formatCoreMemories:x=>x.map(m=>m.content).join(''),formatLongTermMemories:x=>x.map(m=>m.content).join('')},
 './short-term-assembler':{prepareShortTermContext:(id,app,opts)=>{a.equal(app,'chat');a.equal(opts.includeDirectChatEntries,true);return{recentBlocks:[{content:id+'上一场总结'}],wbActivationContext:''}}}
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/idol-stage-memory.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:e,require:n=>mocks[n],Set,Promise});
(async()=>{const text=await e.buildStageParticipantMemories(['a','b','a'],'');a.ok(text.includes('a上一场总结'));a.ok(text.includes('b核心'));a.ok(text.includes('b长期'));a.equal(calls.length,4);a.ok(!text.includes('不在场'));a.equal(await e.buildStageParticipantMemories([],''),'');console.log('PASS: per-participant summaries/core/long-term included, deduplicated, absent actors excluded, empty context supported')})().catch(err=>{console.error(err);process.exitCode=1});
