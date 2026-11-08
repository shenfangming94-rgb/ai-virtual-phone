/**
 * 爱豆小手机：出道管道（主线 06-13 的名单算法与身份切换）。
 *
 * - 最终选拔（次年 3 月主线节点）完成 → 代码算名单：玩家必进 + 综合分最高的 4 名同期，
 *   特长多样性保底（至少覆盖 vocal/rap，没有就换进最高的那个）
 * - 名单公布（次年 4 月）节点的开场注入名单——只在这一步才对外公开，之前 AI 不得提前泄露
 * - 正式出道（次年 6 月下~7 月初）完成 → 练习生阶段终点：身份切到 idol、出道关注度结算
 * 只在新存档（有名册）下跑。
 */

import { kvGet, kvSet } from "./kv-db";
import { loadCareer, saveCareer, type CareerNode } from "./idol-career";
import { loadRoster, saveRoster } from "./idol-roster-live";
import { examBase, type Trainee } from "./idol-training";
import { fameEvent } from "./idol-fame";
import { loadCharacters } from "./character-storage";
import { loadTraineeCard } from "./trainee-card";
import { loadProfiles } from "./idol-people";

const KEY = "idol_debut_pipeline_v1";

type State = { lineup: string[]; revealed: boolean; computedAt?: number };

function load(): State {
  try { return { lineup: [], revealed: false, ...(JSON.parse(kvGet(KEY) || "null") as Partial<State> | null) }; } catch { return { lineup: [], revealed: false }; }
}
function save(s: State) { kvSet(KEY, JSON.stringify(s)); }

export function pipelineState(): State { return load(); }

/** 名单算法：玩家必进 + 综合分前 4 的同期（已退社的排除），特长多样性保底（vocal/rap 至少覆盖一个，玩家特长也算覆盖） */
export function computeLineup(): string[] {
  const roster = loadRoster();
  if (!roster) return [];
  const profiles = loadProfiles();
  const all: Trainee[] = [roster.player, ...roster.npcs];
  const scored = all.map(t => ({ t, s: examBase(t) })).sort((a, b) => b.s - a.s);
  const player = roster.player;
  // 她反馈/审计：已退社的同期不能入选
  const npcPool = roster.npcs.filter(n => !(n.charId && profiles[n.charId]?.leave?.phase === "left"));
  const npcTop = scored.filter(x => x.t.id !== "player" && npcPool.some(n => n.id === x.t.id)).slice(0, 4).map(x => x.t);
  // 多样性：前 4 里没有 vocal/rap 特长的，换进最高的那个；换的时候别把刚保的另一项顶掉
  const ensure = (spec: "vocal" | "rap", pool: Trainee[], rest: Trainee[], protect?: Set<string>): Trainee[] => {
    const covered = pool.some(t => t.specialty === spec) || player.specialty === spec;
    if (covered) return pool;
    const alt = rest.filter(t => t.specialty === spec).sort((a, b) => examBase(b) - examBase(a))[0];
    if (!alt) return pool;
    const out = [...pool];
    const idx = out.map((t, i) => ({ t, i })).filter(({ t }) => t.specialty !== spec && !(protect?.has(t.specialty))).pop()?.i;
    if (idx == null) return pool;
    out[idx] = alt;
    return out;
  };
  const rest = npcPool.filter(n => !npcTop.some(t => t.id === n.id));
  const afterVocal = ensure("vocal", npcTop, rest);
  const final = ensure("rap", afterVocal, rest, new Set(["vocal"]));
  const picks = [player, ...final];
  saveRoster({ ...roster }); // 名单里的人标记在 pipeline 里,roster 不动
  return picks.map(t => t.id);
}

