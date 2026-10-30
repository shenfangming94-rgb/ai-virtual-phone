"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef, createContext, type CSSProperties, type ReactNode } from "react";
import { Activity, Check, ChevronRight, Clock, Database, FileText, Fingerprint, Globe, HardDrive, Image, Info, KeyRound, Laptop, Lock, Layers, Link2, Loader2, LogOut, MessageSquare, Mic, Search, SlidersHorizontal, UserCircle, Wrench, X, CloudUpload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ConfirmDialog } from "./ui/modal";
import { useAccount } from "@/lib/account-context";
import { isSelfHostedModeEnabled } from "@/lib/self-hosting";
import { changeAccountPassword } from "@/lib/account-client";
import { ApiSettings } from "./settings/api-settings";
import { VoiceSettings } from "./settings/voice-settings";
import { ImageGenerationSettings } from "./settings/image-generation-settings";
import { PresetManager } from "./settings/preset-manager";
import { WorldBookManager } from "./settings/worldbook-manager";
import { RegexManager } from "./settings/regex-manager";
import { DataManagement } from "./settings/data-management";
import { UserIdentitySettings } from "./settings/user-identity";
import { AboutDeclaration } from "./settings/about-declaration";
import { BindingManager } from "./settings/binding-manager";
import { WeixinSettings } from "./settings/weixin-settings";
import { CloudServicesPage } from "./settings/cloud-services-setup";
import { ToolboxSettings } from "./settings/toolbox-settings";
import { ModerationCenter } from "./settings/moderation-center";
import { AgentComputerSettings } from "./settings/agent-computer-settings";
import { WorldTimeSettings } from "./settings/world-time-settings";
import { LockSettings } from "./settings/lock-settings";
import { SavesSettings } from "./settings/saves-settings";
import { loadWorldClock, subscribeWorldClock } from "@/lib/world-clock";
import { fetchIsAdmin } from "@/lib/moderation-client";
import { PageShell } from "./ui/page-shell";
import { Toggle } from "./ui/form";
import { loadChatAppSettings, saveChatAppSettings } from "@/lib/chat-storage";
import { loadKeepAlive, saveKeepAlive } from "@/lib/weixin-storage";
import { BINDING_ACCENTS, CONTENT_APP_ACCENTS } from "@/lib/ui-accent-colors";
import { resolveUserIdentity, USER_IDENTITIES_UPDATED_EVENT } from "@/lib/settings-storage";
import { SAVES_EVENT } from "@/lib/idol-saves";
import { SettingsPageIntro } from "./settings/settings-page-intro";

export const SettingsContext = createContext<{
    setSubpageTitle: (title: string | null) => void;
    setOverrideBack: (action: (() => void) | null) => void;
    setSubpageRightAction: (page: string, action: ReactNode | null) => void;
}>({ setSubpageTitle: () => { }, setOverrideBack: () => { }, setSubpageRightAction: () => { } });

type SettingsPageProps = {
    onClose: () => void;
    onNotice: (msg: string) => void;
};

type SubPage =
    | "main"
    | "api"
    | "voice"
    | "imageGeneration"
    | "presets"
    | "worldbook"
    | "regex"
    | "data"
    | "binding"
    | "identity"
    | "cloud"
    | "weixin"
    | "toolbox"
    | "agentComputer"
    | "moderation"
    | "worldTime"
    | "lock"
    | "saves"
    | "more"
    | "about";

