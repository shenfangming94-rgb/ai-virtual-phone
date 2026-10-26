"use client";

import { useEffect, useRef, useState } from "react";

import {
  FAMILY_OPTIONS,
  TALENT_OPTIONS,
  ageAtStart,
  familyLabel,
  randomBasics,
  randomFamily,
  randomLength,
  randomLooks,
  randomTalents,
  stampTraineeCard,
  talentLabels,
  type TraineeCard,
} from "@/lib/trainee-card";

const CREST = "/idol/crest.png";
const STEPS = 5;

function emptyCard(): TraineeCard {
  return {
    name: "", photo: null, birthday: "", nationality: "", mbti: "", looks: "",
    start: "", trainLength: "", family: "", familyCustom: "", familyNote: "",
    talents: [], talentNote: "", weakness: "", other: "", signature: null,
    company: "", no: "", createdAt: 0,
  };
}

function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

const fmtDot = (iso: string) => iso.replace(/-/g, " . ");

/** 开局：练习生登记证。封面 → 五页申请表 → 证件 + 签名 → 盖章开始 */
export function TraineeOpening({ onDone, onNotice }: { onDone: () => void; onNotice?: (message: string) => void }) {
  const [step, setStep] = useState(0); // 0 封面，1-5 申请表，6 证件
  const [c, setC] = useState<TraineeCard>(emptyCard);
  const [stamping, setStamping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof TraineeCard>(k: K, v: TraineeCard[K]) => setC(prev => ({ ...prev, [k]: v }));

  const random = () => {
    if (step === 1) {
      const r = randomBasics();
      setC(p => ({
        ...p,
        name: p.name || r.name,
        nationality: p.nationality || r.nationality,
        mbti: p.mbti || r.mbti,
        birthday: p.birthday || r.birthday,
        start: p.start || `${r.startYear}-03-01`,
      }));
    }
    if (step === 2) {
      const r = randomBasics();
      setC(p => ({ ...p, looks: p.looks || randomLooks(), start: p.start || `${r.startYear}-03-01`, trainLength: p.trainLength || randomLength() }));
    }
    if (step === 3 && !c.family) set("family", randomFamily());
    if (step === 4 && !c.talents.length) set("talents", randomTalents());
  };

  const missing = (): string | null => {
    if (step === 1 && !c.name.trim()) return "先写名字";
    if (step === 1 && !c.birthday) return "生日还没填";
    if (step === 2 && !c.start) return "起点日期还没填";
    if (step === 3 && !c.family) return "选一个家境";
    if (step === 3 && c.family === "custom" && !c.familyCustom.trim()) return "写一下你的家境";
    return null;
  };
  const next = () => {
    const m = missing();
    if (m) { onNotice?.(m); return; }
    setStep(s => s + 1);
  };

  const stamp = () => {
    if (!c.signature) { onNotice?.("先在签名框里签个名"); return; }
    setStamping(true);
    const card: TraineeCard = {
      ...c,
      name: c.name.trim(),
      no: `${c.start.replace(/-/g, ".")}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      createdAt: Date.now(),
    };
    window.setTimeout(() => {
      stampTraineeCard(card);
      onDone();
    }, 1500);
  };

  if (step === 0) {
    return (
      <div className="op-root" onClick={() => setStep(1)}>
        <div className="op-cover">
          <img src={CREST} alt="" className="op-cover-crest" />
          <div className="op-cover-band">
            <div className="op-cover-ko">연습생 등록증</div>
            <div className="op-cover-zh">练习生登记证</div>
            <div className="op-cover-en">TRAINEE ID CARD</div>
          </div>
          <div className="op-tap">轻点开始填写</div>
        </div>
      </div>
    );
  }

  if (step === 6) {
    const age = ageAtStart(c);
    return (
      <div className="op-root">
        <div className="op-final">
          <div className="op-final-title">你的练习生证</div>
          <div className={`op-id ${stamping ? "is-stamped" : ""}`}>
            <div className="op-id-top"><img src={CREST} alt="" /><b>TRAINEE ID CARD</b><s>练习生证</s></div>
            <div className="op-id-in">
              <div className="op-id-pic">{c.photo ? <img src={c.photo} alt="" /> : <span>{c.name.slice(0, 1)}</span>}</div>
              <div className="op-id-kv">
                <div><em>姓名</em>{c.name}</div>
                <div><em>生日</em>{c.birthday.replace(/-/g, ".")}{age != null ? `（${age}岁）` : ""}</div>
                <div><em>国籍</em>{c.nationality || "—"}</div>
                <div><em>特长</em>{talentLabels(c.talents).join(" · ") || "—"}</div>
                <div><em>所属</em><span className="op-dim">— 还没有 —</span></div>
              </div>
            </div>
            <div className="op-id-no">No. {c.start.replace(/-/g, ".")}</div>
            <img src={CREST} alt="" className="op-id-wm" />
            {stamping ? <div className="op-stamp"><span>{c.start.replace(/-/g, ".")}</span><b>START</b><span>SEOUL</span></div> : null}
          </div>
          <SignaturePad value={c.signature} onChange={v => set("signature", v)} />
          <p className="op-final-hint">「所属」那一栏空着<br />等你进了哪家公司，这里会盖上公司的章</p>
          <div className="op-foot is-static">
            <button type="button" className="op-frame-btn is-plain" onClick={() => setStep(5)} disabled={stamping}>返回修改</button>
            <span />
            <button type="button" className="op-frame-btn" onClick={stamp} disabled={stamping}>{stamping ? "盖章中" : "盖章 · 开始"}</button>
          </div>
        </div>
        {stamping ? <div className="op-flash" /> : null}
      </div>
    );
  }

  return (
    <div className="op-root">
      <div className="op-paper">
        <div className="op-head">
          <img src={CREST} alt="" />
          <div><div className="op-t1">지원서 · 申请表</div><div className="op-t2">APPLICATION</div></div>
        </div>
        <div className="op-step">0{step} / 0{STEPS}</div>
        <div className="op-body">
          {step === 1 ? (
            <>
              <div className="op-pr">
                <button type="button" className="op-photo" onClick={() => fileRef.current?.click()}>
                  {c.photo ? <img src={c.photo} alt="" /> : <><span>＋</span>贴照片</>}
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try { set("photo", await shrinkPhoto(f)); } catch { onNotice?.("图片读不出来"); }
                }} />
                <div className="op-fl">
                  <label className="op-f"><em>성명 姓名</em><input value={c.name} onChange={e => set("name", e.target.value)} /></label>
                  <label className="op-f"><em>생년월일 生日</em><input type="date" value={c.birthday} onChange={e => set("birthday", e.target.value)} /></label>
                  <label className="op-f"><em>국적 国籍</em><input value={c.nationality} onChange={e => set("nationality", e.target.value)} /></label>
                  <label className="op-f"><em>MBTI</em><input value={c.mbti} placeholder="可不填" onChange={e => set("mbti", e.target.value.toUpperCase())} /></label>
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="op-sec">外貌</div>
              <textarea className="op-line" rows={2} value={c.looks} placeholder="写一两句你长什么样" onChange={e => set("looks", e.target.value)} />
              <div className="op-sec">起点</div>
              <label className="op-f"><em>등록일 起点</em><input type="date" value={c.start} onChange={e => set("start", e.target.value)} /></label>
              <label className="op-f"><em>多久出道</em><input value={c.trainLength} placeholder="打算当多久练习生，比如一年半" onChange={e => set("trainLength", e.target.value)} /></label>
              <p className="op-note">起点就是这个世界开始的那天，世界时钟会拨到这天早上。</p>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="op-sec">家境</div>
              <div className="op-chk">
                {FAMILY_OPTIONS.map(f => (
                  <button key={f.id} type="button" className={c.family === f.id ? "on" : ""} onClick={() => set("family", f.id)}>
                    <span>{c.family === f.id ? "✓" : ""}</span>{f.label}<small>{f.hint}</small>
                  </button>
                ))}
              </div>
              {c.family === "custom" ? (
                <input className="op-line" value={c.familyCustom} placeholder="你的家境是？" onChange={e => set("familyCustom", e.target.value)} />
              ) : null}
              {c.family ? (
                <textarea className="op-line" rows={2} value={c.familyNote} placeholder="补充一下（可以不填）" onChange={e => set("familyNote", e.target.value)} />
              ) : null}
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="op-sec">特长（可多选）</div>
              <div className="op-grid">
                {TALENT_OPTIONS.map(t => {
                  const on = c.talents.includes(t.id);
                  return (
                    <button key={t.id} type="button" className={on ? "on" : ""} onClick={() => set("talents", on ? c.talents.filter(x => x !== t.id) : [...c.talents, t.id])}>
                      <small>{t.ko} {t.zh}</small>
                      <b>{on ? "★" : ""}</b>
                    </button>
                  );
                })}
              </div>
              {c.talents.length ? (
                <textarea className="op-line" rows={2} value={c.talentNote} placeholder="补充一下（可以不填）" onChange={e => set("talentNote", e.target.value)} />
              ) : null}
              <div className="op-sec">短板</div>
              <input className="op-line" value={c.weakness} placeholder="可以不填" onChange={e => set("weakness", e.target.value)} />
            </>
          ) : null}

          {step === 5 ? (
            <>
              <div className="op-sec">其他</div>
              <textarea className="op-line" rows={6} value={c.other} placeholder="还有什么想写的都写在这里，可以不填" onChange={e => set("other", e.target.value)} />
              <div className="op-review">
                <div><em>姓名</em>{c.name}</div>
                <div><em>家境</em>{familyLabel(c)}{c.familyNote ? `（${c.familyNote}）` : ""}</div>
                <div><em>特长</em>{talentLabels(c.talents).join("、") || "—"}</div>
                <div><em>起点</em>{c.start ? fmtDot(c.start) : "—"}</div>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {/* 三格固定：左上一页、中随便、右下一页，每页位置和大小都一样 */}
      <div className="op-foot">
        <button type="button" className="op-frame-btn is-plain" style={{ visibility: step > 1 ? "visible" : "hidden" }} onClick={() => setStep(s => s - 1)}>上一页</button>
        <button type="button" className="op-frame-btn is-plain" style={{ visibility: step < 5 ? "visible" : "hidden" }} onClick={random}>随便</button>
        <button type="button" className="op-frame-btn" onClick={next}>{step === 5 ? "生成证件" : "下一页"}</button>
      </div>
    </div>
  );
}

function SignaturePad({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ratio = window.devicePixelRatio || 1;
    cv.width = cv.clientWidth * ratio;
    cv.height = cv.clientHeight * ratio;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#4a4560";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, cv.clientWidth, cv.clientHeight);
      img.src = value;
    }
    // 只在挂上时画一次已有签名
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  return (
    <div className="op-sign">
      <em>签名 서명</em>
      <canvas
        ref={ref}
        onPointerDown={e => {
          drawing.current = true;
          ref.current?.setPointerCapture(e.pointerId);
          const ctx = ref.current?.getContext("2d");
          const [x, y] = pos(e);
          ctx?.beginPath();
          ctx?.moveTo(x, y);
        }}
        onPointerMove={e => {
          if (!drawing.current) return;
          const ctx = ref.current?.getContext("2d");
          const [x, y] = pos(e);
          ctx?.lineTo(x, y);
          ctx?.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          onChange(ref.current?.toDataURL("image/png") ?? null);
        }}
      />
      <div className="op-sign-line" />
      <button type="button" className="op-sign-clear" onClick={() => {
        const cv = ref.current;
        cv?.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
        onChange(null);
      }}>重签</button>
      <small>用手指签</small>
    </div>
  );
}
