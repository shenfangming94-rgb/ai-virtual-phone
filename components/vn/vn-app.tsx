"use client";

import { useCallback, useEffect, useState } from "react";
import { VnPlayer } from "./vn-player";
import { StageHome } from "./stage-home";
import { WORLD_CHAR_ID, ensureWorldCharacter } from "@/lib/idol-world";
import { worldVnSession } from "@/lib/idol-stage";
import { stopStageBgm } from "./stage-bgm";

interface VnAppProps {
  onClose: () => void;
}

/** 爱豆小手机的场景 app（原漫卷）：不选人，打开就是地图；一场戏 = 「世界」会话里的一章 */
export function VnApp({ onClose }: VnAppProps) {
  const [chapter, setChapter] = useState<number | null>(null);
  useEffect(() => { ensureWorldCharacter(); return () => stopStageBgm(); }, []);

  const play = useCallback((chapterIndex: number) => {
    worldVnSession();
    setChapter(chapterIndex);
  }, []);

  if (chapter !== null) {
    return (
      <VnPlayer
        key={chapter}
        characterId={WORLD_CHAR_ID}
        chapterIndex={chapter}
        stage
        onClose={() => setChapter(null)}
        onChapterEnd={() => setChapter(null)}
        vnTheme="default"
      />
    );
  }

  return <StageHome onClose={onClose} onPlay={play} />;
}