const SETTINGS_MENU = [
    { id: "api", icon: HardDrive, label: "API 设置", desc: "大模型接口", iconColor: BINDING_ACCENTS.api , glass: "api" },
    { id: "voice", icon: Mic, label: "语音 API", desc: "语音合成", iconColor: BINDING_ACCENTS.voice , glass: "voice" },
    { id: "imageGeneration", icon: Image, label: "图像生成 API", desc: "模型、参考图与提示词", iconColor: CONTENT_APP_ACCENTS.moments , glass: "image-generation" },
    { id: "presets", icon: Fingerprint, label: "预设", desc: "角色预设", iconColor: BINDING_ACCENTS.preset , glass: "presets" },
    { id: "worldbook", icon: Globe, label: "世界书", desc: "世界观设定", iconColor: BINDING_ACCENTS.worldBook , glass: "worldbook" },
    { id: "regex", icon: Database, label: "正则规则", desc: "文本替换", iconColor: BINDING_ACCENTS.regex , glass: "regex" },
    { id: "data", icon: Layers, label: "数据管理", desc: "导入导出", iconColor: BINDING_ACCENTS.api , glass: "data" },
    { id: "binding", icon: Link2, label: "配置绑定", desc: "管理全局默认、角色与应用的配置绑定关系", iconColor: BINDING_ACCENTS.identity , glass: "binding" },
    { id: "cloud", icon: CloudUpload, label: "云服务部署", desc: "备份 / 微信 / 推送一站配置", iconColor: BINDING_ACCENTS.api , glass: "" },
    { id: "weixin", icon: MessageSquare, label: "微信接入", desc: "iLink Bot", iconColor: CONTENT_APP_ACCENTS.chat , glass: "weixin" },
    { id: "toolbox", icon: Wrench, label: "聊天工具箱", desc: "外部工具调用", iconColor: BINDING_ACCENTS.voice , glass: "toolbox" },
    { id: "agentComputer", icon: Laptop, label: "角色电脑", desc: "云端小电脑（自部署）", iconColor: BINDING_ACCENTS.memory , glass: "agent-computer" },
    { id: "identity", icon: UserCircle, label: "用户身份", desc: "个人信息", iconColor: BINDING_ACCENTS.identity , glass: "identity" },
    { id: "about", icon: Info, label: "关于与声明", desc: "版本与协议", iconColor: BINDING_ACCENTS.memory , glass: "about" },
] as const;

const accountIconStyle = {
    "--icon-color": BINDING_ACCENTS.identity,
} as CSSProperties;

const passwordIconStyle = {
    "--icon-color": BINDING_ACCENTS.api,
} as CSSProperties;

const logoutIconStyle = {
    "--icon-color": "var(--c-danger)",
} as CSSProperties;

type SettingsRowItem = {
    id: SubPage;
    icon: LucideIcon;
    label: string;
    desc?: string;
    iconColor: string;
    summary?: string;
};

function SettingsListRow({ item, onClick }: { item: SettingsRowItem; onClick: () => void }) {
    const Icon = item.icon;
    return (
        <button type="button" className="settings-apple-row" onClick={onClick}>
            <span className="settings-apple-icon" style={{ "--settings-row-icon": item.iconColor } as CSSProperties}>
                <Icon size={20} strokeWidth={1.8} />
            </span>
            <span className="settings-apple-row-copy">
                <span className="settings-apple-row-title">{item.label}</span>
                {item.desc ? <span className="settings-apple-row-desc">{item.desc}</span> : null}
            </span>
            {item.summary ? <span className="settings-apple-row-summary">{item.summary}</span> : null}
            <ChevronRight size={17} className="settings-apple-chevron" aria-hidden="true" />
        </button>
    );
}

function SettingsToggleRow({ icon: Icon, label, desc, color, checked, onChange }: {
    icon: LucideIcon;
    label: string;
    desc?: string;
    color: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <div className="settings-apple-row settings-apple-toggle-row">
            <span className="settings-apple-icon" style={{ "--settings-row-icon": color } as CSSProperties}>
                <Icon size={20} strokeWidth={1.8} />
            </span>
            <span className="settings-apple-row-copy">
                <span className="settings-apple-row-title">{label}</span>
                {desc ? <span className="settings-apple-row-desc">{desc}</span> : null}
            </span>
            <Toggle checked={checked} onChange={onChange} className="settings-apple-switch" />
        </div>
    );
}

const SETTINGS_PAGE_INTROS = {
    api: { icon: HardDrive, title: "API 设置", description: "管理聊天与记忆功能使用的模型接口。", color: BINDING_ACCENTS.api },
    voice: { icon: Mic, title: "语音 API", description: "配置语音合成与回复播报。", color: BINDING_ACCENTS.voice },
    imageGeneration: { icon: Image, title: "图像生成", description: "设置图片生成服务、模型和提示词。", color: CONTENT_APP_ACCENTS.moments },
    data: { icon: Database, title: "数据管理", description: "备份、恢复与清理手机数据。", color: BINDING_ACCENTS.api },
    binding: { icon: Link2, title: "配置绑定", description: "为不同角色和应用选择要使用的配置。", color: BINDING_ACCENTS.identity },
    cloud: { icon: CloudUpload, title: "云服务部署", description: "配置备份、微信和推送服务。", color: BINDING_ACCENTS.api },
    weixin: { icon: MessageSquare, title: "微信接入", description: "连接 iLink Bot 并管理消息接入。", color: CONTENT_APP_ACCENTS.chat },
    toolbox: { icon: Wrench, title: "聊天工具箱", description: "管理聊天中可使用的外部工具。", color: BINDING_ACCENTS.voice },
    agentComputer: { icon: Laptop, title: "角色电脑", description: "配置角色使用的云端小电脑。", color: BINDING_ACCENTS.memory },
    identity: { icon: UserCircle, title: "用户身份", description: "管理个人信息，以及 AI 如何认识你。", color: BINDING_ACCENTS.identity },
    moderation: { icon: Activity, title: "管理中心", description: "处理举报、应用审核和账号管理。", color: BINDING_ACCENTS.memory },
    lock: { icon: Lock, title: "锁屏", description: "设置锁屏壁纸、样式、文字和密码。", color: BINDING_ACCENTS.identity },
    saves: { icon: Layers, title: "存档", description: "管理当前世界，或切换到其他存档。", color: BINDING_ACCENTS.memory },
    about: { icon: Info, title: "关于与声明", description: "查看版本信息、使用说明与协议。", color: BINDING_ACCENTS.memory },
} as const;

