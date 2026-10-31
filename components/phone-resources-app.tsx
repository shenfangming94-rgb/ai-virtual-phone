"use client";

import { useCallback, useState } from "react";
import { Filter, MoreHorizontal } from "lucide-react";
import { MemoryBankPage } from "./memory/memory-bank-page";
import { loadCharacters } from "@/lib/character-storage";
import { PageShell } from "./ui/page-shell";

type MemoryView = "list" | "detail" | "settings";

export function PhoneResourcesApp({ onClose, onNotice }: { onClose: () => void; onNotice?: (msg: string) => void }) {
    const [memoryView, setMemoryView] = useState<MemoryView>("list");
    const [prevMemoryView, setPrevMemoryView] = useState<MemoryView>("list");
    const [memoryCharId, setMemoryCharId] = useState<string>("");
    const [memoryCharName, setMemoryCharName] = useState<string>("");
    const [memoryFilterOpen, setMemoryFilterOpen] = useState(false);
    const [memoryFilterState, setMemoryFilterState] = useState({ visible: false, activeCount: 0 });

    const handleMemoryFilterOpenChange = useCallback((open: boolean) => {
        setMemoryFilterOpen(open);
    }, []);

    const handleMemoryFilterStateChange = useCallback((state: { visible: boolean; activeCount: number }) => {
        setMemoryFilterState(state);
    }, []);

    const handleBack = () => {
        setMemoryFilterOpen(false);
        if (memoryView === "settings") {
            setMemoryView(prevMemoryView);
        } else if (memoryView === "detail") {
            setMemoryView("list");
        } else {
            onClose();
        }
    };

    const handleSelectChar = (charId: string) => {
        const char = loadCharacters().find(c => c.id === charId);
        setMemoryCharId(charId);
        setMemoryCharName(char?.name ?? "");
        setMemoryView("detail");
    };

    const handleOpenSettings = () => {
        setMemoryFilterOpen(false);
        setPrevMemoryView(memoryView);
        setMemoryView("settings");
    };

    const title = memoryView === "settings"
        ? "记忆设置"
        : memoryView === "detail"
            ? (memoryCharName || "记忆详情")
            : "";
    const showSettingsIcon = memoryView !== "settings";
    const showMemoryFilterIcon = memoryView === "detail" && memoryFilterState.visible;

    return (
        <PageShell
            title={title}
            onBack={handleBack}
            className={memoryView === "detail" ? "mem-detail" : undefined}
            rightAction={showSettingsIcon ? (
                <div className="memory-header-actions">
                    {showMemoryFilterIcon ? (
                        <button
                            onClick={() => setMemoryFilterOpen(true)}
                            className="page-back-btn memory-header-filter-btn"
                            type="button"
                            aria-label="筛选记忆来源"
                            title="筛选记忆来源"
                        >
                            <Filter size={20} strokeWidth={1.6} />
                            {memoryFilterState.activeCount > 0 ? (
                                <span className="memory-header-filter-badge">{memoryFilterState.activeCount}</span>
                            ) : null}
                        </button>
                    ) : null}
                    <button
                        onClick={handleOpenSettings}
                        className="page-back-btn"
                        type="button"
                        aria-label="记忆选项"
                    >
                        <MoreHorizontal size={22} strokeWidth={1.5} />
                    </button>
                </div>
            ) : undefined}
        >
            <div
                className="flex-1 relative"
                style={{
                    overflowY: memoryView === "detail" ? "hidden" : "auto",
                    minHeight: 0,
                }}
            >
                <MemoryBankPage
                    view={memoryView}
                    selectedCharId={memoryCharId}
                    onSelectChar={handleSelectChar}
                    onOpenSettings={handleOpenSettings}
                    onNotice={onNotice}
                    filterOpen={memoryFilterOpen}
                    onFilterOpenChange={handleMemoryFilterOpenChange}
                    onFilterStateChange={handleMemoryFilterStateChange}
                />
            </div>
        </PageShell>
    );
}
