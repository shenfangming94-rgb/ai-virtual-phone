/**
 * 用户身份分区：「我」页头像切换当前身份后，消息列表 / 通讯录只显示绑定该身份的角色。
 *
 * 当前身份就是全局默认用户身份（globalDefaults.userIdentityId），角色归属按聊天场景
 * 解析出的身份判定（与角色实际聊天时用的身份一致）。加好友时把角色固定绑到当前身份；
 * 切换身份前把还没单独绑定的好友固定到旧身份，避免它们跟着全局默认悄悄换人。
 */
import type { ChatSession } from "./chat-storage";
import {
    getCharacterBinding,
    loadBindingConfig,
    loadUserIdentities,
    resolveBinding,
    saveBindingConfig,
    setCharacterBinding,
} from "./settings-storage";
import type { BindingConfig } from "./settings-types";

const CHAT_APP_ID = "chat";
export const USER_IDENTITY_SWITCHED_EVENT = "user-identity-switched";

export function getCurrentIdentityId(): string | undefined {
    const identities = loadUserIdentities();
    const globalId = loadBindingConfig().globalDefaults.userIdentityId;
    if (globalId && identities.some(i => i.id === globalId)) return globalId;
    return identities[0]?.id;
}

function resolveChatIdentityId(config: BindingConfig, characterId: string, fallbackId: string | undefined): string | undefined {
    return resolveBinding(config, characterId, CHAT_APP_ID).userIdentityId || fallbackId;
}

/** 返回一个判定函数：角色是否归属指定身份。批量筛选时只读一次存储。 */
export function createIdentityMatcher(identityId: string | undefined = getCurrentIdentityId()): (characterId: string) => boolean {
    if (!identityId) return () => true;
    const config = loadBindingConfig();
    const fallbackId = loadUserIdentities()[0]?.id;
    return (characterId) => resolveChatIdentityId(config, characterId, fallbackId) === identityId;
}

/** 角色聊天时实际使用的用户身份。 */
export function getCharacterIdentityId(characterId: string): string | undefined {
    return resolveChatIdentityId(loadBindingConfig(), characterId, loadUserIdentities()[0]?.id);
}

/** 单聊看对方角色；群聊只要有一位成员归属当前身份就显示。 */
export function sessionMatchesIdentity(session: ChatSession, matches: (characterId: string) => boolean): boolean {
    if (session.isGroup) return (session.participantIds || []).some(matches);
    return matches(session.contactId);
}

function hasExplicitChatIdentity(config: BindingConfig, characterId: string): boolean {
    const binding = config.characterBindings.find(b => b.characterId === characterId);
    return Boolean(binding?.defaults.userIdentityId || binding?.appOverrides[CHAT_APP_ID]?.userIdentityId);
}

function pinIdentity(config: BindingConfig, characterId: string, identityId: string): BindingConfig {
    const binding = getCharacterBinding(config, characterId);
    return setCharacterBinding(config, {
        ...binding,
        defaults: { ...binding.defaults, userIdentityId: identityId },
    });
}

/** 朋友圈：角色帖看作者；用户帖看发帖身份，旧帖按可见角色推断。 */
export function momentPostMatchesIdentity(
    post: { authorType: string; authorId: string; authorIdentityId?: string; visibility: string[] },
    identityId: string | undefined,
    matches: (characterId: string) => boolean,
): boolean {
    if (post.authorType !== "user") return matches(post.authorId);
    if (post.authorIdentityId) return !identityId || post.authorIdentityId === identityId;
    return post.visibility.length === 0 || post.visibility.some(matches);
}

/** 加好友时调用：角色还没单独绑定身份的话，绑到当前身份。 */
export function bindCharacterToCurrentIdentity(characterId: string): void {
    if (typeof window === "undefined") return;
    const config = loadBindingConfig();
    if (hasExplicitChatIdentity(config, characterId)) return;
    const identityId = getCurrentIdentityId();
    if (!identityId) return;
    saveBindingConfig(pinIdentity(config, characterId, identityId));
}

/** 切换当前身份。contactCharacterIds 是现有好友，没单独绑定的先固定到旧身份。 */
export function switchCurrentIdentity(nextIdentityId: string, contactCharacterIds: string[]): void {
    if (typeof window === "undefined") return;
    const previousId = getCurrentIdentityId();
    if (previousId === nextIdentityId) return;
    let config = loadBindingConfig();
    if (previousId) {
        for (const characterId of contactCharacterIds) {
            if (!hasExplicitChatIdentity(config, characterId)) {
                config = pinIdentity(config, characterId, previousId);
            }
        }
    }
    config = { ...config, globalDefaults: { ...config.globalDefaults, userIdentityId: nextIdentityId } };
    saveBindingConfig(config);
    window.dispatchEvent(new CustomEvent(USER_IDENTITY_SWITCHED_EVENT, { detail: nextIdentityId }));
}

/** 把一个 char 换到另一个身份（聊天设置里的「属于哪个身份」）。清掉消息 app 单独的身份覆盖，统一跟着角色默认走。 */
export function moveCharacterToIdentity(characterId: string, identityId: string): void {
    if (typeof window === "undefined") return;
    const config = loadBindingConfig();
    const binding = getCharacterBinding(config, characterId);
    const appOverrides = { ...binding.appOverrides };
    const chatSlot = appOverrides[CHAT_APP_ID];
    if (chatSlot?.userIdentityId) appOverrides[CHAT_APP_ID] = { ...chatSlot, userIdentityId: undefined };
    saveBindingConfig(setCharacterBinding(config, {
        ...binding,
        appOverrides,
        defaults: { ...binding.defaults, userIdentityId: identityId },
    }));
    // 列表、通讯录、购物都按身份筛，借切身份事件让它们重新筛一遍（当前身份没变）
    window.dispatchEvent(new CustomEvent(USER_IDENTITY_SWITCHED_EVENT, { detail: getCurrentIdentityId() }));
}