/** 每 5 秒在桌面跑 */
export function debutPipelineTick(): void {
  try { if (!kvGet("idol_roster_v1")) return; } catch { return; }
  const career = loadCareer();
  const s = load();
  // 1. 最终选拔完成 → 算名单（只在这里算一次）
  const selection = career.nodes.find(n => n.occasion === "mainline" && n.title.includes("最终选拔"));
  if (selection && selection.status === "done" && !s.lineup.length) {
    const lineup = computeLineup();
    save({ ...s, lineup, computedAt: Date.now() });
    return;
  }
  // 2. 名单公布节点：开场注入名单（只在这一步公开）
  const reveal = career.nodes.find(n => n.occasion === "mainline" && n.title.includes("最终出道名单公布"));
  if (reveal && s.lineup.length && !s.revealed && !(reveal.premise ?? "").includes("【最终名单】")) {
    const names = lineupNames(s.lineup);
    const premise = `${reveal.premise}\n【最终名单】${names.join("、")}。名单由代码按数值和经历计算得出，从现在起才公开：成员之间的反应、入选与未入选同期的处境、新团队的第一次集结，都按真实关系演；AI 不得改写名单。`;
    saveCareer({ ...career, nodes: career.nodes.map(n => n.id === reveal.id ? { ...n, premise } : n) });
    save({ ...s, revealed: true });
    return;
  }
  // 3. 正式出道完成 → 建团队资料 + 身份切换 + 出道结算
  const debut = career.nodes.find(n => n.occasion === "mainline" && n.title.includes("正式出道"));
  if (debut && debut.status === "done" && career.stage !== "idol") {
    finalizeDebut(career, s.lineup, debut.dueAt);
  }
}

function lineupNames(ids: string[]): string[] {
  const chars = loadCharacters();
  const roster = loadRoster();
  return ids.map(id => {
    if (id === "player") return loadTraineeCard()?.name ?? "她";
    // 名单里存的是名册编号（Trainee.id），名字要过 charId 去通讯录查（她反馈过显示成「同期」的 bug）
    const charId = roster?.npcs.find(n => n.id === id)?.charId;
    return charId ? (chars.find(c => c.id === charId)?.name ?? "同期") : "同期";
  });
}

/** 正式出道那一刻：把团队资料落进 career.debut（她反馈：新管道没建 team/members，出道后还显示练习生） */
function finalizeDebut(career: ReturnType<typeof loadCareer>, lineup: string[], debutAt: number): void {
  const roster = loadRoster();
  const chars = loadCharacters();
  const profiles = loadProfiles();
  const card = loadTraineeCard();
  const POS: Record<string, string> = { vocal: "主唱", dance: "主舞", rap: "Rapper", visual: "门面", acting: "演技担当", variety: "综艺担当", compose: "创作", language: "外语担当" };
  const members = lineup.map(id => {
    if (id === "player") {
      const spec = roster?.player.specialty ?? "dance";
      return { id: "player", name: card?.name ?? "她", ko: "", nation: card?.nationality ?? "韩国", birthday: card?.birthday ?? "", positions: [{ zh: POS[spec] ?? "领唱", ko: "" }] };
    }
    const npc = roster?.npcs.find(n => n.id === id);
    const char = npc?.charId ? chars.find(c => c.id === npc.charId) : undefined;
    const p = npc?.charId ? profiles[npc.charId] : undefined;
    return { id: npc?.charId ?? id, name: char?.name ?? npc?.name ?? "同期", ko: "", nation: p?.nationality ?? "韩国", birthday: npc?.birthday ?? "", positions: [{ zh: POS[npc?.specialty ?? ""] ?? "领唱", ko: "" }] };
  });
  saveCareer({
    ...loadCareer(), stage: "idol" as const,
    facts: [...loadCareer().facts, `出道成员：${members.map(m => m.name).join("、")}`],
    debut: {
      targetAt: debutAt, attempt: 1, status: "debuted" as const, codename: "SEOUL:AM", delays: [],
      members, team: { en: "SEOUL:AM", ko: "", meaning: "", meaningKo: "" }, song: "", debutAt,
      formedAt: debutAt, steps: [{ kind: "dday" as const, at: debutAt, done: true }],
    },
  });
  fameEvent("debut", "正式出道", debutAt);
}
