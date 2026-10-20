// lib/call-lines.ts
// 通话里他一次说好几句：拆成一句一条字幕，一条一条放出来。
// 有语音：先并行合成每句，再按顺序播放，播到哪句那句字幕才出来；
// 没语音：按字数隔一小会儿出一条。

export function splitCallLines(parts: string[]): string[] {
    return parts
        .flatMap(part => part.split(/\n+/))
        .map(line => line.trim())
        .filter(Boolean);
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export async function revealCallLines(
    lines: string[],
    options: {
        onLine: (line: string, index: number) => void;
        isStopped: () => boolean;
        /** 返回 null 表示不用语音（没配或静音） */
        synthesize?: ((line: string) => Promise<Blob | null>) | null;
        play?: (blob: Blob) => Promise<void>;
    },
): Promise<void> {
    const { onLine, isStopped, synthesize, play } = options;
    const audios = synthesize && play
        ? lines.map(line => synthesize(line).catch(err => {
            console.warn("[Call] TTS failed:", err);
            return null;
        }))
        : null;
    for (let i = 0; i < lines.length; i++) {
        if (isStopped()) return;
        if (audios) {
            const blob = await audios[i];
            if (isStopped()) return;
            onLine(lines[i], i);
            if (blob && play) {
                await play(blob);
                continue;
            }
        } else {
            onLine(lines[i], i);
        }
        if (i < lines.length - 1) {
            await wait(Math.min(2600, 500 + Array.from(lines[i]).length * 110));
        }
    }
}
