"use client";

// 此刻的字：旁白台词京华老宋体，名字思源宋体（都是切片字体，用到哪块下哪块）
import "@chinese-fonts/jhlst/dist/京華老宋体v2_002/result.css";
import "@chinese-fonts/syst/dist/SourceHanSerifCN/result.css";

import { useCallback, useEffect, useState } from "react";
import { VnPlayer } from "./vn-player";
import { StageHome } from "./stage-home";
import { WORLD_CHAR_ID, ensureWorldCharacter } from "@/lib/idol-world";
import { worldVnSession } from "@/lib/idol-stage";
import { stopStageBgm } from "./stage-bgm";
import { loadAllCharacters } from "@/lib/character-storage";

/** 最常用的几百个字先在后台下好，打字机一个字一个字出来时少闪系统字体 */
const COMMON = "的一是了不在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日者意无力它与长把机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应向头文体相见被利什二等产或新己制身果加西月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直资命山金指许统区保至队形社便空决治展马科司五基眼书非则听白却界达光放强即像难且权思王象完设式色路记南品住告类求据程北边死张该交规万取拉格望觉术领共确传师观清今切院让识候带导争运笑飞风步改收根干造言联持组每济车亲极林服快办议往元英士证近失转夫令准布始怎呢存未远叫台单影具字爱击流备连调深商算质团集百需价花华城石级整府离况请技际约示复病息究线似官火断精满支视消越器容照须九增研写称企八功吗包片史委乎查轻易早曾除农找装广显吧阿李标谈吃图念六引历首医局突专费号尽另周较注语仅考落青随选列红响虽推势参希古众构房半节土投某案黑维划致陈律足态护七兴派孩验责营星够章音跟志底站严例防族供效续施留讲型料终答紧黄绝奇察母京段依批群项故按河米围江织害斗双境客纪采举杀攻父苏密低朝友诉止细愿千值仍男钱破网热助倒育属坐帝限船脸职速刻乐否刚威毛状率甚独球般普怕弹校苦创假久错承印晚兰试股拿脑预谁益阳若哪微尼继送急血惊伤素药适波夜省初喜卫源食险待述陆习置居劳财环排福纳欢雷警获模充负云停木游龙树疑层冷洲冲射略范竟句室异激汉村哈策演简";
function preloadStageFonts(): void {
  if (typeof document === "undefined" || !document.fonts) return;
  const names = loadAllCharacters().map(c => c.name).join("");
  void document.fonts.load('16px "KingHwa_OldSong"', COMMON + names + "，。？！…「」“”").catch(() => undefined);
  void document.fonts.load('900 16px "Source Han Serif CN VF"', names + "你").catch(() => undefined);
}

interface VnAppProps {
  onClose: () => void;
}

/** 爱豆小手机的场景 app（原漫卷）：不选人，打开就是地图；一场戏 = 「世界」会话里的一章 */
export function VnApp({ onClose }: VnAppProps) {
  const [chapter, setChapter] = useState<number | null>(null);
  useEffect(() => { ensureWorldCharacter(); preloadStageFonts(); return () => stopStageBgm(); }, []);

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