export function PhoneSettingsApp({ onClose, onNotice }: SettingsPageProps) {
    const [currentPage, setCurrentPage] = useState<SubPage>("main");
    const [settingsSearch, setSettingsSearch] = useState("");
    const [userIdentity, setUserIdentity] = useState(() => resolveUserIdentity());
    const [subpageTitle, setSubpageTitle] = useState<string | null>(null);
    const [subpageRightActions, setSubpageRightActions] = useState<Record<string, ReactNode>>({});
    const [overrideBack, setOverrideBack] = useState<(() => void) | null>(null);
    const [timeAware, setTimeAware] = useState(true);
    const [promptViewerEnabled, setPromptViewerEnabled] = useState(false);
    const [quickActionEnabled, setQuickActionEnabled] = useState(false);
    const [floatingDockEnabled, setFloatingDockEnabled] = useState(false);
    const [floatingDockSheetOpen, setFloatingDockSheetOpen] = useState(false);
    const [keepAlive, setKeepAlive] = useState(false);
    // 角色电脑：施工中弹窗（返回 / 仍要看看）
    const pageBodyRef = useRef<HTMLDivElement | null>(null);

    // ── 账号：显示当前登录 / 修改密码 / 退出登录 ──
    const selfHostedMode = isSelfHostedModeEnabled();
    const { account, logout } = useAccount();
    const [pwdModalOpen, setPwdModalOpen] = useState(false);
    const [oldPwd, setOldPwd] = useState("");
    const [newPwd, setNewPwd] = useState("");
    const [confirmPwd, setConfirmPwd] = useState("");
    const [pwdBusy, setPwdBusy] = useState(false);
    const [pwdError, setPwdError] = useState("");
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [accountSheetOpen, setAccountSheetOpen] = useState(false);

    // ── 管理中心入口：仅 role=admin 的账号可见 ──
    const [isAdmin, setIsAdmin] = useState(false);
    useEffect(() => {
        if (selfHostedMode || !account) return;
        let cancelled = false;
        void fetchIsAdmin().then(result => { if (!cancelled) setIsAdmin(result); });
        return () => { cancelled = true; };
    }, [selfHostedMode, account]);

    const closePwdModal = () => {
        if (pwdBusy) return;
        setPwdModalOpen(false);
        setOldPwd("");
        setNewPwd("");
        setConfirmPwd("");
        setPwdError("");
    };

    const handleChangePassword = async () => {
        if (pwdBusy) return;
        if (!oldPwd || !newPwd) { setPwdError("请填写当前密码和新密码。"); return; }
        if (newPwd.length < 6) { setPwdError("新密码至少需要 6 位。"); return; }
        if (newPwd !== confirmPwd) { setPwdError("两次输入的新密码不一致。"); return; }
        setPwdBusy(true);
        setPwdError("");
        try {
            const result = await changeAccountPassword({ oldPassword: oldPwd, newPassword: newPwd });
            if (!result.ok) { setPwdError(result.error || "修改失败。"); return; }
            setPwdModalOpen(false);
            setOldPwd("");
            setNewPwd("");
            setConfirmPwd("");
            onNotice("密码已修改");
        } finally {
            setPwdBusy(false);
        }
    };

    const handleCopyUsername = () => {
        if (navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(account.username).then(() => onNotice("用户名已复制"));
        } else {
            onNotice(`用户名：${account.username}`);
        }
    };

    const defaultTitle = currentPage === "main"
        ? ""
        : currentPage === "more"
            ? "更多设置"
        : currentPage === "api" || currentPage === "voice" || currentPage === "imageGeneration" || currentPage === "presets" || currentPage === "worldbook" || currentPage === "regex" || currentPage === "identity"
            ? ""
            : currentPage === "moderation"
                ? "管理中心"
                : currentPage === "worldTime"
                ? "世界时间"
                : currentPage === "lock"
                ? "锁屏"
                : currentPage === "saves"
                ? "存档"
                : SETTINGS_MENU.find(m => m.id === currentPage)?.label || "设置";
    const title = subpageTitle || defaultTitle;

    const setSubpageRightAction = useCallback((page: string, action: ReactNode | null) => {
        setSubpageRightActions(prev => {
            if (action === null) {
                const next = { ...prev };
                delete next[page];
                return next;
            }
            return { ...prev, [page]: action };
        });
    }, []);

    const handleBack = () => {
        if (overrideBack) {
            overrideBack();
        } else if (currentPage !== "main") {
            setCurrentPage("main");
            setSubpageTitle(null);
            setOverrideBack(null);
        } else {
            onClose();
        }
    };

    const handleTimeAwareChange = useCallback((next: boolean) => {
        setTimeAware(next);
        saveChatAppSettings({ ...loadChatAppSettings(), timeAware: next });
        onNotice(next ? "已开启全局真实时间感知" : "已关闭全局真实时间感知");
    }, [onNotice]);

    const handlePromptViewerChange = useCallback((next: boolean) => {
        setPromptViewerEnabled(next);
        saveChatAppSettings({ ...loadChatAppSettings(), promptViewerEnabled: next });
        onNotice(next ? "已开启提示词查看器" : "已关闭提示词查看器");
    }, [onNotice]);

    const handleQuickActionChange = useCallback((next: boolean) => {
        setQuickActionEnabled(next);
        saveChatAppSettings({ ...loadChatAppSettings(), quickActionEnabled: next });
        onNotice(next ? "已开启快捷操作" : "已关闭快捷操作");
    }, [onNotice]);

    const handleFloatingDockChange = useCallback((next: boolean) => {
        setFloatingDockEnabled(next);
        saveChatAppSettings({ ...loadChatAppSettings(), floatingDockEnabled: next });
        onNotice(next ? "已开启悬浮球贴边收拢" : "已关闭悬浮球贴边收拢");
    }, [onNotice]);

    const handleKeepAliveChange = useCallback((next: boolean) => {
        setKeepAlive(next);
        saveKeepAlive(next);
        // use-weixin-bridge 监听这个事件来起停保活（与微信 Bot 的启用状态无关）
        window.dispatchEvent(new CustomEvent("weixin-config-changed"));
        onNotice(next ? "已开启后台保活" : "已关闭后台保活");
    }, [onNotice]);

    const [worldLabel, setWorldLabel] = useState("");
    useEffect(() => {
        const update = () => {
            setWorldLabel(loadWorldClock().real ? "跟现实时间一致" : "虚拟时间");
        };
        update();
        const tick = window.setInterval(update, 15000);
        const off = subscribeWorldClock(update);
        return () => { window.clearInterval(tick); off(); };
    }, []);

    useEffect(() => {
        const refreshIdentity = () => setUserIdentity(resolveUserIdentity());
        window.addEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshIdentity);
        window.addEventListener(SAVES_EVENT, refreshIdentity);
        return () => {
            window.removeEventListener(USER_IDENTITIES_UPDATED_EVENT, refreshIdentity);
            window.removeEventListener(SAVES_EVENT, refreshIdentity);
        };
    }, []);

    const openMyCard = () => {
        sessionStorage.setItem("contacts-open-view", "me");
        window.dispatchEvent(new CustomEvent("open-app", { detail: { appId: "contacts" } }));
    };

    const openAccountSheet = () => {
        setCurrentPage("main");
        setAccountSheetOpen(true);
    };

    const openFloatingDockSettings = () => {
        setCurrentPage("main");
        setFloatingDockSheetOpen(true);
    };

    const worldRows: SettingsRowItem[] = [
        { id: "worldTime", icon: Clock, label: "世界时间", iconColor: "#007aff", summary: worldLabel },
        { id: "lock", icon: Lock, label: "锁屏", iconColor: "#af52de" },
        { id: "saves", icon: Layers, label: "存档", iconColor: "#34c759", summary: "当前世界" },
    ];
    const apiRows: SettingsRowItem[] = SETTINGS_MENU
        .filter(item => ["api", "voice", "imageGeneration"].includes(item.id))
        .map(item => ({ ...item, id: item.id as SubPage }));
    const setupRows: SettingsRowItem[] = SETTINGS_MENU
        .filter(item => ["binding", "presets", "worldbook", "regex"].includes(item.id))
        .map(item => ({ ...item, id: item.id as SubPage }));
    const finalHomeRows: SettingsRowItem[] = [
        { ...SETTINGS_MENU.find(item => item.id === "data")!, id: "data" },
        { id: "more", icon: SlidersHorizontal, label: "更多设置", desc: "连接、工具与其他选项", iconColor: "#8e8e93" },
    ];
    const allPageRows: SettingsRowItem[] = [
        ...worldRows,
        ...SETTINGS_MENU.map(item => ({ ...item, id: item.id as SubPage })),
        { id: "more", icon: SlidersHorizontal, label: "更多设置", desc: "连接、工具与其他选项", iconColor: "#8e8e93" },
    ];
    const searchToggleRows = [
        { icon: Clock, label: "真实时间感知", desc: "在历史事件中显示现实时间", color: CONTENT_APP_ACCENTS.calendar, checked: timeAware, onChange: handleTimeAwareChange },
        { icon: Activity, label: "后台保活", desc: "切到后台时保持网页运行", color: CONTENT_APP_ACCENTS.chat, checked: keepAlive, onChange: handleKeepAliveChange },
        { icon: FileText, label: "提示词查看器", desc: "开启后显示悬浮按钮", color: BINDING_ACCENTS.preset, checked: promptViewerEnabled, onChange: handlePromptViewerChange },
        { icon: SlidersHorizontal, label: "快捷操作", desc: "快速切换 API 与世界书", color: BINDING_ACCENTS.worldBook, checked: quickActionEnabled, onChange: handleQuickActionChange },
    ];
    const searchText = settingsSearch.trim().toLocaleLowerCase();
    const searchPageMatches = searchText ? allPageRows.filter(item => `${item.label} ${item.desc || ""}`.toLocaleLowerCase().includes(searchText)) : [];
    const searchToggleMatches = searchText ? searchToggleRows.filter(item => `${item.label} ${item.desc || ""}`.toLocaleLowerCase().includes(searchText)) : [];
    const openSearchRow = (item: SettingsRowItem) => setCurrentPage(item.id);

    const renderSubPage = () => {
        switch (currentPage) {
            case "api":
                return <ApiSettings />;
            case "voice":
                return <VoiceSettings />;
            case "imageGeneration":
                return <ImageGenerationSettings />;
            case "presets":
                return <PresetManager isActive />;
            case "worldbook":
                return <WorldBookManager isActive />;
            case "regex":
                return <RegexManager isActive />;
            case "data":
                return <DataManagement onNotice={onNotice} />;
            case "binding":
                return <BindingManager />;
            case "cloud":
                return <CloudServicesPage />;
            case "weixin":
                return <WeixinSettings onOpenCloudServices={() => setCurrentPage("cloud")} />;
            case "toolbox":
                return <ToolboxSettings />;
            case "agentComputer":
                return <AgentComputerSettings onNotice={onNotice} />;
            case "moderation":
                return <ModerationCenter onNotice={onNotice} />;
            case "identity":
                return <UserIdentitySettings />;
            case "worldTime":
                return <WorldTimeSettings onNotice={onNotice} />;
            case "lock":
                return <LockSettings onNotice={onNotice} />;
            case "saves":
                return <SavesSettings onNotice={onNotice} />;
            case "about":
                return <AboutDeclaration />;
            default:
                return null;
        }
    };

    useLayoutEffect(() => {
        pageBodyRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [currentPage]);

    // Check for pending mascot navigation mode on mount (stored by desktop-shell)
    useEffect(() => {
        const pending = sessionStorage.getItem("mascot-settings-mode");
        if (pending) {
            sessionStorage.removeItem("mascot-settings-mode");
            if (SETTINGS_MENU.some(m => m.id === pending)) {
                setCurrentPage(pending as SubPage);
            }
        }
    }, []);

    useEffect(() => {
        const settings = loadChatAppSettings();
        setTimeAware(settings.timeAware !== false);
        setPromptViewerEnabled(settings.promptViewerEnabled === true);
        setQuickActionEnabled(settings.quickActionEnabled === true);
        setFloatingDockEnabled(settings.floatingDockEnabled === true);
        setKeepAlive(loadKeepAlive());
    }, []);

    // Listen for mascot navigation mode (e.g. jump to worldbook/regex tab)
    useEffect(() => {
        const onMode = (e: Event) => {
            const { mode } = (e as CustomEvent).detail ?? {};
            if (mode && SETTINGS_MENU.some(m => m.id === mode)) {
                setCurrentPage(mode as SubPage);
            }
        };
        window.addEventListener("mascot-navigate-mode", onMode);
        return () => window.removeEventListener("mascot-navigate-mode", onMode);
    }, []);

    // Listen for internal settings tab navigation (e.g. mascot "修改绑定" button)
    useEffect(() => {
        const onNav = (e: Event) => {
            const { page } = (e as CustomEvent).detail ?? {};
            if (page) setCurrentPage(page as SubPage);
        };
        window.addEventListener("settings-navigate", onNav);
        return () => window.removeEventListener("settings-navigate", onNav);
    }, []);

    return (
        <SettingsContext.Provider value={{ setSubpageTitle, setOverrideBack, setSubpageRightAction }}>
            <PageShell
                className={`phone-settings-shell ${currentPage === "main" ? "settings-home-mode" : "settings-subpage-mode"}`}
                title={currentPage === "main" ? "" : title}
                onBack={currentPage === "main" ? undefined : handleBack}
                rightAction={currentPage !== "main" ? subpageRightActions[currentPage] : undefined}
                bodyRef={pageBodyRef}
            >
                {currentPage === "main" && (
                    <div className="page-menu settings-main-menu settings-apple-home">
                        <div className="settings-apple-home-content">
                            <div className="settings-apple-heading">
                                <h1>设置</h1>
                                <button type="button" className="settings-apple-close" onClick={onClose} aria-label="关闭设置"><X size={19} /></button>
                            </div>
                            <div className="settings-apple-search">
                                <Search size={19} strokeWidth={1.8} aria-hidden="true" />
                                <input type="search" aria-label="搜索设置" placeholder="搜索" value={settingsSearch} onChange={event => setSettingsSearch(event.target.value)} />
                                {settingsSearch ? <button type="button" onClick={() => setSettingsSearch("")} aria-label="清空搜索"><X size={16} /></button> : null}
                            </div>

                            {searchText ? (
                                <div className="settings-apple-search-results">
                                    {searchPageMatches.length ? (
                                        <section className="settings-apple-group">
                                            {searchPageMatches.map(item => <SettingsListRow key={item.id} item={item} onClick={() => openSearchRow(item)} />)}
                                        </section>
                                    ) : null}
                                    {searchToggleMatches.length ? (
                                        <section className="settings-apple-group">
                                            {searchToggleMatches.map(item => <SettingsToggleRow key={item.label} {...item} />)}
                                        </section>
                                    ) : null}
                                    {!searchPageMatches.length && !searchToggleMatches.length ? <p className="settings-apple-empty">没有找到相关设置</p> : null}
                                </div>
                            ) : (
                                <>
                                    <button type="button" className="settings-apple-profile" onClick={openMyCard}>
                                        <span className="settings-apple-profile-avatar">
                                            {userIdentity?.avatarUrl ? <img src={userIdentity.avatarUrl} alt="" /> : <span>{userIdentity?.name?.trim().slice(0, 1) || "我"}</span>}
                                        </span>
                                        <span className="settings-apple-profile-copy">
                                            <strong>{userIdentity?.name?.trim() || "我的名片"}</strong>
                                            <small>我的名片与练习生档案</small>
                                        </span>
                                        <ChevronRight size={19} className="settings-apple-chevron" aria-hidden="true" />
                                    </button>
                                    <section className="settings-apple-group">
                                        {worldRows.map(item => <SettingsListRow key={item.id} item={item} onClick={() => setCurrentPage(item.id)} />)}
                                    </section>
                                    <section className="settings-apple-group">
                                        {apiRows.map(item => <SettingsListRow key={item.id} item={item} onClick={() => setCurrentPage(item.id)} />)}
                                    </section>
                                    <section className="settings-apple-group">
                                        {setupRows.map(item => <SettingsListRow key={item.id} item={item} onClick={() => setCurrentPage(item.id)} />)}
                                    </section>
                                    <section className="settings-apple-group">
                                        {finalHomeRows.map(item => <SettingsListRow key={item.id} item={item} onClick={() => setCurrentPage(item.id)} />)}
                                    </section>
                                </>
                            )}
                        </div>
                        {floatingDockSheetOpen && (
                            <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => setFloatingDockSheetOpen(false)}>
                                <div className="modal-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                                    <div className="modal-header" data-ui="modal-header">
                                        <span style={{ width: 44 }} />
                                        <h3 className="modal-title">悬浮球设置</h3>
                                        <button className="modal-header-btn modal-header-btn-muted" onClick={() => setFloatingDockSheetOpen(false)} aria-label="关闭"><X size={18} /></button>
                                    </div>
                                    <div className="modal-body modal-body-tight" data-ui="modal-body">
                                        <div className="menu-group">
                                            <div className="menu-item settings-tools-menu-item">
                                                <span className="card-icon card-icon-glass">
                                                    <SlidersHorizontal size={20} strokeWidth={1.8} />
                                                </span>
                                                <span className="settings-tools-menu-copy">
                                                    <span className="menu-label appearance-menu-item-label">贴边半透明收拢模式</span>
                                                </span>
                                                <span className="menu-right settings-tools-menu-toggle">
                                                    <Toggle checked={floatingDockEnabled} onChange={handleFloatingDockChange} className="settings-toggle-control" />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        {accountSheetOpen && (
                            <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={() => setAccountSheetOpen(false)}>
                                <div className="modal-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                                    <div className="modal-header" data-ui="modal-header">
                                        <button className="modal-header-btn modal-header-btn-muted" onClick={() => setAccountSheetOpen(false)}><X size={18} /></button>
                                        <h3 className="modal-title">账号</h3>
                                        <span style={{ width: 44 }} />
                                    </div>
                                    <div className="modal-body modal-body-tight" data-ui="modal-body">
                                        <div className="menu-group">
                                            <div className="menu-item settings-tools-menu-item">
                                                <span className="card-icon" style={accountIconStyle}>
                                                    <UserCircle size={22} strokeWidth={1.75} />
                                                </span>
                                                <span className="settings-tools-menu-copy">
                                                    <span className="menu-label appearance-menu-item-label">当前账号</span>
                                                    <span className="menu-desc settings-tools-menu-desc">@{account.username}</span>
                                                </span>
                                                <span className="menu-right">
                                                    <button className="ui-btn ui-btn-outline py-1 px-3 ts-12" style={{ whiteSpace: "nowrap" }} onClick={handleCopyUsername}>复制</button>
                                                </span>
                                            </div>
                                            <button type="button" className="menu-item settings-tools-menu-item w-full text-left" onClick={() => { setAccountSheetOpen(false); setPwdModalOpen(true); }}>
                                                <span className="card-icon" style={passwordIconStyle}>
                                                    <KeyRound size={22} strokeWidth={1.75} />
                                                </span>
                                                <span className="settings-tools-menu-copy">
                                                    <span className="menu-label appearance-menu-item-label">修改密码</span>
                                                    <span className="menu-desc settings-tools-menu-desc">需验证当前密码</span>
                                                </span>
                                                <span className="menu-right"><ChevronRight size={17} className="settings-account-chevron" /></span>
                                            </button>
                                            <button type="button" className="menu-item settings-tools-menu-item w-full text-left" onClick={() => { setAccountSheetOpen(false); setConfirmLogout(true); }}>
                                                <span className="card-icon" style={logoutIconStyle}>
                                                    <LogOut size={22} strokeWidth={1.75} />
                                                </span>
                                                <span className="settings-tools-menu-copy">
                                                    <span className="menu-label appearance-menu-item-label" style={{ color: "var(--c-danger)" }}>退出登录</span>
                                                    <span className="menu-desc settings-tools-menu-desc">退出后需重新输入用户名和密码</span>
                                                </span>
                                                <span className="menu-right"><ChevronRight size={17} className="settings-account-chevron" /></span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {pwdModalOpen && (
                            <div className="modal-overlay modal-overlay-bottom" data-ui="modal" onClick={closePwdModal}>
                                <div className="modal-sheet" data-ui="modal-sheet" onClick={event => event.stopPropagation()}>
                                    <div className="modal-header" data-ui="modal-header">
                                        <button className="modal-header-btn modal-header-btn-muted" onClick={closePwdModal} disabled={pwdBusy}><X size={18} /></button>
                                        <h3 className="modal-title">修改密码</h3>
                                        <button className="modal-header-btn modal-header-btn-action" onClick={() => void handleChangePassword()} disabled={pwdBusy}>
                                            {pwdBusy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                                        </button>
                                    </div>
                                    <div className="modal-body" data-ui="modal-body">
                                        <div className="flex flex-col gap-3 px-1">
                                            <input type="password" className="ui-input" placeholder="当前密码" autoComplete="current-password"
                                                value={oldPwd} onChange={event => setOldPwd(event.target.value)} />
                                            <input type="password" className="ui-input" placeholder="新密码（至少 6 位）" autoComplete="new-password"
                                                value={newPwd} onChange={event => setNewPwd(event.target.value)} />
                                            <input type="password" className="ui-input" placeholder="确认新密码" autoComplete="new-password"
                                                value={confirmPwd} onChange={event => setConfirmPwd(event.target.value)} />
                                            {pwdError ? <p className="ts-12" style={{ color: "var(--c-danger)" }}>{pwdError}</p> : null}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {confirmLogout && (
                            <ConfirmDialog
                                title="退出登录"
                                message={`当前账号 @${account.username}。退出后需要重新输入用户名和密码才能登录，密码无法找回，请确认已牢记。`}
                                icon={LogOut}
                                variant="danger"
                                confirmLabel="退出登录"
                                onConfirm={() => { setConfirmLogout(false); void logout(); }}
                                onCancel={() => setConfirmLogout(false)}
                            />
                        )}
                    </div>
                )}

                {currentPage === "more" && (
                    <div className="settings-subpage-content settings-more-page">
                        <SettingsPageIntro icon={SlidersHorizontal} title="更多设置" description="连接、辅助工具和账号选项。" color="#8e8e93" />
                        <p className="settings-apple-caption">连接与服务</p>
                        <section className="settings-apple-group">
                            {SETTINGS_MENU.filter(item => ["cloud", "weixin", "toolbox", "agentComputer"].includes(item.id)).map(item => (
                                <SettingsListRow key={item.id} item={{ ...item, id: item.id as SubPage }} onClick={() => setCurrentPage(item.id as SubPage)} />
                            ))}
                        </section>
                        <p className="settings-apple-caption">运行与辅助</p>
                        <section className="settings-apple-group">
                            <SettingsToggleRow icon={Clock} label="真实时间感知" desc="在历史事件中显示现实时间" color={CONTENT_APP_ACCENTS.calendar} checked={timeAware} onChange={handleTimeAwareChange} />
                            <SettingsToggleRow icon={Activity} label="后台保活" desc="切到后台时尽量保持网页运行" color={CONTENT_APP_ACCENTS.chat} checked={keepAlive} onChange={handleKeepAliveChange} />
                            <SettingsToggleRow icon={FileText} label="提示词查看器" desc="显示悬浮按钮，查看当前提示词" color={BINDING_ACCENTS.preset} checked={promptViewerEnabled} onChange={handlePromptViewerChange} />
                            <SettingsToggleRow icon={SlidersHorizontal} label="快捷操作" desc="快速切换 API 与世界书" color={BINDING_ACCENTS.worldBook} checked={quickActionEnabled} onChange={handleQuickActionChange} />
                            <SettingsListRow item={{ id: "more", icon: SlidersHorizontal, label: "悬浮球偏好设置", desc: "贴边半透明收拢模式", iconColor: "#8e8e93", summary: floatingDockEnabled ? "已开启" : "已关闭" }} onClick={openFloatingDockSettings} />
                        </section>
                        <p className="settings-apple-caption">个人与其他</p>
                        <section className="settings-apple-group">
                            {SETTINGS_MENU.filter(item => ["identity", "about"].includes(item.id)).map(item => (
                                <SettingsListRow key={item.id} item={{ ...item, id: item.id as SubPage }} onClick={() => setCurrentPage(item.id as SubPage)} />
                            ))}
                            {!selfHostedMode && account ? (
                                <SettingsListRow
                                    item={{ id: "more", icon: UserCircle, label: "账号", desc: "用户名、修改密码与退出登录", iconColor: BINDING_ACCENTS.identity, summary: account.displayName || account.username }}
                                    onClick={openAccountSheet}
                                />
                            ) : null}
                            {isAdmin ? (
                                <SettingsListRow item={{ id: "moderation", icon: Activity, label: "管理中心", desc: "举报、审核与账号管理", iconColor: BINDING_ACCENTS.memory }} onClick={() => setCurrentPage("moderation")} />
                            ) : null}
                        </section>
                    </div>
                )}

                {currentPage !== "main" && currentPage !== "more" && (
                    // shrink-0：page-body 是 flex 容器，包裹层默认可压缩——内容超一屏时会被压到
                    // 恰好一屏高、卡片从中溢出，底部 padding 落不到内容末尾，最后一张卡贴死滚动边界
                    //（iOS 底部工具栏/安全区一盖就"没放下又滚不动"）。尾部留白 = 原 pb-8 + 安全区。
                    <div className="settings-subpage-content block min-h-full shrink-0 p-4 box-border" style={{ paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))" }}>
                        {SETTINGS_PAGE_INTROS[currentPage as keyof typeof SETTINGS_PAGE_INTROS] ? <SettingsPageIntro {...SETTINGS_PAGE_INTROS[currentPage as keyof typeof SETTINGS_PAGE_INTROS]} /> : null}
                        {renderSubPage()}
                    </div>
                )}
            </PageShell>
        </SettingsContext.Provider>
    );
}
