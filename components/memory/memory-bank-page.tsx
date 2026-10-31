"use client";

import { Component, useState, useEffect, useCallback, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { Trash2, Zap, Clock, Users, Archive, AlertCircle, Search, Brain, FileText, MoreHorizontal, Plus, FolderPlus, SquarePen, Edit3, X, Check, ChevronRight, Filter, Download, Upload, type LucideIcon } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/modal";
import { getMemoryEventSourceTag, MEMORY_SOURCE_TAG_ORDER, MemoryTimeline } from "./memory-timeline";
import { Toggle } from "@/components/ui/form";
import { loadCharacters } from "@/lib/character-storage";
import type { Character } from "@/lib/character-types";
import type { MemoryEntry, MemoryConfig } from "@/lib/memory-types";
import { DEFAULT_CORE_MEMORY_PROMPT, DEFAULT_SUMMARIZATION_PROMPT } from "@/lib/memory-types";
import {
    loadMemoryConfig,
    saveMemoryConfig,
    loadMemoryEntriesByType,
    saveMemoryEntry,
    deleteMemoryEntry,
    deleteCharacterMemoriesByType,
    getAllCharacterIdsWithMemories,
    getMemoryCountByType,
    getLastSummarizedTimestamp,
    getLastCoreSummarizedTimestamp,
} from "@/lib/memory-storage";
import { hydrateChatStorage } from "@/lib/chat-storage";
import { loadNativeTimeline, type NativeTimelineEntry } from "@/lib/short-term-assembler";
import { exportMemoryBackup, importMemoryPack, parseMemoryBackup, type CharacterMemoryPack } from "@/lib/memory-backup";
import { deleteShortTermEntries, deleteShortTermEntry, editShortTermEntry, restoreShortTermEntry, splitShortTermLine } from "@/lib/short-term-edits";
import { runSummarizationPipeline } from "@/lib/memory-summarizer";
import { runCoreMemoryPipeline } from "@/lib/core-memory-builder";
import { resolveAuxiliaryApiConfig, resolveUserIdentity } from "@/lib/settings-storage";
import { generateEmbedding, resolveEmbeddingModel } from "@/lib/memory-embedding";
import { BINDING_ACCENTS } from "@/lib/ui-accent-colors";

type MemoryView = "list" | "detail" | "settings";
type MemoryTab = "short" | "shared" | "core" | "long";
type MemoryBudgetKey = "shortTermTokenBudget" | "coreMemoryTokenBudget" | "longTermTokenBudget";

const MEMORY_TOKEN_BUDGET_MAX = 100000;
const MEMORY_TOKEN_BUDGET_MIN: Record<MemoryBudgetKey, number> = {
    shortTermTokenBudget: 1000,
    coreMemoryTokenBudget: 100,
    longTermTokenBudget: 200,
};
const MEMORY_TOKEN_BUDGET_STEP: Record<MemoryBudgetKey, number> = {
    shortTermTokenBudget: 5000,
    coreMemoryTokenBudget: 1000,
    longTermTokenBudget: 1000,
};
const MANUAL_MEMORY_CONTENT_LIMIT = 3000;
// 详情页时间线最多解析渲染的条数：全量历史可能有几万条，
// 一次性解析+渲染会把 iOS Safari 的单页内存顶爆（灰屏杀页）
const MEMORY_TIMELINE_ENTRY_CAP = 2000;

/** 详情页兜底：时间线渲染抛错时显示提示，而不是整页白屏 */
class MemoryDetailBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        if (this.state.failed) {
            return <p className="text-center ts-14 mt-10 text-secondary">这一页加载出错了，返回上一页再试一次。</p>;
        }
        return this.props.children;
    }
}

type SummarizeRange = "auto" | "all" | number;

const SUMMARIZE_RANGE_OPTIONS: Array<{ value: SummarizeRange; label: string; desc?: string }> = [
    { value: "auto", label: "接着上次总结", desc: "默认方式，从上次进度继续" },
    { value: 1, label: "最近 1 天" },
    { value: 3, label: "最近 3 天" },
    { value: 7, label: "最近 7 天" },
    { value: 14, label: "最近 14 天" },
    { value: 30, label: "最近 30 天" },
    { value: "all", label: "全部历史" },
];

type MemorySourceKey = keyof NonNullable<MemoryConfig["shortTermAllowedSources"]>;

/** 记忆来源开关：同时作用于短期上下文与长期总结 */
const MEMORY_SOURCE_OPTIONS: Array<{ key: MemorySourceKey; label: string }> = [
    { key: "chat", label: "私聊上下文" },
    { key: "group_chat", label: "群聊上下文" },
    { key: "moments", label: "朋友圈" },
    { key: "checkphone", label: "查手机" },
    { key: "diary", label: "手记便签" },
    { key: "xiaohongshu", label: "小红书" },
    { key: "interview_magazine", label: "在场访谈" },
    { key: "cocreate", label: "共创" },
    { key: "game", label: "内置小游戏" },
    { key: "story", label: "剧情小剧场" },
    { key: "vn", label: "漫卷" },
    { key: "adventure", label: "地图冒险" },
    { key: "custom_app", label: "自定义应用" },
];

type MemoryEditorState = {
    type: MemoryEntry["type"];
    entry?: MemoryEntry;
    content: string;
};

const memorySettingsIconStyle = (color: string): CSSProperties => ({
    "--icon-color": color,
} as CSSProperties);

function MemorySettingsIcon({ icon: Icon, color }: { icon: LucideIcon; color: string }) {
    return (
        <span className="card-icon" style={memorySettingsIconStyle(color)}>
            <Icon size={22} strokeWidth={1.75} />
        </span>
    );
}

function MemorySettingsSliderItem({
    icon,
    color,
    label,
    desc,
    value,
    min,
    max,
    step,
    onChange,
}: {
    icon: LucideIcon;
    color: string;
    label: string;
    desc: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
}) {
    return (
        <div className="menu-item memory-slider-item">
            <div className="memory-slider-header">
                <MemorySettingsIcon icon={icon} color={color} />
                <div className="menu-label-group">
                    <span className="menu-label">{label}</span>
                    <span className="menu-desc">{desc}</span>
                </div>
                <span className="ui-slider-value memory-slider-current">{value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="ui-slider memory-settings-slider"
                aria-label={label}
            />
        </div>
    );
}

function relativeTime(isoStr: string): string {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}天前`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}周前`;
    return `${Math.floor(days / 30)}个月前`;
}

type CharacterMemoryInfo = {
    character: Character;
    longTermCount: number;
    coreCount: number;
    shortTermCount: number;
};

type Props = {
    view: MemoryView;
    selectedCharId?: string;
    onSelectChar: (charId: string) => void;
    onOpenSettings?: () => void;
    onNotice?: (msg: string) => void;
    filterOpen?: boolean;
    onFilterOpenChange?: (open: boolean) => void;
    onFilterStateChange?: (state: { visible: boolean; activeCount: number }) => void;
};

