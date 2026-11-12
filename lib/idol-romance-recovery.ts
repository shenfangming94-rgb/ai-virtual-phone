import { kvGet } from "./kv-db";
import { ROUTE_NODES, bondDayKey, type LineState, type RouteType } from "./idol-romance-lines";

/** One authorized incident repair. Match the affected save, never another world. */
export function recoverConfirmedRomanceIncident(): Record<string, unknown> | null {
  try {
    const old = JSON.parse(kvGet("idol_romance_before_meet_ledger_v1") || "null");
    const career = JSON.parse(kvGet("idol_career_v1") || "null");
    const characters = JSON.parse(kvGet("ai_phone_characters_v1") || "[]") as { id: string }[];
    const targets = [
      ["underground", 1625892839390, 55],
      ["heir", 1625915004186, 35],
      ["trainee", 1626483699782.98, 35],
    ] as const;
    if (!old?.lines || !Array.isArray(career?.nodes) || !Array.isArray(characters)) return null;
    if (!targets.every(([type, followedAt]) => old.lines[type]?.followedAt === followedAt
      && characters.some(c => c.id === old.lines[type].charId))) return null;
    // Both independently recorded milestones must still be in this exact world.
    if (!career.nodes.some((n: { id: string; status: string }) => n.id === "rom_kse3zb4jff8e" && n.status === "done")
      || !career.nodes.some((n: { id: string }) => n.id === "rom_ksbqc55soef1")) return null;
    const scenes = JSON.parse(kvGet("idol_stage_scenes_v1") || "{}");
    const lines: Partial<Record<RouteType, LineState>> = {};
    for (const [type, , bond] of targets) {
      const original = old.lines[type] as LineState;
      const nodes = ROUTE_NODES[type];
      const doneNodes: string[] = [];
      for (const def of nodes) {
        const tag = `情缘节点：${def.key}`;
        if (!career.nodes.some((n: { status: string; note?: string; romance?: string[] }) => n.status === "done" && (n.note === tag || n.romance?.includes(tag)))) break;
        doneNodes.push(def.key);
      }
      const meetDays = new Set((original.history || []).filter(h => h.type === "meet").map(h => bondDayKey(h.at)));
      for (const scene of Object.values(scenes) as { ids?: string[]; ended?: boolean; startAt: number; endedAt?: number }[]) {
        if (scene.ended && scene.ids?.includes(original.charId)) meetDays.add(bondDayKey(scene.endedAt || scene.startAt));
      }
      lines[type] = { ...original, bond, doneNodes, nextNode: nodes[doneNodes.length]?.key || "",
        meetDays: [...meetDays], history: [], daily: { day: bondDayKey(Date.now()), calls: 0, kkt: 2 } };
    }
    // Existing calendar invitations are retained. Old queued first-node beats are obsolete.
    return { lines, classBeats: [], sceneBeats: [], confirmedBondRepair: { at: Date.now(), before: old.lines } };
  } catch { return null; }
}
