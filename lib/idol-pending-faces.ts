/**
 * 待出场的人物（Flora 定的规矩）：
 * 发动机要给剧情安排的新人，不能直接进通讯录——先在这里排队，
 * 等她在戏里真的见过一面（戏后记账），才正式入库、之后的冲突剧情才会推进。
 * 主动来加 KKT 的陌生人不走这里。
 */
import { kvGet, kvSet } from "./kv-db";

const KEY = "idol_pending_faces_v1";

export type PendingFace = { name: string; role: string; gender: "" | "男" | "女"; age: string; about: string; at: number };

export function listPendingFaces(): PendingFace[] {
  try {
    const raw = JSON.parse(kvGet(KEY) || "[]") as PendingFace[];
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function save(list: PendingFace[]): void {
  kvSet(KEY, JSON.stringify(list));
}

export function pushPendingFace(f: Omit<PendingFace, "at">): void {
  const list = listPendingFaces();
  if (list.some(x => x.name === f.name)) return;
  save([...list, { ...f, at: Date.now() }]);
}

/** 戏里真出场了：拿掉排队记录，返回她的预设资料（合并进正式档案用） */
export function takePendingFace(name: string): Omit<PendingFace, "at" | "name"> | null {
  const list = listPendingFaces();
  const f = list.find(x => x.name === name);
  if (!f) return null;
  save(list.filter(x => x.name !== name));
  return { role: f.role, gender: f.gender, age: f.age, about: f.about };
}
