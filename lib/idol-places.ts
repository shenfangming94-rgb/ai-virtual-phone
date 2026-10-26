/**
 * 爱豆小手机：点地点出门。剧情 app「开一场戏」里按类别挑一个地方，世界按时间、地点、日程决定谁在。
 */

import { loadCareer, companyOf } from "./idol-career";

export type PlaceGroup = { id: string; label: string; places: string[]; afterDebut?: boolean };

export const PLACE_GROUPS: PlaceGroup[] = [
  { id: "company", label: "公司", places: ["练习室", "声乐室", "录音室", "食堂", "天台", "休息区", "办公室", "会议室"] },
  { id: "dorm", label: "宿舍", places: ["自己房间", "客厅", "厨房"] },
  { id: "near", label: "附近", places: ["公司楼下便利店", "咖啡厅", "炸鸡店", "烤肉店", "汗蒸房", "健身房"] },
  { id: "out", label: "出去玩", places: ["汉江公园", "弘大", "明洞", "江南", "狎鸥亭", "梨泰院", "乐天世界"] },
  { id: "life", label: "生活", places: ["学校", "家", "医院", "机场"] },
  { id: "debut", label: "出道后", places: ["打歌节目后台", "签售会场", "广播电台"], afterDebut: true },
];

/** 地点的完整说法：公司和宿舍前面带上公司名 */
export function fullPlaceName(groupId: string, place: string): string {
  const c = companyOf(loadCareer().companyId);
  if (!c) return place;
  if (groupId === "company") return `${c.name} 公司 ${place}`;
  if (groupId === "dorm") return `${c.name} 宿舍 ${place}`;
  return place;
}

/** 还没进公司时公司和宿舍去不了；出道后的地方要出道才开 */
export function placeGroupLocked(g: PlaceGroup): string | null {
  const career = loadCareer();
  if (g.afterDebut) return "出道后才能去";
  if ((g.id === "company" || g.id === "dorm") && career.stage === "pre") return "进了公司才能去";
  return null;
}
