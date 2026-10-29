"use client";

import { useRef, useState } from "react";
import type { TraineeCard } from "@/lib/trainee-card";
import { familyLabel } from "@/lib/trainee-card";
import { FAMILY_STRUCTURES, GUARDIAN_ROLES, SIBLING_ROLES, orderedFamilyMembers, type FamilyBackground, type FamilyField, type FamilyMember, type FamilyStructure } from "@/lib/idol-family-data";
import { familyWarnings, newFamilyMember, occupationOptions, randomFamily, randomFamilyField, setFamilyStructure } from "@/lib/idol-family";
import { familyRegion } from "@/lib/idol-family-presets";

type Props = { card: TraineeCard; value: FamilyBackground; onChange: (f: FamilyBackground) => void; onBack: () => void; onNext: () => void };
const FIELDS: [FamilyField, string][] = [["name", "姓名"], ["age", "年龄 · 可留空"], ["nationality", "国籍"], ["occupation", "职业"], ["location", "居住地"], ["background", "与你的关系背景 · 可留空"]];

export function FamilyBackgroundStep({ card, value: f, onChange, onBack, onNext }: Props) {
  const [view, setView] = useState<"overview" | "editor" | "preview">("overview");
  const [active, setActive] = useState<string>();
  const [adding, setAdding] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const cache = useRef<Record<string, FamilyMember>>({});
  const guardianCache = useRef<FamilyMember[]>([]);
  const changeView = (v: typeof view) => { setView(v); body.current?.scrollTo(0, 0); };
  const edit = (id: string) => { setActive(id); changeView("editor"); };
  const patch = (id: string, p: Partial<FamilyMember>) => onChange({ ...f, members: f.members.map(m => m.id === id ? { ...m, ...p } : m) });
  const field = (m: FamilyMember, key: FamilyField, value: string) => patch(m.id, { [key]: value, locks: { ...m.locks, [key]: true } });
  const setStructure = (s: FamilyStructure) => {
    for (const m of f.members) if (!SIBLING_ROLES.includes(m.role as typeof SIBLING_ROLES[number])) cache.current[m.role] = m;
    if (f.structure === "guardian") guardianCache.current = f.members.filter(m => m.guardian);
    const next = setFamilyStructure(f, s, card.nationality);
    if (s === "guardian" && guardianCache.current.length) next.members = [...guardianCache.current, ...next.members.filter(m => !m.guardian)];
    onChange({ ...next, members: next.members.map(m => !m.guardian && cache.current[m.role] && !f.members.some(old => old.id === m.id) ? cache.current[m.role] : m) });
  };
  const add = (role: string, guardian = false) => { onChange({ ...f, members: [...f.members, newFamilyMember(role, card.nationality, guardian)] }); setAdding(false); };
  const current = f.members.find(m => m.id === active);
  const warnings = familyWarnings(f, card);
  const members = orderedFamilyMembers(f);
  const householdField = (key: "groupName" | "industry" | "wealthSource", label: string) => <div className="op-family-field" key={key}>
    <div className="op-family-field-top"><span>{label}</span><button type="button" aria-label={`锁定${label}`} aria-pressed={Boolean(f.householdLocks[key])} onClick={() => onChange({ ...f, householdLocks: { ...f.householdLocks, [key]: !f.householdLocks[key] } })}>{f.householdLocks[key] ? "已锁定" : "未锁定"}</button></div>
    <input className="op-line" aria-label={label} value={f[key]} placeholder="可手动填写或一键随机" onChange={e => onChange({ ...f, [key]: e.target.value, householdLocks: { ...f.householdLocks, [key]: true } })} />
  </div>;
  return <div className="op-root op-family-root">
    <div className="op-paper">
      <div className="op-head"><img src="/idol/crest.png" alt="" /><div><div className="op-t1">지원서 · 申请表</div><div className="op-t2">APPLICATION</div></div></div>
      <div className="op-step">04 / 06</div>
      <div className="op-body" ref={body}>
        {view === "overview" ? <>
          <div className="op-sec">家庭背景</div><p className="op-family-subtitle">故事从这里开始，也可以以后慢慢补充。</p>
          <div className="op-family-inherited"><span>沿用已选资料</span><span>{card.nationality || "国籍未填写"} · {familyLabel(card)}</span></div>
          <div className="op-family-label">家庭结构<button type="button" onClick={() => setStructure(FAMILY_STRUCTURES[Math.floor(Math.random() * FAMILY_STRUCTURES.length)][0])}>随机结构</button></div>
          <div className="op-family-choices">{FAMILY_STRUCTURES.map(([id, label]) => <button type="button" key={id} className={f.structure === id ? "on" : ""} aria-pressed={f.structure === id} onClick={() => setStructure(id)}><span>{f.structure === id ? "✓" : ""}</span>{id === "mother" ? "单亲 · 只有妈妈" : id === "father" ? "单亲 · 只有爸爸" : label}</button>)}</div>
          {card.family === "child" ? <><div className="op-family-label">家庭经济情况<span>选填</span></div><div className="op-family-income">{[["", "暂不设置"], ["normal", "普通"], ["rich", "富裕"]].map(([id, text]) => <button type="button" key={id} className={f.economy === id ? "on" : ""} aria-pressed={f.economy === id} onClick={() => onChange({ ...f, economy: id as FamilyBackground["economy"] })}>{text}</button>)}</div><p className="op-note">童星是成长经历，家庭经济情况由你决定。</p></> : null}
          {card.family === "rich" || card.family === "chaebol" || (card.family === "child" && f.economy === "rich") ? <details className="op-family-household"><summary>{card.family === "chaebol" ? "家族集团与财富来源" : "家庭财富来源"} · 选填</summary>{card.family === "chaebol" ? <>{householdField("groupName", "家族集团")}{householdField("industry", "主要产业")}</> : null}{householdField("wealthSource", "家庭财富来源")}</details> : null}
          <div className="op-family-label">家庭成员<span>点开填写或修改</span></div>
          {members.map(m => <button type="button" className="op-family-member" key={m.id} onClick={() => edit(m.id)}><span className="op-family-monogram">{m.role === "监护人" ? "家" : m.role.slice(0, 1)}</span><span><b>{m.role}{m.name ? ` · ${m.name}` : ""}</b><small>{[m.age && `${m.age}岁`, m.occupation].filter(Boolean).join(" · ") || "尚未填写资料"}</small></span><span className="op-family-arrow">›</span></button>)}
          {f.structure === "guardian" ? <button type="button" className="op-family-add" onClick={() => add("监护人", true)}>＋ 添加监护人</button> : null}
          <button type="button" className="op-family-add" onClick={() => setAdding(!adding)}>＋ 添加姐姐、哥哥、妹妹或弟弟</button>
          {adding ? <div className="op-family-picker">{SIBLING_ROLES.map(r => <button type="button" key={r} onClick={() => add(r)}>{r}</button>)}</div> : null}
          <button type="button" className="op-family-small-btn" onClick={() => { const siblings = f.members.filter(m => !m.guardian && SIBLING_ROLES.includes(m.role as typeof SIBLING_ROLES[number])); const locked = siblings.filter(m => Object.values(m.locks).some(Boolean)); const count = Math.max(locked.length, Math.floor(Math.random() * 4)); const retained = [...locked, ...siblings.filter(m => !locked.includes(m))].slice(0, count); const adults = f.members.filter(m => !siblings.includes(m)); onChange({ ...f, members: [...adults, ...retained, ...Array.from({ length: count - retained.length }, () => newFamilyMember(SIBLING_ROLES[Math.floor(Math.random() * 4)], card.nationality))] }); }}>随机手足人数与称谓</button>
          <p className="op-note">“随机未锁定”只改资料，不改变家庭结构和人数。手动填写后会锁定该项。</p>
        </> : null}
        {view === "editor" && current ? <>
          <button type="button" className="op-family-back" onClick={() => changeView("overview")}>‹ 家庭背景</button>
          <div className="op-family-person-head"><span className="op-family-monogram">{current.role.slice(0, 1)}</span><div className="op-sec">{current.role}的资料</div><p className="op-note">按你心中的样子填写。</p></div>
          {current.guardian ? <div className="op-family-field"><label>监护人称谓<select className="op-line" aria-label="监护人称谓" value={GUARDIAN_ROLES.includes(current.role as typeof GUARDIAN_ROLES[number]) ? current.role : "其他"} onChange={e => patch(current.id, { role: e.target.value, gender: /祖母|姨|姑/.test(e.target.value) ? "女" : /祖父|舅|叔/.test(e.target.value) ? "男" : current.gender })}>{GUARDIAN_ROLES.map(r => <option key={r}>{r}</option>)}</select></label>{!GUARDIAN_ROLES.slice(0, -1).includes(current.role as never) ? <input className="op-line" aria-label="自定义称谓" value={current.role === "其他" ? "" : current.role} onChange={e => patch(current.id, { role: e.target.value })} placeholder="自由填写称谓" /> : null}</div> : null}
          {FIELDS.map(([key, label]) => <div className="op-family-field" key={key}>
            <div className="op-family-field-top"><label htmlFor={`family-${key}`}>{label}</label><span>{["name", "age", "occupation", "location"].includes(key) ? <button type="button" aria-label={`随机${label}`} disabled={Boolean(current.locks[key]) || ((key === "name" || key === "location") && !familyRegion(current.nationality || card.nationality))} onClick={() => onChange(randomFamilyField(f, card, current.id, key))}>⤨ 随机</button> : null}<button type="button" aria-label={`锁定${label}`} aria-pressed={Boolean(current.locks[key])} className={current.locks[key] ? "is-locked" : ""} onClick={() => patch(current.id, { locks: { ...current.locks, [key]: !current.locks[key] } })}>{current.locks[key] ? "已锁定" : "未锁定"}</button></span></div>
            {key === "occupation" ? <><select id={`family-${key}`} className="op-line" value={occupationOptions(card, f, current).includes(current.occupation) ? current.occupation : "other"} onChange={e => field(current, key, e.target.value === "other" ? "" : e.target.value)}>{occupationOptions(card, f, current).map(job => <option key={job}>{job}</option>)}<option value="other">其他 · 自己填写</option></select>{!occupationOptions(card, f, current).includes(current.occupation) ? <input className="op-line" aria-label="自定义职业" value={current.occupation} placeholder="填写职业，也可以随机" onChange={e => field(current, key, e.target.value)} /> : null}</> : key === "background" ? <textarea id={`family-${key}`} className="op-line" rows={3} value={current[key]} placeholder="不填则彼此熟悉、自然相处，亲密程度随互动发展" onChange={e => field(current, key, e.target.value)} /> : <input id={`family-${key}`} className="op-line" inputMode={key === "age" ? "numeric" : "text"} value={current[key]} placeholder={key === "location" ? "国家 / 城市" : "可手动填写"} onChange={e => field(current, key, e.target.value)} />}
          </div>)}
          <div className="op-family-field"><label>亲属关系<select className="op-line" aria-label="亲属关系" value={current.kinship} onChange={e => patch(current.id, { kinship: e.target.value as FamilyMember["kinship"] })}>{[["blood", "血缘亲属"], ["adoptive", "收养亲属"], ["step", "继亲"], ["nominal", "名义亲属"]].map(([v, t]) => <option value={v} key={v}>{t}</option>)}</select></label></div>
          {current.guardian ? <div className="op-family-field"><label>性别<select className="op-line" aria-label="监护人性别" value={current.gender} onChange={e => patch(current.id, { gender: e.target.value as FamilyMember["gender"] })}><option value="">暂不填写</option><option>女</option><option>男</option></select></label></div> : null}
          <p className="op-note">年龄以开局日期为准。性格、外貌等资料，开局后可以在通讯录手动补充。</p>
          {current.guardian || SIBLING_ROLES.includes(current.role as typeof SIBLING_ROLES[number]) ? <button type="button" className="op-family-remove" onClick={() => { onChange({ ...f, members: f.members.filter(m => m.id !== current.id) }); changeView("overview"); }}>移除这位家庭成员</button> : null}
        </> : null}
        {view === "preview" ? <>
          <div className="op-sec">家庭档案</div><p className="op-family-subtitle">属于你的故事底色。</p>
          <div className="op-review"><div><em>背景</em>{card.nationality} · {familyLabel(card)}</div><div><em>结构</em>{FAMILY_STRUCTURES.find(([id]) => id === f.structure)?.[1]}</div>{card.family === "child" ? <div><em>经济</em>{f.economy === "rich" ? "富裕" : f.economy === "normal" ? "普通" : "暂不设置"}</div> : null}{card.family === "chaebol" ? <><div><em>集团</em>{f.groupName || "暂不设置"}</div><div><em>产业</em>{f.industry || "暂不设置"}</div></> : null}{f.wealthSource && (card.family === "rich" || card.family === "chaebol" || (card.family === "child" && f.economy === "rich")) ? <div><em>来源</em>{f.wealthSource}</div> : null}</div>
          {members.map(m => <article className="op-family-entry" key={m.id}><div><b>{m.name || "姓名未填写"}</b><span>{m.role}</span><button type="button" onClick={() => edit(m.id)}>编辑 ›</button></div><p>{[m.age && `${m.age}岁`, m.nationality, m.occupation, m.location].filter(Boolean).join(" · ") || "资料暂未填写"}</p>{m.background ? <p>{m.background}</p> : null}</article>)}
          {!members.length ? <p className="op-note">暂不建立家庭成员，之后的故事仍可自由发展。</p> : null}
          <p className="op-family-end">· FAMILY BACKGROUND ·</p><p className="op-note">确认后继续填写申请表，最后盖章时一并保存。家人会进入通讯录、KKT 和档案库。</p>
          {warnings.map(w => <p key={w} className="op-note">{w}</p>)}
        </> : null}
      </div>
    </div>
    <div className="op-foot"><button type="button" className="op-frame-btn is-plain" onClick={view === "overview" ? onBack : () => changeView("overview")}>{view === "overview" ? "上一页" : "返回修改"}</button>{view !== "preview" ? <button type="button" className="op-frame-btn is-plain" onClick={() => onChange(randomFamily(f, card, view === "editor" ? active : undefined))}>随机未锁定</button> : <span />}<button type="button" className="op-frame-btn" onClick={() => view === "overview" ? changeView("preview") : view === "editor" ? changeView("overview") : onNext()}>{view === "overview" ? "预览档案" : view === "editor" ? "完成" : "确认并继续"}</button></div>
  </div>;
}
