"use client";

import { WorldTimeSettings } from "./settings/world-time-settings";
import { PageShell } from "./ui/page-shell";

/** 时钟：爱豆小手机里改世界时间的地方（和设置里的「世界时间」是同一页） */
export function ClockApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  return (
    <PageShell title="时钟" onBack={onClose}>
      <div style={{ padding: "12px 16px 32px" }}>
        <WorldTimeSettings onNotice={onNotice} />
      </div>
    </PageShell>
  );
}