export function MemoryBankPage({
    view,
    selectedCharId,
    onSelectChar,
    onOpenSettings,
    onNotice,
    filterOpen = false,
    onFilterOpenChange,
    onFilterStateChange,
}: Props) {
    const [config, setConfig] = useState<MemoryConfig>(loadMemoryConfig);
    const [characters, setCharacters] = useState<CharacterMemoryInfo[]>([]);
    const [activeTab, setActiveTab] = useState<MemoryTab>("short");
    const [coreEntries, setCoreEntries] = useState<MemoryEntry[]>([]);
    const [longTermEntries, setLongTermEntries] = useState<MemoryEntry[]>([]);
    const [shortTermEvents, setShortTermEvents] = useState<NativeTimelineEntry[]>([]);
    const [sharedEvents, setSharedEvents] = useState<NativeTimelineEntry[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [summarizing, setSummarizing] = useState(false);
    const [rebuildingCore, setRebuildingCore] = useState(false);
    const [editingPrompt, setEditingPrompt] = useState<string | null>(null);
    const [editingCorePrompt, setEditingCorePrompt] = useState<string | null>(null);
    const [confirmDeleteEntryId, setConfirmDeleteEntryId] = useState<string | null>(null);
    const [confirmClearAll, setConfirmClearAll] = useState(false);
    const [listSearch, setListSearch] = useState("");
    const [createTargetOpen, setCreateTargetOpen] = useState(false);
    const [entryMenuId, setEntryMenuId] = useState<string | null>(null);
    const [memoryEditor, setMemoryEditor] = useState<MemoryEditorState | null>(null);
    const [savingMemory, setSavingMemory] = useState(false);
    const [summarizeRangeOpen, setSummarizeRangeOpen] = useState(false);
    const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
    const [activeTimelineTags, setActiveTimelineTags] = useState<Set<string>>(new Set());
    // 短期记忆：点一条 → 编辑/删除（只改他记得的版本，聊天记录不动）
    const [stActionId, setStActionId] = useState<string | null>(null);
    const [stEditor, setStEditor] = useState<{ id: string; prefix: string; body: string } | null>(null);
    const [stConfirmDeleteId, setStConfirmDeleteId] = useState<string | null>(null);
    const [stConfirmDeleteIds, setStConfirmDeleteIds] = useState<string[] | null>(null);
    // 记忆备份
    const [backupBusy, setBackupBusy] = useState(false);
    const [importPlan, setImportPlan] = useState<{ pack: CharacterMemoryPack; target: string }[] | null>(null);
    const memoryFileRef = useRef<HTMLInputElement>(null);
    const pendingLongTermEditorRef = useRef(false);

    const disabledSourceCount = MEMORY_SOURCE_OPTIONS
        .filter(source => (config.shortTermAllowedSources ?? {})[source.key] === false).length;

    // Resolve selected character object from ID
    const selectedChar = selectedCharId
        ? loadCharacters().find(c => c.id === selectedCharId) ?? null
        : null;

    const filterEvents = activeTab === "shared" ? sharedEvents : shortTermEvents;
    const timelineTagCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const event of filterEvents) {
            const tag = getMemoryEventSourceTag(event);
            counts.set(tag, (counts.get(tag) || 0) + 1);
        }
        return Array.from(counts.entries()).sort((a, b) =>
            MEMORY_SOURCE_TAG_ORDER.indexOf(a[0]) - MEMORY_SOURCE_TAG_ORDER.indexOf(b[0]));
    }, [filterEvents]);

    const timelineFilterVisible = view === "detail" && (activeTab === "short" || activeTab === "shared");

    useEffect(() => {
        onFilterStateChange?.({ visible: timelineFilterVisible, activeCount: activeTimelineTags.size });
    }, [activeTimelineTags.size, onFilterStateChange, timelineFilterVisible]);

    useEffect(() => {
        setActiveTimelineTags(new Set());
        onFilterOpenChange?.(false);
    }, [activeTab, onFilterOpenChange, selectedCharId]);

    const loadCharacterList = useCallback(async (isCancelled?: () => boolean) => {
        const allChars = loadCharacters();

        let charIdsWithMem: string[] = [];
        try { charIdsWithMem = await getAllCharacterIdsWithMemories(); } catch { /* DB may fail */ }

        const infos: CharacterMemoryInfo[] = [];
        const seen = new Set<string>();

        // Characters with memories first
        for (const id of charIdsWithMem) {
            const char = allChars.find(c => c.id === id);
            if (!char) continue;
            seen.add(id);
            let ltCount = 0;
            let coreCount = 0;
            try {
                [ltCount, coreCount] = await Promise.all([
                    getMemoryCountByType(id, "long_term"),
                    getMemoryCountByType(id, "core"),
                ]);
            } catch { /* ignore */ }
            infos.push({ character: char, longTermCount: ltCount, coreCount, shortTermCount: 0 });
        }

        // Remaining characters
        for (const char of allChars) {
            if (seen.has(char.id)) continue;
            infos.push({ character: char, longTermCount: 0, coreCount: 0, shortTermCount: 0 });
        }

        if (isCancelled?.()) return;
        setCharacters(infos);

        // 短期计数逐个异步补齐：loadNativeTimeline 是全量组装，重数据账号
        // 在循环里同步跑完会长时间卡死主线程、瞬时吃掉大量内存
        for (const info of infos) {
            await new Promise(resolve => setTimeout(resolve, 0));
            if (isCancelled?.()) return;
            let stCount = 0;
            try { stCount = loadNativeTimeline(info.character.id).length; } catch { /* ignore */ }
            if (isCancelled?.()) return;
            setCharacters(prev => prev.map(item =>
                item.character.id === info.character.id ? { ...item, shortTermCount: stCount } : item));
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        void loadCharacterList(() => cancelled);
        return () => { cancelled = true; };
    }, [loadCharacterList]);

    // Load detail data when entering detail view
    const loadDetailData = useCallback(async (charId: string) => {
        setLoading(true);
        try {
            await hydrateChatStorage();
            const [core, lt] = await Promise.all([
                loadMemoryEntriesByType(charId, "core"),
                loadMemoryEntriesByType(charId, "long_term"),
            ]);
            setCoreEntries(core);
            setLongTermEntries(lt);
        } catch {
            setCoreEntries([]);
            setLongTermEntries([]);
        }
        // Native timeline is sync (localStorage) — no await needed.
        // 只取最近一段（全量可能几万条），防止解析+渲染把 iOS Safari 内存顶爆
        const timeline = loadNativeTimeline(charId).slice(-MEMORY_TIMELINE_ENTRY_CAP);
        setShortTermEvents(timeline.filter(e =>
            !(e.sourceApp === "moments" && e.postAuthorType === "user")
            && !(e.sourceApp === "interview_magazine" && e.sourceDetail === "interview_shared_issue")
        ));
        setSharedEvents(timeline.filter(e =>
            (e.sourceApp === "moments" && e.postAuthorType === "user") ||
            (e.sourceApp === "chat" && e.sourceDetail === "group") ||
            (e.sourceApp === "interview_magazine" && e.sourceDetail === "interview_shared_issue")
        ));
        setLoading(false);
    }, []);

    // Reload detail data when view changes to detail
    useEffect(() => {
        if (view === "detail" && selectedCharId) {
            const openNewNote = pendingLongTermEditorRef.current;
            pendingLongTermEditorRef.current = false;
            setActiveTab(openNewNote ? "long" : "short");
            setExpandedId(null);
            setMemoryEditor(openNewNote ? { type: "long_term", content: "" } : null);
            loadDetailData(selectedCharId);
        }
    }, [view, selectedCharId, loadDetailData]);

    // Reset editing prompt when leaving settings
    useEffect(() => {
        if (view !== "settings") {
            setEditingPrompt(null);
            setEditingCorePrompt(null);
        }
    }, [view]);

    const handleSelectChar = (char: Character) => {
        setCreateTargetOpen(false);
        onSelectChar(char.id);
    };

    const handleCreateNoteForChar = (char: Character) => {
        pendingLongTermEditorRef.current = true;
        setCreateTargetOpen(false);
        onSelectChar(char.id);
    };

    const handleDeleteEntry = async (id: string) => {
        await deleteMemoryEntry(id);
        setCoreEntries(prev => prev.filter(e => e.id !== id));
        setLongTermEntries(prev => prev.filter(e => e.id !== id));
        setEntryMenuId(null);
        loadCharacterList();
    };

    const handleClearEntries = async (type: "core" | "long_term") => {
        if (!selectedCharId) return;
        await deleteCharacterMemoriesByType(selectedCharId, type);
        if (type === "core") setCoreEntries([]);
        else setLongTermEntries([]);
        loadCharacterList();
    };

    const showNotice = (msg: string) => {
        onNotice?.(msg);
    };

    const handleExportMemories = async (all: boolean) => {
        if (backupBusy) return;
        const chars = loadCharacters();
        const list = all ? chars : chars.filter(c => c.id === selectedCharId);
        if (!list.length) return;
        setBackupBusy(true);
        try {
            const day = new Date().toISOString().slice(0, 10);
            const name = all ? `全部角色记忆-${day}.json` : `${list[0].name || "角色"}的记忆-${day}.json`;
            const count = await exportMemoryBackup(list.map(c => ({ id: c.id, name: c.name })), name);
            showNotice(`已导出 ${list.length} 个角色、${count} 条记忆`);
        } catch (err) {
            showNotice("导出失败: " + String(err));
        } finally {
            setBackupBusy(false);
        }
    };

    const handlePickMemoryFile = async (file: File) => {
        const packs = parseMemoryBackup(await file.text());
        if (!packs || !packs.length) {
            showNotice("没认出来，请选记忆库或档案库导出的文件");
            return;
        }
        const chars = loadCharacters();
        // 先按 id 找，再按名字找；只有一份时默认导给正在看的角色
        setImportPlan(packs.map(pack => {
            const byId = chars.find(c => c.id === pack.characterId);
            const byName = chars.find(c => c.name === pack.characterName);
            const fallback = packs.length === 1 && selectedCharId ? selectedCharId : "";
            return { pack, target: byId?.id ?? byName?.id ?? fallback };
        }));
    };

    const handleRunImport = async () => {
        if (!importPlan || backupBusy) return;
        setBackupBusy(true);
        let added = 0;
        let skipped = 0;
        try {
            for (const item of importPlan) {
                if (!item.target) continue;
                const r = await importMemoryPack(item.pack, item.target);
                added += r.added;
                skipped += r.skipped;
            }
            setImportPlan(null);
            showNotice(skipped ? `导入了 ${added} 条，${skipped} 条已经有了跳过` : `导入了 ${added} 条记忆`);
            loadCharacterList();
            if (selectedCharId) loadDetailData(selectedCharId);
        } catch (err) {
            showNotice("导入失败: " + String(err));
        } finally {
            setBackupBusy(false);
        }
    };

    const findTimelineEntry = (id: string) =>
        shortTermEvents.find(e => e.id === id) ?? sharedEvents.find(e => e.id === id) ?? null;

    const updateTimelineEntry = (id: string, next: NativeTimelineEntry | null) => {
        const apply = (list: NativeTimelineEntry[]) => next
            ? list.map(e => e.id === id ? next : e)
            : list.filter(e => e.id !== id);
        setShortTermEvents(apply);
        setSharedEvents(apply);
    };

    const openShortTermEditor = (id: string) => {
        const entry = findTimelineEntry(id);
        setStActionId(null);
        if (!entry) return;
        setStEditor({ id, ...splitShortTermLine(entry.content) });
    };

    const handleSaveShortTermEdit = () => {
        if (!stEditor) return;
        const body = stEditor.body.trim();
        if (!body) {
            showNotice("内容不能为空，不想要可以直接删除");
            return;
        }
        const entry = findTimelineEntry(stEditor.id);
        editShortTermEntry(stEditor.id, stEditor.prefix, body);
        if (entry) updateTimelineEntry(stEditor.id, { ...entry, content: stEditor.prefix + body, edited: true });
        setStEditor(null);
        showNotice("改好了，他会记成这个版本");
    };

    const handleDeleteShortTerm = (id: string) => {
        deleteShortTermEntry(id);
        updateTimelineEntry(id, null);
        setStConfirmDeleteId(null);
        showNotice("他已经忘掉这条了");
    };

    const handleDeleteShortTermCluster = (ids: string[]) => {
        deleteShortTermEntries(ids);
        const gone = new Set(ids);
        setShortTermEvents(list => list.filter(e => !gone.has(e.id)));
        setSharedEvents(list => list.filter(e => !gone.has(e.id)));
        setStConfirmDeleteIds(null);
        showNotice(`他已经忘掉这一段了（${ids.length} 条）`);
    };

    const handleRestoreShortTerm = (id: string) => {
        restoreShortTermEntry(id);
        setStActionId(null);
        if (selectedCharId) loadDetailData(selectedCharId);
        showNotice("已恢复原样");
    };

    const handleManualSummarize = async (range: SummarizeRange = "auto") => {
        if (!selectedCharId || summarizing) return;
        setSummarizeRangeOpen(false);
        setSummarizing(true);
        try {
            const sinceTimestamp = typeof range === "number"
                ? new Date(Date.now() - range * 86400000).toISOString()
                : undefined;
            const afterTimestamp = range === "all"
                ? undefined
                : sinceTimestamp ?? getLastSummarizedTimestamp(selectedCharId) ?? undefined;
            const timelineCount = loadNativeTimeline(
                selectedCharId,
                afterTimestamp ? { afterTimestamp } : undefined,
            ).length;
            if (timelineCount < 4) {
                showNotice("所选范围内事件不足 4 条");
                return;
            }

            const result = await runSummarizationPipeline(
                selectedCharId,
                selectedChar?.name ?? "",
                range === "all" ? { force: true } : sinceTimestamp ? { sinceTimestamp } : undefined,
            );
            if (result.success) {
                showNotice("总结完成");
                loadDetailData(selectedCharId);
                loadCharacterList();
            } else {
                showNotice(result.error || "总结失败");
            }
        } catch (err) {
            console.error("[MemoryBank] Manual summarize failed:", err);
            showNotice("总结失败: " + String(err));
        } finally {
            setSummarizing(false);
        }
    };

    const handleManualRebuildCore = async () => {
        if (!selectedCharId || rebuildingCore) return;
        setRebuildingCore(true);
        try {
            const lastCoreSummarizedAt = getLastCoreSummarizedTimestamp(selectedCharId);
            const longTermEntries = await loadMemoryEntriesByType(selectedCharId, "long_term");
            const pendingLongTermCount = longTermEntries.filter(entry =>
                !lastCoreSummarizedAt || entry.createdAt > lastCoreSummarizedAt
            ).length;
            if (pendingLongTermCount === 0) {
                showNotice(lastCoreSummarizedAt ? "没有新的长期记忆需要总结" : "没有可用于总结核心记忆的长期记忆");
                return;
            }

            const result = await runCoreMemoryPipeline(selectedCharId, selectedChar?.name ?? "");
            if (result.success) {
                showNotice(result.rebuiltCount ? `核心记忆已重建（${result.rebuiltCount}条）` : "核心记忆已重建");
                loadDetailData(selectedCharId);
                loadCharacterList();
            } else {
                showNotice(result.error || "核心记忆重建失败");
            }
        } catch (err) {
            console.error("[MemoryBank] Manual core rebuild failed:", err);
            showNotice("核心记忆重建失败: " + String(err));
        } finally {
            setRebuildingCore(false);
        }
    };

    const saveBudget = (key: MemoryBudgetKey, value: number) => {
        if (!Number.isFinite(value)) return;
        const min = MEMORY_TOKEN_BUDGET_MIN[key];
        const nextValue = Math.min(MEMORY_TOKEN_BUDGET_MAX, Math.max(min, Math.round(value)));
        const next = { ...config, [key]: nextValue };
        setConfig(next);
        saveMemoryConfig(next);
    };

    const saveInterval = (value: number) => {
        if (!Number.isFinite(value)) return;
        const nextValue = Math.min(200, Math.max(10, Math.round(value)));
        const next = { ...config, summarizationEventInterval: nextValue };
        setConfig(next);
        saveMemoryConfig(next);
    };

    const saveCoreInterval = (value: number) => {
        if (!Number.isFinite(value)) return;
        const nextValue = Math.min(20, Math.max(1, Math.round(value)));
        const next = { ...config, coreSummarizationInterval: nextValue };
        setConfig(next);
        saveMemoryConfig(next);
    };

    // ── Prompt editing ──
    const handleSavePrompt = () => {
        if (editingPrompt === null) return;
        const next = { ...config, summarizationPrompt: editingPrompt };
        setConfig(next);
        saveMemoryConfig(next);
        showNotice("提示词已保存");
    };

    const handleResetPrompt = () => {
        setEditingPrompt(DEFAULT_SUMMARIZATION_PROMPT);
        const next = { ...config, summarizationPrompt: DEFAULT_SUMMARIZATION_PROMPT };
        setConfig(next);
        saveMemoryConfig(next);
        showNotice("已恢复默认提示词");
    };

    const handleSaveCorePrompt = () => {
        if (editingCorePrompt === null) return;
        const next = { ...config, coreMemoryPrompt: editingCorePrompt };
        setConfig(next);
        saveMemoryConfig(next);
        showNotice("核心记忆提示词已保存");
    };

    const handleResetCorePrompt = () => {
        setEditingCorePrompt(DEFAULT_CORE_MEMORY_PROMPT);
        const next = { ...config, coreMemoryPrompt: DEFAULT_CORE_MEMORY_PROMPT };
        setConfig(next);
        saveMemoryConfig(next);
        showNotice("核心记忆提示词已恢复默认");
    };

    const createManualMemoryId = (type: MemoryEntry["type"]) => (
        `mem_${type === "core" ? "core" : "lt"}_manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );

    const isManualMemoryEntry = (entry: MemoryEntry) => {
        const origin = String(entry.metadata?.origin ?? "");
        return origin === "user_manual" || origin === "user_edited" || entry.id.includes("_manual_");
    };

    const maybeBuildManualMemoryEmbedding = async (type: MemoryEntry["type"], content: string): Promise<number[] | undefined> => {
        if (type !== "long_term" || !config.vectorRecallEnabled) return undefined;
        const embeddingApiConfig = resolveAuxiliaryApiConfig("embeddingApiConfigId");
        if (!embeddingApiConfig || !resolveEmbeddingModel(embeddingApiConfig)) return undefined;
        try {
            return await generateEmbedding(content, embeddingApiConfig) ?? undefined;
        } catch {
            return undefined;
        }
    };

    const openCreateMemoryEditor = (type: MemoryEntry["type"]) => {
        setEntryMenuId(null);
        setMemoryEditor({ type, content: "" });
    };

    const openEditMemoryEditor = (entry: MemoryEntry) => {
        setEntryMenuId(null);
        setMemoryEditor({ type: entry.type, entry, content: entry.content });
    };

    const handleSaveManualMemory = async () => {
        if (!selectedCharId || !memoryEditor || savingMemory) return;
        const content = memoryEditor.content.trim();
        if (!content) {
            showNotice("记忆内容不能为空");
            return;
        }
        if (content.length > MANUAL_MEMORY_CONTENT_LIMIT) {
            showNotice(`记忆内容过长，请控制在 ${MANUAL_MEMORY_CONTENT_LIMIT} 字以内`);
            return;
        }

        setSavingMemory(true);
        try {
            const now = new Date().toISOString();
            const type = memoryEditor.type;
            const source = memoryEditor.entry;
            const contentChanged = !source || source.content.trim() !== content;
            const embedding = type === "long_term"
                ? (contentChanged ? await maybeBuildManualMemoryEmbedding(type, content) : source?.embedding)
                : undefined;
            const entry: MemoryEntry = source
                ? {
                    ...source,
                    content,
                    embedding,
                    updatedAt: now,
                    metadata: {
                        ...(source.metadata ?? {}),
                        origin: isManualMemoryEntry(source) ? "user_manual" : "user_edited",
                        editedByUser: true,
                    },
                }
                : {
                    id: createManualMemoryId(type),
                    characterId: selectedCharId,
                    sourceApp: "chat",
                    type,
                    content,
                    embedding,
                    importance: type === "core" ? 0.95 : 0.8,
                    createdAt: now,
                    updatedAt: now,
                    metadata: {
                        origin: "user_manual",
                    },
                };

            await saveMemoryEntry(entry);
            if (type === "core") {
                setCoreEntries(prev => source ? prev.map(item => item.id === entry.id ? entry : item) : [...prev, entry]);
            } else {
                setLongTermEntries(prev => source ? prev.map(item => item.id === entry.id ? entry : item) : [...prev, entry]);
            }
            setMemoryEditor(null);
            setExpandedId(entry.id);
            loadCharacterList();
            showNotice(type === "core" ? "核心记忆已保存" : "长期记忆已保存");
        } catch (error) {
            console.error("[MemoryBank] Save manual memory failed:", error);
            showNotice("记忆保存失败: " + String(error));
        } finally {
            setSavingMemory(false);
        }
    };

    const renderMemoryEntries = (type: MemoryEntry["type"], entries: MemoryEntry[], emptyText: string) => {
        const label = type === "core" ? "核心记忆" : "长期记忆";
        return (
            <>
                {entries.length > 0 && (
                    <div className="mem-entry-toolbar">
                        <button
                            className="mem-entry-add-btn"
                            onClick={() => openCreateMemoryEditor(type)}
                        >
                            <Plus size={15} strokeWidth={1.8} />
                            <span>新增{label}</span>
                        </button>
                        <button
                            className="mem-entry-clear-btn"
                            onClick={() => setConfirmClearAll(true)}
                        >
                            <Trash2 size={15} strokeWidth={1.8} />
                            <span>清除{label}</span>
                        </button>
                    </div>
                )}
                {entryMenuId && (
                    <button
                        className="mem-entry-menu-backdrop"
                        aria-label="关闭菜单"
                        onClick={() => setEntryMenuId(null)}
                    />
                )}
                {entries.length === 0 ? (
                    <div className="mem-empty-card">
                        <p>{emptyText}</p>
                        <button className="mem-empty-add-btn" onClick={() => openCreateMemoryEditor(type)}>
                            <Plus size={14} />
                            <span>新增{label}</span>
                        </button>
                    </div>
                ) : (
                    entries.map(entry => (
                        <div
                            key={entry.id}
                            className={`g-card memory-report-card memo-memory-entry-card${entryMenuId === entry.id ? " is-menu-open" : ""}`}
                            onClick={() => {
                                if (entryMenuId) {
                                    setEntryMenuId(null);
                                    return;
                                }
                                setExpandedId(expandedId === entry.id ? null : entry.id);
                            }}
                        >
                            <div className="mem-report-head">
                                <span className="memo-memory-entry-date">{relativeTime(entry.createdAt)}</span>
                                <div className="mem-report-actions">
                                    <span className={`mem-origin-badge ${isManualMemoryEntry(entry) ? "is-manual" : ""}`}>
                                        {isManualMemoryEntry(entry) ? "MANUAL" : "AUTO"}
                                    </span>
                                    <div className="mem-entry-menu-wrap">
                                        <button
                                            className="mem-entry-menu-btn"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setEntryMenuId(prev => prev === entry.id ? null : entry.id);
                                            }}
                                            title="更多"
                                        >
                                            <MoreHorizontal size={18} />
                                        </button>
                                        {entryMenuId === entry.id && (
                                            <div className="mem-entry-menu" onClick={event => event.stopPropagation()}>
                                                <button onClick={() => openEditMemoryEditor(entry)}>
                                                    <Edit3 size={13} />
                                                    <span>编辑</span>
                                                </button>
                                                <button
                                                    className="is-danger"
                                                    onClick={() => {
                                                        setEntryMenuId(null);
                                                        setConfirmDeleteEntryId(entry.id);
                                                    }}
                                                >
                                                    <Trash2 size={13} />
                                                    <span>删除</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="memo-memory-entry-copy">
                                {expandedId === entry.id
                                    ? entry.content
                                    : entry.content.length > 100
                                        ? entry.content.slice(0, 100) + "..."
                                        : entry.content
                                }
                            </div>
                        </div>
                    ))
                )}
            </>
        );
    };


    // ── Detail View ──
    if (view === "detail" && selectedChar) {
        return (
            <div className="memo-detail-layout absolute inset-0">
                <div className="memory-detail-scroll flex-1 overflow-y-auto min-h-0">
                    <section className="memo-person-hero">
                        <span className={`memo-detail-avatar${selectedChar.avatar ? "" : " is-fallback"}`}>
                            {selectedChar.avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={selectedChar.avatar} alt="" draggable={false} />
                            ) : (
                                <span>{Array.from(selectedChar.name.trim())[0] || "?"}</span>
                            )}
                        </span>
                        <div>
                            <h1>{selectedChar.name}</h1>
                            <p>人物记忆夹</p>
                        </div>
                    </section>

                    <div className="memo-segmented-tabs" role="tablist" aria-label="记忆分类">
                        {([
                            { key: "short" as const, label: "短期" },
                            { key: "shared" as const, label: "共享事件" },
                            { key: "long" as const, label: "长期" },
                            { key: "core" as const, label: "核心" },
                        ]).map(tab => (
                            <button
                                key={tab.key}
                                type="button"
                                role="tab"
                                aria-selected={activeTab === tab.key}
                                className={`memo-segmented-tab${activeTab === tab.key ? " is-active" : ""}`}
                                onClick={() => {
                                    setActiveTab(tab.key);
                                    setEntryMenuId(null);
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="memo-detail-content">
                    <MemoryDetailBoundary>
                    {loading ? (
                        <p className="memo-detail-empty">
                            加载中...
                        </p>
                    ) : activeTab === "short" ? (
                        /* ── Short-term: card view ── */
                        <>
                            <MemoryTimeline
                                events={shortTermEvents}
                                userName={resolveUserIdentity(selectedCharId!)?.name || "用户"}
                                activeTags={activeTimelineTags}
                                onEntryTap={setStActionId}
                                onClusterDelete={setStConfirmDeleteIds}
                                resetKey={`${selectedCharId}:short`}
                                presentation="notes"
                            />
                        </>
                    ) : activeTab === "shared" ? (
                        /* ── Shared events: card view ── */
                        sharedEvents.length === 0 ? (
                            <p className="memo-detail-empty">
                                暂无共享事件。用户发朋友圈或参与群聊后会自动显示。
                            </p>
                        ) : (
                            <MemoryTimeline
                                events={sharedEvents}
                                userName={resolveUserIdentity(selectedCharId!)?.name || "用户"}
                                activeTags={activeTimelineTags}
                                onEntryTap={setStActionId}
                                onClusterDelete={setStConfirmDeleteIds}
                                resetKey={`${selectedCharId}:shared`}
                                presentation="notes"
                            />
                        )
                    ) : activeTab === "core" ? (
                        renderMemoryEntries("core", coreEntries, "暂无核心记忆。长期记忆累计到设定条数后会自动提炼，也可以手动新增。")
                    ) : (
                        /* ── Long-term: Summarized Memories ── */
                        renderMemoryEntries("long_term", longTermEntries, "暂无长期记忆。点击设置页的手动总结，或直接新增一条记忆。")
                    )}
                    </MemoryDetailBoundary>
                    </div>

                    <p className="memo-detail-footnote">点一条记忆，可编辑或让她忘掉。</p>
                </div>

                <div className="memo-bottom-bar memo-bottom-bar-detail">
                    <button type="button" className="memo-bottom-action" onClick={onOpenSettings}>
                        <FolderPlus size={18} strokeWidth={1.7} />
                        <span>记忆选项</span>
                    </button>
                    <span className="memo-world-label">当前世界</span>
                    <button
                        type="button"
                        className="memo-bottom-action"
                        onClick={() => {
                            setActiveTab("long");
                            openCreateMemoryEditor("long_term");
                        }}
                    >
                        <SquarePen size={18} strokeWidth={1.8} />
                        <span>新建备忘录</span>
                    </button>
                </div>

                {filterOpen && timelineFilterVisible ? (
                    <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => onFilterOpenChange?.(false)}>
                        <div className="modal-sheet memory-timeline-filter-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                            <div className="modal-header" data-ui="modal-header">
                                <span style={{ width: 28 }} />
                                <h3 className="modal-title">筛选记忆来源</h3>
                                <button className="modal-header-btn modal-header-btn-muted" onClick={() => onFilterOpenChange?.(false)} aria-label="关闭筛选">
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="modal-body modal-body-tight" data-ui="modal-body">
                                <div className="memory-timeline-filter-list">
                                    <button
                                        type="button"
                                        className="memory-timeline-filter-option"
                                        data-selected={activeTimelineTags.size === 0 ? "" : undefined}
                                        onClick={() => setActiveTimelineTags(new Set())}
                                    >
                                        <span>全部</span>
                                        <span className="memory-timeline-filter-option-meta">
                                            {filterEvents.length}
                                            {activeTimelineTags.size === 0 ? <Check size={17} /> : null}
                                        </span>
                                    </button>
                                    {timelineTagCounts.map(([tag, count]) => {
                                        const selected = activeTimelineTags.has(tag);
                                        return (
                                            <button
                                                key={tag}
                                                type="button"
                                                className="memory-timeline-filter-option"
                                                data-selected={selected ? "" : undefined}
                                                aria-pressed={selected}
                                                onClick={() => setActiveTimelineTags(prev => {
                                                    const next = new Set(prev);
                                                    if (next.has(tag)) next.delete(tag);
                                                    else next.add(tag);
                                                    return next;
                                                })}
                                            >
                                                <span>{tag}</span>
                                                <span className="memory-timeline-filter-option-meta">
                                                    {count}
                                                    {selected ? <Check size={17} /> : null}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {timelineTagCounts.length === 0 ? (
                                        <p className="memory-timeline-filter-empty">当前页面暂无可筛选的记忆事件</p>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Manual memory editor */}
                {memoryEditor && (() => {
                    const isCore = memoryEditor.type === "core";
                    const isEdit = Boolean(memoryEditor.entry);
                    const title = `${isEdit ? "编辑" : "新增"}${isCore ? "核心记忆" : "长期记忆"}`;
                    const placeholder = isCore
                        ? "记录稳定、长期影响角色判断的事实，例如关系身份、重大约定、长期设定。"
                        : "记录一次重要事件、承诺、偏好、关系变化，后续对话会参考。";
                    const contentLength = memoryEditor.content.trim().length;
                    const overLimit = contentLength > MANUAL_MEMORY_CONTENT_LIMIT;
                    return (
                        <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => savingMemory ? undefined : setMemoryEditor(null)}>
                            <div className="modal-sheet mem-edit-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                                <div className="modal-header" data-ui="modal-header">
                                    <button
                                        className="modal-header-btn modal-header-btn-muted"
                                        onClick={() => setMemoryEditor(null)}
                                        disabled={savingMemory}
                                    >
                                        <X size={18} />
                                    </button>
                                    <h3 className="modal-title">{title}</h3>
                                    <button
                                        className="modal-header-btn modal-header-btn-action"
                                        onClick={handleSaveManualMemory}
                                        disabled={savingMemory || !contentLength || overLimit}
                                    >
                                        <Check size={18} />
                                    </button>
                                </div>
                                <div className="modal-body mem-edit-body" data-ui="modal-body">
                                    <textarea
                                        className="ui-textarea mem-edit-textarea"
                                        value={memoryEditor.content}
                                        placeholder={placeholder}
                                        disabled={savingMemory}
                                        onChange={event => setMemoryEditor(prev => prev ? { ...prev, content: event.target.value } : prev)}
                                    />
                                    <div className={`mem-edit-footer ${overLimit ? "is-over-limit" : ""}`}>
                                        <span>{isCore ? "CORE" : "LONG TERM"}</span>
                                        <span>{contentLength}/{MANUAL_MEMORY_CONTENT_LIMIT}</span>
                                    </div>
                                    <button
                                        className="ui-btn ui-btn-primary mem-edit-save-btn"
                                        onClick={handleSaveManualMemory}
                                        disabled={savingMemory || !contentLength || overLimit}
                                    >
                                        {savingMemory ? "保存中..." : "保存记忆"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* 短期记忆：点一条后的菜单 */}
                {stActionId && (() => {
                    const entry = findTimelineEntry(stActionId);
                    if (!entry) return null;
                    const canEdit = entry.sourceApp !== "moments";
                    return (
                        <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => setStActionId(null)}>
                            <div className="modal-sheet mem-st-action-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                                <p className="mem-st-action-preview">{splitShortTermLine(entry.content).body}</p>
                                <p className="mem-st-action-hint">只改他记得的版本，聊天记录里原样不动</p>
                                {canEdit && (
                                    <button className="mem-st-action-btn" onClick={() => openShortTermEditor(entry.id)}>
                                        <Edit3 size={15} /><span>编辑</span>
                                    </button>
                                )}
                                {entry.edited && (
                                    <button className="mem-st-action-btn" onClick={() => handleRestoreShortTerm(entry.id)}>
                                        <Clock size={15} /><span>恢复原样</span>
                                    </button>
                                )}
                                <button
                                    className="mem-st-action-btn is-danger"
                                    onClick={() => { setStActionId(null); setStConfirmDeleteId(entry.id); }}
                                >
                                    <Trash2 size={15} /><span>删除（让他忘掉）</span>
                                </button>
                                <button className="mem-st-action-btn is-cancel" onClick={() => setStActionId(null)}>取消</button>
                            </div>
                        </div>
                    );
                })()}

                {/* 短期记忆编辑 */}
                {stEditor && (
                    <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => setStEditor(null)}>
                        <div className="modal-sheet mem-edit-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                            <div className="modal-header" data-ui="modal-header">
                                <button className="modal-header-btn modal-header-btn-muted" onClick={() => setStEditor(null)}>
                                    <X size={18} />
                                </button>
                                <h3 className="modal-title">编辑短期记忆</h3>
                                <button
                                    className="modal-header-btn modal-header-btn-action"
                                    onClick={handleSaveShortTermEdit}
                                    disabled={!stEditor.body.trim()}
                                >
                                    <Check size={18} />
                                </button>
                            </div>
                            <div className="modal-body mem-edit-body" data-ui="modal-body">
                                {stEditor.prefix && <p className="mem-st-edit-prefix">{stEditor.prefix.replace(/[:：]\s*$/, "")}</p>}
                                <textarea
                                    className="ui-textarea mem-edit-textarea"
                                    value={stEditor.body}
                                    onChange={event => setStEditor(prev => prev ? { ...prev, body: event.target.value } : prev)}
                                />
                                <div className="mem-edit-footer">
                                    <span>SHORT TERM</span>
                                    <span>聊天记录不会变</span>
                                </div>
                                <button
                                    className="ui-btn ui-btn-primary mem-edit-save-btn"
                                    onClick={handleSaveShortTermEdit}
                                    disabled={!stEditor.body.trim()}
                                >
                                    保存
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {stConfirmDeleteId && (
                    <ConfirmDialog
                        title="让他忘掉这条？"
                        message="删掉后他不会再记得这条，聊天记录里还在。"
                        icon={AlertCircle}
                        variant="danger"
                        confirmLabel="删除"
                        onConfirm={() => handleDeleteShortTerm(stConfirmDeleteId)}
                        onCancel={() => setStConfirmDeleteId(null)}
                    />
                )}

                {stConfirmDeleteIds && (
                    <ConfirmDialog
                        title="让他忘掉这一整段？"
                        message={`这一段 ${stConfirmDeleteIds.length} 条他都不会再记得，聊天记录里还在。`}
                        icon={AlertCircle}
                        variant="danger"
                        confirmLabel="删除"
                        onConfirm={() => handleDeleteShortTermCluster(stConfirmDeleteIds)}
                        onCancel={() => setStConfirmDeleteIds(null)}
                    />
                )}

                {/* Confirm delete single entry */}
                {confirmDeleteEntryId && (
                    <ConfirmDialog
                        title="确认删除？"
                        message="删除记忆条目后无法恢复。是否继续？"
                        icon={AlertCircle}
                        variant="danger"
                        confirmLabel="确认删除"
                        onConfirm={() => {
                            handleDeleteEntry(confirmDeleteEntryId);
                            setConfirmDeleteEntryId(null);
                        }}
                        onCancel={() => setConfirmDeleteEntryId(null)}
                    />
                )}

                {/* Confirm clear all long-term entries */}
                {confirmClearAll && (
                    <ConfirmDialog
                        title="确认清除？"
                        message={activeTab === "core" ? "将清除该角色所有核心记忆，此操作无法恢复。" : "将清除该角色所有长期记忆，此操作无法恢复。"}
                        icon={AlertCircle}
                        variant="danger"
                        confirmLabel="确认清除"
                        onConfirm={() => {
                            handleClearEntries(activeTab === "core" ? "core" : "long_term");
                            setConfirmClearAll(false);
                        }}
                        onCancel={() => setConfirmClearAll(false)}
                    />
                )}
            </div>
        );
    }

    // ── Settings View ──
    if (view === "settings") {
        const currentPrompt = editingPrompt ?? config.summarizationPrompt ?? DEFAULT_SUMMARIZATION_PROMPT;
        const currentCorePrompt = editingCorePrompt ?? config.coreMemoryPrompt ?? DEFAULT_CORE_MEMORY_PROMPT;
        const isModified = currentPrompt !== (config.summarizationPrompt ?? DEFAULT_SUMMARIZATION_PROMPT);
        const isDefault = (config.summarizationPrompt ?? DEFAULT_SUMMARIZATION_PROMPT) === DEFAULT_SUMMARIZATION_PROMPT;
        const isCoreModified = currentCorePrompt !== (config.coreMemoryPrompt ?? DEFAULT_CORE_MEMORY_PROMPT);
        const isCoreDefault = (config.coreMemoryPrompt ?? DEFAULT_CORE_MEMORY_PROMPT) === DEFAULT_CORE_MEMORY_PROMPT;

        return (
            <div className="page-menu memory-settings-menu">
                {/* Manual summarize */}
                {selectedCharId && (
                    <>
                        <p className="menu-group-desc mx-2">手动操作</p>
                        <div className="menu-group">
                            <div className="menu-item">
                                <MemorySettingsIcon icon={Zap} color={BINDING_ACCENTS.memory} />
                                <div className="menu-label-group">
                                    <span className="menu-label">长期记忆手动总结</span>
                                    <span className="menu-desc">将新产生的事件整理为长期记忆</span>
                                </div>
                                <div className="menu-right">
                                    <button
                                        className="ui-btn ui-btn-outline py-1 px-3 ts-12"
                                        onClick={() => setSummarizeRangeOpen(true)}
                                        disabled={summarizing}
                                    >
                                        <Zap size={12} className="mr-1" />
                                        {summarizing ? "处理中..." : "总结"}
                                    </button>
                                </div>
                            </div>
                            <div className="menu-item">
                                <MemorySettingsIcon icon={Brain} color={BINDING_ACCENTS.embedding} />
                                <div className="menu-label-group">
                                    <span className="menu-label">核心记忆手动总结</span>
                                    <span className="menu-desc">将长期记忆整理为核心记忆</span>
                                </div>
                                <div className="menu-right">
                                    <button
                                        className="ui-btn ui-btn-outline py-1 px-3 ts-12"
                                        onClick={handleManualRebuildCore}
                                        disabled={rebuildingCore}
                                    >
                                        <Archive size={12} className="mr-1" />
                                        {rebuildingCore ? "处理中..." : "重建"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {summarizeRangeOpen ? (
                            <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => setSummarizeRangeOpen(false)}>
                                <div className="modal-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                                    <div className="modal-header" data-ui="modal-header">
                                        <button className="modal-header-btn modal-header-btn-muted" onClick={() => setSummarizeRangeOpen(false)}><X size={18} /></button>
                                        <h3 className="modal-title">选择总结范围</h3>
                                        <span style={{ width: 44 }} />
                                    </div>
                                    <div className="modal-body modal-body-tight" data-ui="modal-body">
                                        <div className="menu-group">
                                            {SUMMARIZE_RANGE_OPTIONS.map(option => (
                                                <button
                                                    key={String(option.value)}
                                                    type="button"
                                                    className="menu-item w-full text-left"
                                                    onClick={() => void handleManualSummarize(option.value)}
                                                >
                                                    <div className="menu-label-group">
                                                        <span className="menu-label">{option.label}</span>
                                                        {option.desc ? <span className="menu-desc">{option.desc}</span> : null}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}

                {/* Memory source filter — one entry row, full picker lives in a bottom sheet */}
                <p className="menu-group-desc mx-2">记忆来源</p>
                <div className="menu-group">
                    <button type="button" className="menu-item" onClick={() => setSourcePickerOpen(true)}>
                        <MemorySettingsIcon icon={Filter} color={BINDING_ACCENTS.memory} />
                        <div className="menu-label-group">
                            <span className="menu-label">记忆来源</span>
                            <span className="menu-desc">选择哪些内容参与记忆</span>
                        </div>
                        <div className="menu-right">
                            <span className="menu-desc mr-1">{disabledSourceCount === 0 ? "全部开启" : `已关闭 ${disabledSourceCount} 项`}</span>
                            <ChevronRight size={16} />
                        </div>
                    </button>
                </div>

                {sourcePickerOpen ? (
                    <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => setSourcePickerOpen(false)}>
                        <div className="modal-sheet memory-source-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                            <div className="modal-header" data-ui="modal-header">
                                <span style={{ width: 28 }} />
                                <h3 className="modal-title">记忆来源</h3>
                                <button className="modal-header-btn modal-header-btn-muted" onClick={() => setSourcePickerOpen(false)}><X size={18} /></button>
                            </div>
                            <div className="modal-body modal-body-tight" data-ui="modal-body">
                                <div className="memory-source-chips" style={{ "--chip-accent": BINDING_ACCENTS.memory } as CSSProperties}>
                                    {MEMORY_SOURCE_OPTIONS.map(source => {
                                        const allowed = config.shortTermAllowedSources ?? {};
                                        const isChecked = allowed[source.key] !== false;
                                        return (
                                            <button
                                                key={source.key}
                                                type="button"
                                                className="memory-source-chip"
                                                data-off={isChecked ? undefined : ""}
                                                aria-pressed={isChecked}
                                                onClick={() => {
                                                    const next = {
                                                        ...config,
                                                        shortTermAllowedSources: { ...allowed, [source.key]: !isChecked },
                                                    };
                                                    setConfig(next);
                                                    saveMemoryConfig(next);
                                                }}
                                            >
                                                {source.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* 记忆备份 */}
                <p className="menu-group-desc mx-2">备份</p>
                <div className="menu-group">
                    {selectedCharId && (
                        <div className="menu-item">
                            <MemorySettingsIcon icon={Download} color={BINDING_ACCENTS.memory} />
                            <div className="menu-label-group">
                                <span className="menu-label">导出{selectedChar?.name ? `「${selectedChar.name}」` : "这个角色"}的记忆</span>
                                <span className="menu-desc">长期记忆和核心记忆</span>
                            </div>
                            <div className="menu-right">
                                <button className="ui-btn ui-btn-outline py-1 px-3 ts-12" onClick={() => handleExportMemories(false)} disabled={backupBusy}>导出</button>
                            </div>
                        </div>
                    )}
                    <div className="menu-item">
                        <MemorySettingsIcon icon={Download} color={BINDING_ACCENTS.worldBook} />
                        <div className="menu-label-group">
                            <span className="menu-label">导出全部角色的记忆</span>
                            <span className="menu-desc">所有角色打成一个文件</span>
                        </div>
                        <div className="menu-right">
                            <button className="ui-btn ui-btn-outline py-1 px-3 ts-12" onClick={() => handleExportMemories(true)} disabled={backupBusy}>导出</button>
                        </div>
                    </div>
                    <div className="menu-item">
                        <MemorySettingsIcon icon={Upload} color={BINDING_ACCENTS.embedding} />
                        <div className="menu-label-group">
                            <span className="menu-label">导入记忆</span>
                            <span className="menu-desc">可以选导给谁，已经有的不会重复</span>
                        </div>
                        <div className="menu-right">
                            <button className="ui-btn ui-btn-outline py-1 px-3 ts-12" onClick={() => memoryFileRef.current?.click()} disabled={backupBusy}>导入</button>
                        </div>
                    </div>
                    <input
                        ref={memoryFileRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={async event => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) await handlePickMemoryFile(file);
                        }}
                    />
                </div>

                {importPlan && (() => {
                    const chars = loadCharacters();
                    const ready = importPlan.filter(item => item.target).length;
                    return (
                        <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => backupBusy ? undefined : setImportPlan(null)}>
                            <div className="modal-sheet mem-edit-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                                <div className="modal-header" data-ui="modal-header">
                                    <button className="modal-header-btn modal-header-btn-muted" onClick={() => setImportPlan(null)} disabled={backupBusy}><X size={18} /></button>
                                    <h3 className="modal-title">导入记忆</h3>
                                    <span style={{ width: 32 }} />
                                </div>
                                <div className="modal-body mem-edit-body" data-ui="modal-body">
                                    {importPlan.map((item, idx) => (
                                        <div key={idx} className="mem-import-row">
                                            <div className="mem-import-src">
                                                <span className="mem-import-name">{item.pack.characterName || "未命名"}</span>
                                                <span className="mem-import-count">{item.pack.entries.length} 条</span>
                                            </div>
                                            <span className="mem-import-arrow">导给</span>
                                            <select
                                                className="ui-input mem-import-select"
                                                value={item.target}
                                                onChange={event => {
                                                    const target = event.target.value;
                                                    setImportPlan(prev => prev ? prev.map((p, i) => i === idx ? { ...p, target } : p) : prev);
                                                }}
                                            >
                                                <option value="">不导入</option>
                                                {chars.map(c => <option key={c.id} value={c.id}>{c.name || "未命名"}</option>)}
                                            </select>
                                        </div>
                                    ))}
                                    <button className="ui-btn ui-btn-primary mem-edit-save-btn" onClick={handleRunImport} disabled={backupBusy || !ready}>
                                        {backupBusy ? "导入中..." : `导入（${ready} 个角色）`}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Feature toggles */}
                <p className="menu-group-desc mx-2">自动化</p>
                <div className="menu-group">
                    <div className="menu-item">
                        <MemorySettingsIcon icon={Clock} color={BINDING_ACCENTS.memory} />
                        <div className="menu-label-group">
                            <span className="menu-label">长期记忆自动总结</span>
                            <span className="menu-desc">每隔一定条数自动将新事件整理为长期记忆</span>
                        </div>
                        <div className="menu-right">
                            <Toggle checked={config.autoSummarizeEnabled ?? true} onChange={(v) => {
                                const next = { ...config, autoSummarizeEnabled: v };
                                setConfig(next);
                                saveMemoryConfig(next);
                            }} />
                        </div>
                    </div>
                    <div className="menu-item">
                        <MemorySettingsIcon icon={Brain} color={BINDING_ACCENTS.embedding} />
                        <div className="menu-label-group">
                            <span className="menu-label">核心记忆自动总结</span>
                            <span className="menu-desc">每隔一定条数长期记忆，自动整理为核心记忆</span>
                        </div>
                        <div className="menu-right">
                            <Toggle checked={config.autoBuildCoreEnabled ?? true} onChange={(v) => {
                                const next = { ...config, autoBuildCoreEnabled: v };
                                setConfig(next);
                                saveMemoryConfig(next);
                            }} />
                        </div>
                    </div>
                    <div className="menu-item">
                        <MemorySettingsIcon icon={Search} color={BINDING_ACCENTS.embedding} />
                        <div className="menu-label-group">
                            <span className="menu-label">向量召回</span>
                            <span className="menu-desc">长期记忆超出预算时，通过 embedding 按相关性检索</span>
                        </div>
                        <div className="menu-right">
                            <Toggle checked={config.vectorRecallEnabled ?? true} onChange={(v) => {
                                const next = { ...config, vectorRecallEnabled: v };
                                setConfig(next);
                                saveMemoryConfig(next);
                            }} />
                        </div>
                    </div>
                </div>

                {/* Token budget sliders */}
                <p className="menu-group-desc mx-2">控制截断量</p>
                <div className="menu-group">
                    <MemorySettingsSliderItem
                        icon={Users}
                        color={BINDING_ACCENTS.voice}
                        label="短期记忆+最近上下文"
                        desc="聊天历史、朋友圈、群聊与跨应用近期事件截断量"
                        value={config.shortTermTokenBudget}
                        min={MEMORY_TOKEN_BUDGET_MIN.shortTermTokenBudget}
                        max={MEMORY_TOKEN_BUDGET_MAX}
                        step={MEMORY_TOKEN_BUDGET_STEP.shortTermTokenBudget}
                        onChange={value => saveBudget("shortTermTokenBudget", value)}
                    />
                    <MemorySettingsSliderItem
                        icon={Archive}
                        color={BINDING_ACCENTS.memory}
                        label="长期记忆"
                        desc="总结记忆注入量"
                        value={config.longTermTokenBudget}
                        min={MEMORY_TOKEN_BUDGET_MIN.longTermTokenBudget}
                        max={MEMORY_TOKEN_BUDGET_MAX}
                        step={MEMORY_TOKEN_BUDGET_STEP.longTermTokenBudget}
                        onChange={value => saveBudget("longTermTokenBudget", value)}
                    />
                    <MemorySettingsSliderItem
                        icon={Brain}
                        color={BINDING_ACCENTS.embedding}
                        label="核心记忆"
                        desc="高优先级里程碑注入量"
                        value={config.coreMemoryTokenBudget}
                        min={MEMORY_TOKEN_BUDGET_MIN.coreMemoryTokenBudget}
                        max={MEMORY_TOKEN_BUDGET_MAX}
                        step={MEMORY_TOKEN_BUDGET_STEP.coreMemoryTokenBudget}
                        onChange={value => saveBudget("coreMemoryTokenBudget", value)}
                    />
                </div>

                {/* Summarization interval */}
                <p className="menu-group-desc mx-2">自动总结间隔</p>
                <div className="menu-group">
                    <MemorySettingsSliderItem
                        icon={Clock}
                        color={BINDING_ACCENTS.api}
                        label="总结间隔"
                        desc="每 N 条事件自动触发总结"
                        value={config.summarizationEventInterval ?? 50}
                        min={10}
                        max={200}
                        step={10}
                        onChange={saveInterval}
                    />
                    <MemorySettingsSliderItem
                        icon={Brain}
                        color={BINDING_ACCENTS.embedding}
                        label="核心记忆总结间隔"
                        desc="每 N 条长期记忆自动触发核心记忆总结"
                        value={config.coreSummarizationInterval ?? 5}
                        min={1}
                        max={20}
                        step={1}
                        onChange={saveCoreInterval}
                    />
                </div>

                {/* Summarization Prompt Editor */}
                <p className="menu-group-desc mx-2">长期记忆提示词</p>
                <div className="menu-group">
                    <div className="menu-item">
                        <MemorySettingsIcon icon={FileText} color={BINDING_ACCENTS.preset} />
                        <div className="menu-label-group">
                            <span className="menu-label">长期记忆总结提示词</span>
                            <span className="menu-desc">
                                变量：{"{{char}}"} 角色、{"{{earliest}}"} 起始时间、{"{{latest}}"} 结束时间、{"{{events}}"} 记录集合
                            </span>
                        </div>
                        {!isDefault && (
                            <div className="menu-right">
                                <button onClick={handleResetPrompt} className="menu-label menu-label-danger ts-12 underline">
                                    恢复默认
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="px-4 pb-4 flex flex-col gap-3">
                        <textarea
                            value={currentPrompt}
                            onChange={e => setEditingPrompt(e.target.value)}
                            className="ui-textarea w-full min-h-[200px] ts-14 leading-relaxed resize-y"
                        />
                        {isModified && (
                            <button
                                onClick={handleSavePrompt}
                                className="ui-btn ui-btn-primary p-2.5 w-full"
                            >
                                <Zap size={14} className="mr-1.5" /> 保存提词配置
                            </button>
                        )}
                    </div>
                </div>

                <p className="menu-group-desc mx-2">核心记忆提示词</p>
                <div className="menu-group">
                    <div className="menu-item">
                        <MemorySettingsIcon icon={FileText} color={BINDING_ACCENTS.embedding} />
                        <div className="menu-label-group">
                            <span className="menu-label">核心记忆总结提示词</span>
                            <span className="menu-desc">
                                变量：{"{{char}}"} 角色、{"{{earliest}}"} 起始时间、{"{{latest}}"} 结束时间、{"{{events}}"} 长期记忆集合
                            </span>
                        </div>
                        {!isCoreDefault && (
                            <div className="menu-right">
                                <button onClick={handleResetCorePrompt} className="menu-label menu-label-danger ts-12 underline">
                                    恢复默认
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="px-4 pb-4 flex flex-col gap-3">
                        <textarea
                            value={currentCorePrompt}
                            onChange={e => setEditingCorePrompt(e.target.value)}
                            className="ui-textarea w-full min-h-[200px] ts-14 leading-relaxed resize-y"
                        />
                        {isCoreModified && (
                            <button
                                onClick={handleSaveCorePrompt}
                                className="ui-btn ui-btn-primary p-2.5 w-full"
                            >
                                <Archive size={14} className="mr-1.5" /> 保存核心记忆提词配置
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Memo List View ──
    const searchTerm = listSearch.trim().toLocaleLowerCase();
    const visibleCharacters = searchTerm
        ? characters.filter(({ character }) => character.name.toLocaleLowerCase().includes(searchTerm))
        : characters;

    return (
        <div className="memo-page">
            <header className="memo-page-heading">
                <h1>备忘录</h1>
            </header>

            <label className="memo-search">
                <Search size={18} strokeWidth={1.8} aria-hidden="true" />
                <input
                    type="search"
                    value={listSearch}
                    onChange={event => setListSearch(event.target.value)}
                    placeholder="搜索"
                    aria-label="搜索人物备忘录"
                />
            </label>

            <div className="memo-section-heading">人物记忆夹</div>
            {visibleCharacters.length > 0 ? (
                <div className="memo-people-card">
                    {visibleCharacters.map(({ character, shortTermCount, coreCount, longTermCount }, index) => {
                        const memoryCount = shortTermCount + coreCount + longTermCount;
                        const initials = Array.from(character.name.trim())[0] || "?";
                        return (
                            <button
                                className="memo-person-row"
                                key={character.id}
                                type="button"
                                onClick={() => handleSelectChar(character)}
                            >
                                <span className={`memo-avatar memo-avatar-${index % 5}`}>
                                    {character.avatar ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={character.avatar} alt="" draggable={false} />
                                    ) : (
                                        <span>{initials}</span>
                                    )}
                                </span>
                                <span className="memo-person-name">{character.name}</span>
                                <span className="memo-person-count">{memoryCount}</span>
                                <ChevronRight size={17} strokeWidth={1.7} className="memo-person-chevron" aria-hidden="true" />
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="memo-empty-state">
                    {searchTerm ? "没有找到匹配的人物" : "当前世界还没有可查看的人物记忆"}
                </div>
            )}

            <p className="memo-list-note">每个记忆夹，收着一个人记得的事。</p>

            <div className="memo-bottom-bar">
                <button type="button" className="memo-bottom-action" onClick={onOpenSettings}>
                    <FolderPlus size={18} strokeWidth={1.7} />
                    <span>记忆选项</span>
                </button>
                <span className="memo-world-label">当前世界</span>
                <button type="button" className="memo-bottom-action" onClick={() => setCreateTargetOpen(true)}>
                    <SquarePen size={18} strokeWidth={1.8} />
                    <span>新建备忘录</span>
                </button>
            </div>

            {createTargetOpen ? (
                <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => setCreateTargetOpen(false)}>
                    <div className="modal-sheet memo-target-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                        <div className="modal-header" data-ui="modal-header">
                            <button
                                className="modal-header-btn modal-header-btn-muted"
                                type="button"
                                onClick={() => setCreateTargetOpen(false)}
                                aria-label="关闭"
                            >
                                <X size={18} />
                            </button>
                            <h3 className="modal-title">新建备忘录</h3>
                            <span style={{ width: 28 }} />
                        </div>
                        <div className="modal-body modal-body-tight" data-ui="modal-body">
                            <p className="memo-target-hint">选择要记录的人物</p>
                            {characters.length > 0 ? (
                                <div className="memo-target-list">
                                    {characters.map(({ character }, index) => (
                                        <button
                                            key={character.id}
                                            type="button"
                                            className="memo-target-row"
                                            onClick={() => handleCreateNoteForChar(character)}
                                        >
                                            <span className={`memo-avatar memo-avatar-small memo-avatar-${index % 5}`}>
                                                {character.avatar ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={character.avatar} alt="" draggable={false} />
                                                ) : (
                                                    <span>{Array.from(character.name.trim())[0] || "?"}</span>
                                                )}
                                            </span>
                                            <span>{character.name}</span>
                                            <ChevronRight size={17} strokeWidth={1.7} aria-hidden="true" />
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="memo-target-empty">当前世界还没有人物，暂时无法新建备忘录。</p>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
