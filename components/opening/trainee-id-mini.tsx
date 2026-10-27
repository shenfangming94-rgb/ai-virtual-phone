"use client";

import { ageAtStart, talentLabels, type TraineeCard } from "@/lib/trainee-card";

/** 小一号的练习生证（我的名片、存档里用） */
export function TraineeIdMini({ c, className = "" }: { c: TraineeCard; className?: string }) {
  const age = ageAtStart(c);
  return (
    <div className={`op-id ct-mini-id ${className}`}>
      <div className="op-id-top"><img src="/idol/crest.png" alt="" /><b>TRAINEE ID CARD</b><s>练习生证</s></div>
      <div className="op-id-in">
        <div className="op-id-pic">{c.photo ? <img src={c.photo} alt="" /> : <span>{c.name.slice(0, 1)}</span>}</div>
        <div className="op-id-kv">
          <div><em>姓名</em>{c.name}</div>
          <div><em>生日</em>{c.birthday.replace(/-/g, ".")}{age != null ? `（${age}岁）` : ""}</div>
          <div><em>国籍</em>{c.nationality || "—"}</div>
          <div><em>特长</em>{talentLabels(c.talents).join(" · ") || "—"}</div>
          <div><em>所属</em>{c.company || <span className="op-dim">— 还没有 —</span>}</div>
        </div>
      </div>
      <div className="op-id-no">No. {c.no}</div>
      {c.signature ? <img src={c.signature} alt="" className="ct-mini-sign" /> : null}
    </div>
  );
}
