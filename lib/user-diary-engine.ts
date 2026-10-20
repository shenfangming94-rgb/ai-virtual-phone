// lib/user-diary-engine.ts
// 她把日记给 char 看：char 马上批注 1～4 条（他自己挑句子），
// 用的上下文和他自己写日记那套一样（人设、世界书、记忆、最近聊天、预设）。

import { sendLLMRequest } from "./chat-engine";
import { resolveDiaryEntryGeneration } from "./diary-entry-engine";
import type { LLMMessage } from "./llm-prompt-assembler";
import {
    addAnnotations,
    charAnnotationColor,
    loadAnnotationsForEntry,
    locateQuote,
    type DiaryAnnotation,
    type UserDiaryEntry,
} from "./user-diary";

function parseAnnotations(raw: string): { quote: string; text: string }[] {
    const out: { quote: string; text: string }[] = [];
    const blocks = raw.split(/===\s*批注\s*===/).slice(1);
    for (const block of blocks) {
        const quote = block.match(/原句[：:]\s*([^\n]+)/)?.[1]?.trim() || "";
        const text = block.match(/批注[：:]\s*([^\n]+)/)?.[1]?.trim() || "";
        if (quote && text) out.push({ quote, text });
    }
    return out;
}

export async function annotateUserDiaryEntry(characterId: string, entry: UserDiaryEntry): Promise<DiaryAnnotation[]> {
    const resolved = await resolveDiaryEntryGeneration(characterId, [], ["diary"]);
    const { character, userName } = resolved;
    const others = loadAnnotationsForEntry(entry.id).filter(a => a.authorKey !== characterId);
    const instruction = [
        `<diary_annotation_task>`,
        `${userName}把她的日记给你（${character.name}）看了。你以${character.name}本人的身份读这篇日记，用笔在上面写批注。`,
        `日记标题：${entry.title}`,
        `日记正文：`,
        entry.body,
        others.length > 0 ? `\n别人已经写在上面的批注：\n${others.map(a => `「${a.quote}」旁边：${a.text}`).join("\n")}` : "",
        ``,
        `规则：`,
        `- 挑 1～4 句你最有话说的，日记短就少批，不用每句都批。`,
        `- 原句必须从日记正文里一字不差地复制，只复制那一句。`,
        `- 批注是你写在旁边的话，口吻完全按你的人设和你们现在的关系，短。`,
        `- 只输出批注，格式如下，不要输出别的内容：`,
        `===批注===`,
        `原句：日记里的一句原文`,
        `批注：你写在旁边的话`,
        `</diary_annotation_task>`,
    ].filter(line => line !== "").join("\n");
    const messages: LLMMessage[] = [...resolved.messages, { role: "user", content: instruction }];
    const raw = await sendLLMRequest(
        resolved.apiConfig,
        resolved.preset,
        messages,
        resolved.regexes,
        { characterName: `日记批注:${character.name}`, userName },
        { appId: "diary", appTags: ["diary"] },
    );
    const parsed = parseAnnotations(raw).slice(0, 4);
    const color = charAnnotationColor(characterId);
    const usable = parsed
        .map(item => {
            const loc = locateQuote(entry.body, item.quote);
            return loc ? { quote: entry.body.slice(loc.start, loc.end), text: item.text.slice(0, 80) } : null;
        })
        .filter((item): item is { quote: string; text: string } => Boolean(item));
    // 一句都没对上原文时，至少留一条批在第一句上
    if (usable.length === 0 && parsed.length > 0) {
        const first = entry.body.split(/(?<=[。！？!?\n])/)[0]?.trim() || entry.body.slice(0, 20);
        usable.push({ quote: first, text: parsed[0].text.slice(0, 80) });
    }
    return addAnnotations(usable.map(item => ({
        entryId: entry.id,
        authorKey: characterId,
        authorName: character.name,
        quote: item.quote,
        text: item.text,
        color,
    })));
}
