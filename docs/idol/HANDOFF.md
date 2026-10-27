# 爱豆小手机：交接文档（写于 2026-10-27 凌晨）

给下一个窗口的我：先读完这份，再读记忆里的 `project_virtual_time.md`（讨论过程和她每个决定的原话出处）。

---

## 0. 这是什么

Flora 要一个专门玩「爱豆模拟器」的小手机：她是想当爱豆的女生，在一个韩国娱乐圈世界里从投递、练习生一路走到出道。世界自己会动（时间、日程、有人来找她），人物不刻板，剧情能推进。

- 基于 float 小手机，同一个仓库，单独分支 **`idol`**
- 工作目录（git worktree）：**`~/projects/momo-idol`**，node_modules 软链到 `../momo/node_modules`
- 她平时玩的 nox 分支在 `~/projects/momo`，**爱豆的东西只改 idol，不动 nox**
- 本地预览：`cd ~/projects/momo-idol && NEXT_PUBLIC_SELF_HOSTED_MODE=true npx next dev -p 3031`，手机同 Wi-Fi 打开 `http://192.168.10.4:3031`
- **还没上线**：没开 Netlify 新站。上线要她同意，记得 Netlify 额度要省（攒一批再推）
- 外观：app 内部的样子归我做（她只美化桌面）。要像 iOS 26 真手机

---

## 1. 和她说话的规矩（这次窗口里学到的）

- 全程中文，回复每行之间空一行，带点人味，别全是汇报腔
- 设计类先给预览截图，她说可以才算定稿；她说好看的就别乱动
- **界面字号要统一**：并排按钮同大小、同位置；同层级同字号，能一档就一档；字距用 CSS，别手打空格
- **中韩混排时中文字体放第一个**（`"PingFang SC", "Hiragino Sans GB", "Apple SD Gothic Neo"`），否则一行汉字会混两种字体、大小不一。这次她拍屏幕才查出来
- 韩文旁边一定要配中文，她看不懂韩文
- 提示词写规矩一句话直接禁，不举例
- 读她发的小红书链接：用 curl 手机 UA 拆 `__INITIAL_STATE__`（见记忆 project_xhs）
- 不用强调「真实艺人」那套话，她嫌多余
- 她怕猫，别给她看猫

---

## 2. 已经做好的（idol 分支，按时间）

| commit | 内容 |
|---|---|
| 1bbe9e8 | 世界时钟、时钟 app 初版、藏掉不要的 app、聊天改名 KakaoTalk |
| 8dc26ef | 不玩就停（切后台时间冻住） |
| 18fd130 | 时钟 app 改成 iOS 时钟（世界时钟/闹钟/秒表/计时器） |
| 3c3634a 346abb0 fc4f105 | 锁屏（去掉开屏动画、密码、液态玻璃、两种样式、单独壁纸） |
| 7258d4e 71c4933 | 通讯录 app；档案库只放主要人物 |
| 87e210a 3c3088b 61122db ac5a451 | 开局页（练习生登记证）及字号、字体修正 |
| 75deb9b | 新剧情 app（SceneApp）——**她嫌丑、没法绑预设，已不用** |
| aeded97 042879e | 剧情图标换回原剧情 app，并接上「世界」模式 |
| 7e0a5b4 | 发动机第一版 + 提醒事项 app |

### 2.1 世界时钟（`lib/world-clock.ts`）
- `app/layout.tsx` 的 `<head>` 最前面插开机脚本，把 `window.Date` 换掉：世界时间 = 现实 + offset。只换「现在」（无参 `new Date()`、`Date.now()`）
- 默认虚拟时间；localStorage `idol_world_clock_v1` `{real, offset, world}`
- 不玩就停：前台每 5 秒记 world，切后台冻住，回来从 world 接着走
- 自定义 app iframe 在 `custom-app-runner.tsx` 的 srcDoc 里带当时 offset（跳时间后要重开 app）
- 工具：`setWorldTime(ms)`、`shiftWorldTime(ms)`、`realNow()`、`subscribeWorldClock()`
- 设置 World 区有「世界时间」页（`components/settings/world-time-settings.tsx`）

### 2.2 时钟 app（`components/clock-app.tsx`、`styles/clock.css`、`lib/world-alarms.ts`）
- 黑底 iOS 时钟，四页；世界时钟页点「这个世界」或 + 弹「改时间」（定日期时间、往后拨、跟现实一致开关）
- 闹钟按世界时间响，`desktop-shell` 里 `useWorldAlarms(setNotice)` 每 5 秒查

### 2.3 桌面（`lib/desktop-config.ts`）
- `IDOL_HIDDEN_ICONS` 藏：漫卷、冒险、筑境、独家特调、工坊、共创、游戏、在场、iOS现实桥（从 ICONS 删掉）
- `ICONS.chat.label = "KakaoTalk"`
- 新图标：clock 时钟、contacts 通讯录、career 提醒事项（第一页：KakaoTalk、通讯录、提醒事项……）

### 2.4 锁屏（`components/lock-screen.tsx`、`lib/lock-screen.ts`、`styles/lock.css`、`components/settings/lock-settings.tsx`）
- `main-app.tsx` 去掉了开屏动画（数据没读好时只黑屏）和离线推送通知弹窗
- 锁屏挂在 `desktop-shell` 的 phone-wallpaper 后面；每次打开、或离开超过 1 分钟回来就锁
- 设置 kv `idol_lock_v1`：code(4/6 位)、hint、style(big/widget)、footText、widgetText、ink(light/dark)；壁纸 kv `idol_lock_wallpaper_v1`
- 两种样式：液态玻璃大时钟；小时间+日历小组件（左块：自定义字+日子+农历，右块：三周小日历）
- 设置 World 区「锁屏」页：锁屏看看、换壁纸、样式、字色、底部文字、密码和提示
- 还没开局（没有练习生证）时不锁

### 2.5 通讯录（`components/contacts/contacts-app.tsx`、`lib/idol-people.ts`、`styles/contacts.css`）
- iOS 26 联系人：字母排序（拼音首字母用 Intl.Collator 边界字）、索引、底部玻璃搜索（名字和 KakaoTalk ID）、+
- 列表页：所有/主要/背景、按身份分组（可改名删除）、我的列表（可建、可放人）、没见过的人、KakaoTalk 已加
- 名片：头像色渐变背景、Kakao/电话/视频/邮件按钮（加了好友才能直接聊/打）、KakaoTalk ID 和认识地点、公开人设、私下（骰子签）、说话雷区、跟你、你们的事、备注、照方向改（AI）
- 编辑页：头像、所有字段、主要/背景、是不是爱豆、见没见过、删除
- + 加人：让 AI 照模板捏（就这个人/换一个/照方向改）或自己写
- 我的名片 = 用户身份同一份数据（改名字、头像、关于我），下面显示练习生证 + 「重新填写练习生证」
- 档案 kv `idol_people_v1`（按 charId），自建列表 `idol_contact_lists_v1`
- **每个人都是 float 的角色**；`saveProfile` 自动 `composePersona` 写进角色 persona
- 档案库（`phone-character-app.tsx`）只显示主要人物（背景人物过滤掉，只是不显示）

**人物模板（她定的）**：标签只给爱豆的公开人设；私下跟公开的关系由代码掷骰子（表里如一/有一样有不一样/完全两个人）；非爱豆没有人设标签，只写平时、说话、可选雷区；大多数是普通人，不硬塞创伤秘密，不写「怕什么想要什么」，第一印象见面后才写，同一批人不撞型。规矩在 `idol-people.ts` 的 `CARD_RULES`。

### 2.6 开局页（`components/opening/trainee-opening.tsx`、`lib/trainee-card.ts`、`styles/opening.css`）
- 学生证风（她给的首尔艺高学生证素材）：淡紫圆点底、校徽（她找的图，`public/idol/crest.png`）
- 封面 → 五页申请表（①照片姓名生日国籍MBTI ②外貌、起点日期、练多久 ③家境六选一+补充 ④特长格子点星+补充+短板 ⑤其他+汇总）→ 横版练习生证 + 手指签名 → 「盖章 · 开始」
- 家境：普通、星二代、富二代、财阀、童星、自己写
- 每页「随便」只填空着的；底部三个按钮固定三格同大小，宋体细线双框
- 盖章：存 kv `idol_trainee_card_v1`，写进第一个用户身份（名字、头像、bio=describeTrainee），世界时钟拨到起点那天 9:00
- `desktop-shell` 里 `needOpening`：没有证就先盖开局页（z-index 300）
- 字号：页面里所有字 13px，只有封面大标题、表头标题、红章例外

### 2.7 剧情：原剧情 app + 「世界」模式（**现在用的**）
- 桌面「剧情」图标开的是原来的 `StoryApp`（`components/story/story-app-base.tsx`），保留她的界面、美化 CSS、预设、文风、状态栏、正则、世界书
- **「世界」角色**：id `idol_world`（`character-storage.ts` 的 `HIDDEN_WORLD_CHAR_ID`）
  - `loadCharacters()` 永远看不到它 → 档案库、通讯录、KakaoTalk、朋友圈、查手机都没有它
  - 剧情相关代码用 `loadAllCharacters()`；`saveCharacters` 会自动把它带回去
  - 头像默认用她的头像；在剧情 app 点书封可以换
  - 预设、文风、API：她在「设置 → 绑定管理」里设**剧情 app 的默认**（世界不在角色列表里）
- **一场戏 = 原剧情 app 的多人分组**：第一个是世界，后面是在场的人，分组名 = 地点；允许只有世界一个（`story-storage.ts` 的 `minGroupSize`）
- `lib/idol-world.ts`：`createWorldScene(place, premise, ids, nodeId?)`（建分组 + 主线会话 + autoStartPrompt 让世界先开场）、`buildWorldScenePrompt`、`extractSceneTags`/`applySceneTags`、`closeWorldScene`、场景元数据 kv `idol_scene_meta_v1`
- `lib/story-engine.ts`：主角色是世界时，注入场景块（她是谁、`careerPromptBlock()`、世界时间、地点、在场每个人完整档案、规矩、记号说明）；按会话的 ownerId 找分组（同一批人开好几场也不会串）；生成后摘掉记号并处理
- 记号：`[新人:名字|身份]` 自动存成背景人物并拉进这场；`[时间:+N分钟]` 拨时钟；`[收尾]` 提示「这场好像差不多了」；`[公司:一句话]` 记进公司细节
- 剧情 app 里：右上 + 变成「开一场戏」（地点、开头、从通讯录挑在场的人）；书封显示《地点》、「我 x 在场的人」（超过 3 个折叠成「等 N 人」可展开）、新面孔、世界时间
- `$` 开头：`$过半小时/三天/一周`、`$明天早上`、`$跳到周五` 由代码直接办（`idol-scenes.ts` 的 `runTimeCommand`）；其余当场外指令发给 AI（存成「（场外指令…）」，记账时不算）
- 「结束这场」胶囊（跟续写同一排，在右边）→ 对话框 → `closeWorldScene`：AI 出 JSON，给每个在场的人记一笔「你们的事」，第一次见的写「跟你」第一印象，主要人物存一条长期记忆（sourceApp story）；如果这场是发动机节点，就 `completeNode` → 再选跳到什么时候
- 旧的 `components/scene/scene-app.tsx`（SceneApp）不再打开，`lib/idol-scenes.ts` 里的 `parseReply`、`runTimeCommand`、`fmtWorld` 还在用

### 2.8 发动机 + 提醒事项（`lib/idol-career.ts`、`components/career/career-app.tsx`，样式在 `styles/scene.css` 末尾）
- 六家**真实公司**（她要真名）：SM、JYP、YG、HYBE、Starship、Cube，每家写规模、风格、练习生、招人、名声（`COMPANIES`），不分年份
- kv `idol_career_v1`：stage(pre/trainee)、companyId、signedAt、insider（公司内部档案）、facts、offers、nodes
- `careerTick` 在 desktop-shell 每 5 秒跑：
  - 开局后生成邀请：星二代/富二代/财阀/童星 → 三家星探邀请（1 小时后起陆续到）；普通/自己写 → 两家试镜通知（1 天后起）
  - 邀请到了、节点前一天、节点到点都弹桌面提醒；过了 12 小时没演 → 标「没演，平常地过去了」
  - 时钟往回拨导致邀请远在未来时，改成 1 小时后到
- 接受邀请 → 两天后下午 2 点试镜节点，写进日历（user/self）
- 「去演」→ `requestNodeScene`（kv `idol_pending_scene_v1` + 打开剧情 app，剧情 app 接住开戏）
- 试镜那场演完 → `signCompany`：进练习生阶段，第二天 9 点「进公司第一天」，`extendSchedule` 排 35 天：每周五 17:00 周评、每月最后一个周五 14:00 月考（那天不排周评），AI 照这家公司风格展开「公司内部档案」（楼里/宿舍/一周/规矩），练习生证「所属」写上公司
- 提醒事项 app 两页：日程（你现在、找你的公司、接下来、过去的）、公司（骨架、内部档案可改可重新生成、戏里定下来的细节可删）；没进公司时公司页列六家
- **不预设失败**：试镜演完就签约

### 2.9 有人来找你（10-27 下午，f9c079a，`lib/idol-kakao.ts`）
- 记号：`[给号:名字|ID]` 记下他的 ID（`gaveId`；不弹提示，正文里写着）；`[加你:名字|一句话]` 排进 kv `idol_kakao_v1.incoming`，15～115 分钟后进「新的朋友」（`sourcePlace`）
- 她自己的 ID：`myKakaoId()`，通讯录我的名片可改；世界的提示里带上
- KakaoTalk 添加朋友（`chat-message-list.tsx`、`chat-contacts-list.tsx`）：只能搜 ID（不分大小写），候选列表去掉了；搜到只显示头像名字 ID（她说资料满不满意该在通讯录定）；加的时候卡太薄就悄悄 `fleshOut` 补全；通讯录名片上只有名字的人有「照模板补全」按钮；加上 = 直接好友 + 升主要人物 + 灰字写在哪认识 + 他回一句
- 接受申请也升主要人物，卡太薄先补全；在哪认识写进灰字；拒绝了不会再来缠
- 背景人物没给过 ID：名片显示「他还没给你」，通讯录搜索也搜不到 ID
- 发动机：第一天那场结束（或没演过去了）→ 管理老师（在场的老师，没有就 AI 捏）拉群「公司 新人练习生」，在场的同期一起进；节点前 20 小时内老师在群里发通知（AI 用老师口吻）；月考那场结束 → 70% 有一个在场同期来加
- 测试：`docs/idol/tests/kk1.mjs`（按请求内容回假 AI）

### 2.12 提醒事项重做（10-27，`lib/idol-reminders.ts`、`components/career/career-app.tsx`、`styles/reminders.css`）
- iOS 原生样子，白天浅色晚上深色（世界时间 7～19 点白天）。首页六卡（今天/计划/待回复/全部/请假·缺席/完成）+ 我的列表（公司日程/机会/约/我自己记的，按 `listOf(node)`）+ 公司（档案、月末排名占位）+ 右下 +
- CareerNode 加 kind（talk/makeup/chance/date/custom）、status（invite/leave/absent/declined）、from/fromId/replyBy/result/wish/note
- 三结局：去演（详情页，wish 带进 premise）/ 打勾写一句 `checkNode`（老师或约的人记一笔，节点后续照走）/ 过 2 小时没动 `reminderTick` 标缺席 → `onAbsent`（老师私聊问，第二次起排「去办公室」；约的人来问）
- 请假：左滑或详情 `leaveNode`（周评月考排补考，玩得好的人 1～4 小时后来关心）；KakaoTalk 私聊老师时 `buildIdolChatHint` 让老师决定批不批，回复里 `[准假:日程名]` 由 `installIdolChatHooks`（message.beforePersist）摘掉并请假
- 待回复：`acceptInvite`/`declineInvite`（公司邀请 offers 也算），replyBy 过期作废
- 跳时间：`jumpWorld` = `capJump`，遇到日程（提前半小时）或新待回复就停；`$` 指令和结束这场的跳时间按钮都走它
- 后台消息 outbox：`sendAs` 用 chat 绑定的 API 让某人私聊她（没加过会自动加上，老师就是这样）

### 2.13 人物（10-27）
- IdolProfile 加 gender/birthday/mbti/relation/heart/canCrush/secret/rolled；CARD_RULES 加性别生日 MBTI、年龄规矩、秘密按骰子；`draftFields` 统一落字段
- `applyStartRolls`（saveProfile/createPerson 自动跑一次，要有性别年龄）：心动线 = 年龄差（她未成年 3 岁内，成年 4 岁内）+ 不是管她的人 + 男（女 10%）；起点按人缘 `loadCharm`（默认招人喜欢）
- `stepRelation`：关系 陌生→…→好朋友→暧昧→恋人（暧昧要心动≥有点在意，恋人≥喜欢），恋人往下是前任；`decayRelations` 每世界日跑一次（三周没交集好朋友→朋友、暧昧→好朋友）
- 结束这场记账 JSON 加 relation/heart（up/down/same）、secretLearned（揭穿秘密写怎么知道的）
- composePersona 带态度和秘密（她不知道时不说破）
- 通讯录：名片显示关系、生日、MBTI、你知道的秘密、🤫偷看秘密（秘密+心动）；编辑页加性别生日 MBTI 关系心动秘密（她知道了吗）；我的名片加人缘
- 室友：第一天拉群时 `ensureRoommates`（在场同龄女练习生优先，不够捏，1～2 个，career.roommates，世界提示里有）
- 开局页「练多久」→「多久出道」，随便年龄 16～19；路人带年龄（多数 15～19，少数 12～14 小练习生，偶尔 20、21）

### 2.14 事情发动机（10-27，`lib/idol-events.ts`）
- kv `idol_events_v1`：plannedUntil、events（排好的）、posts、feed（发生过的，世界提示「最近正在发生的事」）、setbacks（挫折记账）、lastBig/lastSick、health（她生病）、fame（关注度，开局按家境：童星 50/星二代 40/富二代财阀 30/其他 5；完成机会 +5）
- `eventsTick`（练习生阶段才跑）：排到的不足一天就 `plan(from, now+3天)`——一次 AI 调用（PLAN_RULES）排三天的事：events（at、kind small/big/setback/sick/chance/date、about、people、lines 群里或私聊的话、invite）、newPeople、status（近况要更新的人）、posts（动态）
- 代码管频率：挫折约两个月一次（间隔 50 天、45% 概率）、一年最多六、同种不重复、按家境和关注度挑类型；生病 90 天以上、12%；大事 8 天一件
- 执行：群里的话按原来时间补；私聊过了 2 小时就用落地时间（不像没回）；没加过的人只有老师能私聊；invite → 提醒事项待回复；sick → health 3 天；相关的人记一笔；跳过的日子下次排时一起补（最多回补 10 天）
- 跳时间停：`plannedStops()` 进 capJump
- 近况：IdolProfile.status {text, kakao, at}；排事情时更新、结束这场记账时更新；KakaoTalk 好友列表名字下面显示 kakao 状态消息，通讯录名片「最近」，composePersona 带【最近】
- 动态：moments-engine 的定时自动发帖关掉（pollScheduledPosts 直接 return），发动机 posts 发帖（只发 KakaoTalk 好友的）；「让他立刻发一条」照旧
- 聊天里答应/拒绝：`buildIdolChatHint` 给发出邀请的人列出等她回的事，回复里 `[答应:…]`/`[不去:…]` 自动更新待回复

### 2.15 账和月末排名（10-27，`lib/idol-ledger.ts`、`lib/idol-rank-image.ts`）
- kv `idol_ledger_v1`：entries（账）、levels（每人藏着的水平，她是 `__me__`）、months（每月结果，含画好的图和群消息 id）、ranked
- 记账：打勾按她写的那句给分（`scoreResultText`），戏里演的考核记账时 AI 给 performance good/ok/bad，缺席 -4，完成机会 +3；算名次时加特长数和老师关系
- `rankTick`：月考结束（演/打勾/请假/缺席都算）第二天 10 点，练习生群建好后才排；参加的人 = 她 + 女练习生主要人物 + 群里路人；新人从 68% 位置起步；一个月最多升降 8 名（有高分事件放宽到 14）；考前 wish 照着排
- 发布：老师在群里一句话 + 代码画的「月末评价结果.jpg」（canvas，jpeg）+ 两三个同期反应（一次 AI 调用，失败有兜底）；老师私下评语存在 months
- 提醒事项「月末排名」页：每月名次、变化、老师评语、表（点开看大图）、改我的名次（`overrideMyRank` 重排重画、群里那张图也换掉）
- **desktop-shell 的世界计时器现在等聊天存储读完才跑**（之前开机马上写消息会被盖掉）

### 2.16 出道（10-27 白天，`lib/idol-debut.ts`、`lib/idol-debut-image.ts`）
- 预览 d1～d5 全定稿（`mockups/debut/`，旧版在 `old/`）；图都是 canvas 画的，不用生图
- 练习生阶段第一次 `debutTick`：按练习生证「多久出道」（`parseMonths`，看不懂按一年半，最少 4 个月）定目标，目标前两个半月（至少签约后 45 天）的周一 14:00 排「出道组选拔」（kind `selection`，提醒事项里演/打勾/请假/缺席）
- 选拔结果 `onSelection`：第三次一定进；缺席不进；她写的「想要的结果」照办；否则看上次月末排名百分位 + 近 60 天的账（第一次门槛前 40%，之后前 62%）。没进：三个月后再选，老师第二天私聊说原因（走提醒事项 outbox）。请假：三天后单独补看
- 进了 `formTeam`：挑 4～7 人（女练习生主要人物按账本水平 + 室友/朋友加分，不够就捏，重名不要）+ 捏经纪人；**一次 AI 调用**定每人定位（中韩）、韩文名、国籍、队名（英/韩/中文意思/韩文意思）、出道曲、所有人要说的话（kv `idol_career_v1.debut.words`）
- 时间线：第二天 10:00 管理老师私聊发 `데뷔조 명단.jpg`（d1）→ 五天后 18:00 经纪人拉「PROJECT X（暂定）」群发 `멤버 포지션.jpg`（d2）+ 反应 → 三周后「队名公布」（kind `debut` step `name`，演/打勾/请假/缺席都会公布）群里发队名海报（d3，意思一句一行）、群名改「队名 ✦」→ 录出道曲、MV 拍摄、出道 Showcase（出道日 = 拉群后 77 天 18:00）。经纪人在出道组群里提前 20 小时通知（kakaoTick 里的 `debutNoticeTarget`）
- 锁屏：出道前 100 天内显示 D-N 小组件 + 今天日程（d4）；出道当天 6:30 `sendDday`：stage 改 `idol`，之前没看的通知收起，推妈妈 KakaoTalk、NAVER 新闻、提醒事项 Showcase、团群第一句（都 `pin` 置顶），手机自动锁上（d5），时间下面一行「✦ 队名 DEBUT DAY ✦」
- `careerPromptBlock` 带 `debutPromptBlock`（选拔前 40 天写「在传名单」；进组后写成员定位、队名公布前写暂定名）
- 出道后（stage idol）：练习生的周评月考、排名、事情发动机都停了，出道后的东西还没做（events.md 第六块）

### 2.17 通知（第 6 块，`lib/idol-notes.ts`）
- 发动机所有提醒（原来的桌面提示条）换成 iOS 横幅（照 d5），点了跳 KakaoTalk/提醒事项/时钟；同时存 kv `idol_lock_notes_v1`，锁屏显示没看过的（同一个人连着几条叠起来），开锁算看过
- 宿主自己的小提示（「日程已保存」这种）还是原来的提示条

### 2.18 日历（第 5 块 + 她要的「帮我排这周」，`lib/idol-calendar.ts`、`components/calendar/idol-almanac.tsx`）
- 只留她自己的日历（`calendar-app.tsx` 的 `IDOL_ONLY_ME`），顶上换成「大事记」「帮我排这周」两个按钮
- 大事记：写死的（元旦、春节설날、中秋추석、圣诞、跨年、她生日、公司年末家族演唱会 12 月第三个周六、年末颁奖季）+ 发动机大事（签约、选拔、出道那几件）+ 圈内（AI 每月一次，打开日历时补当月，kv `idol_almanac_v1.world`，可「让 AI 写圈内大事」重写）+ 她记的（可「让 AI 帮我写」）。月历格子里农历那行换成大事（四种颜色），详情页每天上面列当天大事 +「记一笔大事」
- 帮我排这周：AI 只往空档填（绕开提醒事项、她自己排的、大事记），每天两到四条，条目 id `plan_` 开头、能改能删；再排一次换掉上次的；「清掉 AI 排的」

测试：`tests/db1.mjs`（整条出道线 + 日历，假 AI；开发模式下有 `window.__idol.checkNode/leaveNode/run`）

### 2.19 世界书、身份、日历调整（10-27 晚）
- **自动世界书**（`lib/idol-worldbook.ts`）：id `wb_idol_world_auto`「爱豆世界（自动）」，两条常驻：她是谁（外界知道的 / 只有身边人知道的）、圈内最近（前后一个月的大事记 + 身边最近的事）。发动机每 5 秒对比，变了才写
  - `resolveBinding`（settings-storage）自动把它加进每个 app 的世界书，不用勾；「世界」开的戏不重复带
  - 自定义 app 的 `ai.chat` 自动在最前面垫 `idolWorldPrompt()`（传 `world:false` 可以不要）→ 以后装的 app 都能读到
- 日历圈内大事**不再自动写**，只有她点「让 AI 写圈内大事」才写；跟团/艺人有关的标公司（六家里挑），无关的不标；以前出现过的团会接着出现
- 用户身份只留一个（练习生档案那个）：`ensureSingleIdentity` 开机跑，去掉宿主示例身份和它的设定；盖章不再替她加设定；设置里不能新增、不能删除（`IDOL_SINGLE`）
- 通知：横幅完整弹完/点了算看过，被下一条顶掉的才留到锁屏；出道当天那串 `pin` 置顶
- 测试 `tests/wb1.mjs`

### 2.20 存档（10-27 晚，`lib/idol-saves.ts`、`components/settings/saves-settings.tsx`）
- 一个档 = 世界里的一切：聊天/媒体/记忆/动态/剧情/查手机/住宅几个库 + kv 里除了「共用」以外的全部 + localStorage 的世界时钟
- 共用不跟档：settings 模块的 kv（除了用户身份、角色聊天设置）、桌面美化、装好的 app 列表和图标、音乐阅读、资源集市、锁屏设置和壁纸、云备份凭证；AiPhoneSettingsDB（预设/世界书/正则）整个不动
- 档存在单独的 IndexedDB `IdolSavesDB`（meta/data 两张表），当前档 id 在 localStorage `idol_current_save_id`
- 开新档 `startNewSave`：存当前 → 清世界（连 localStorage 里的旧副本）→ 新 id → 钉住世界时钟 → 刷新（没证就进开局页）；切换 `switchToSave`：存当前 → 清 → 导入目标 → 钉时钟为目标的 → 刷新。切的时候 `window.__idolSwitching` 让发动机别写
- 入口：设置「存档」卡片；通讯录我的名片「存档 · 开新档」（面板 portal 到 .ct-app）。每个档照练习生证画（`components/opening/trainee-id-mini.tsx`，名片也用它）
- 「重新填写练习生证」按钮去掉了（换人走开新档）
- 测试 `tests/sv1.mjs`（A→开新档→B→切回 A，人、证、世界时间、API 都对）

### 2.21 每年一定来的事（10-27 晚，`lib/idol-yearly.ts`）
- 后台排事情不再排这几件（PLAN_RULES 里写了），改成到时间一定来，kv `idol_yearly_v1.done` 记做过的；跳过去的直接记做过不补
- 她的生日：当天 8 点起，要好的人（室友优先 + KakaoTalk 里朋友以上，最多三个）陆续私聊祝福；第一个人约她晚上 7 点吃饭（date 待回复）
- 春节、中秋（按农历算，放三天）：提前一周上午 10 点老师在练习生群通知，「X回家」进待回复（kind `event`，回复截止放假前三天晚上），不回家就留宿舍
- 年末家族演唱会（12 月第三个周六）：提前四周定伴舞（上次排名前 45%、或关注度 ≥30、或前 60% 里碰运气）。选上：老师私聊 + 彩排（12 月第一个周六晚）+ 走台（前两天下午）+ 上台（kind chance）；没选上：台下看（event）。签约不满两周的轮不到
- 跳时间遇到这些会停（`yearlyStops` 进 capJump）
- 日历大事记加主要人物生日（kind `birthday`，粉色，「🎂名字」），只标注
- 测试 `tests/yr1.mjs`

### 2.22 IdolSearch + 邮箱（10-27 夜，`lib/idol-search.ts`、`components/idolsearch/idol-search-app.tsx`、`styles/idolsearch.css`、`lib/idol-mail.ts`、`custom-apps/mail` 0.2.0）
- 预览定稿在 `mockups/search/`（s2 首页、s3 搜索结果、s4 官网三页、s5 投递和邮箱；s1/s3_old 是旧版）
- **开局**：普通家境（含自己写）`makeOffers` 返回空，只能自己去 IdolSearch 投；星二代/富二代/财阀/童星照样有星探，也能投
- IdolSearch（桌面图标 `idolsearch`，第一页提醒事项后面）：首页实时热搜+新闻（世界每过一天 AI 写一次，kv `idol_search_v1.trend`）、搜公司（资料卡+官网）、搜艺人（官网里写过的团，`artists`）、搜她自己（童星/星二代或关注度 ≥20 才搜得到，否则「没有相关结果」）、其他词 AI 出新闻（按天缓存）、我的（搜索记录、六家公司）
- 官网：第一次打开 AI 按公司资料+世界年份写（about 四段韩上中下、年表、公告、旗下艺人），存 `sites[公司]`，年份变了才重写；每家主题色在 `LOOKS`；报名资格 = 世界年份 − 20 年以后出生
- 投递：表单从练习生证带名字生日身高、特长→方向；照片压成 260px 存 dataURL；视频写文字描述。投完 IdolSearch 发回执信。`decideAt` 3～8 天后 `searchTick` 让 AI 当审核组判：invite/reject/silent（拒信写原因，列表上直接显示）。**保底**：一家都还没邀请、也没别的在审核 → 这家一定邀请（`forced`）。不回的那种三周后才显示「没有回音」。已经签约了剩下的直接当没回音。三个月后能再投同一家
- 邮箱：**用 float 原来的邮箱 app 改**（她要的，`nox.mail` 0.2.0，包在 `custom-apps/mail/mail-0.2.0.zip`，爱豆版要装上）。宿主存一份 kv `idol_mail_v1`，`mailAppTick` 塞进邮箱的 `mails` 集合（行上带 `idol: {paras, subjectZh, action}`），写 meta `idol_mode` → 邮箱里 char 不主动写信、抽屉不列 char、不发欢迎信。公司信韩文在上灰色中文在下；邀请信有时间地点准备 +「接受 · 进提醒事项」「改时间」（顺延 1～3 天）「不去了」。她点了 → 邮箱写回行 → 宿主 `acceptInviteMail` 建 audition 节点（premise 带公司看中她的地方）进提醒事项和日历，演完照旧 `signCompany`
- 横幅 app `mail` 点了打开邮箱 app；IdolSearch 投递详情「去邮箱看回信」也是
- `careerPromptBlock` 没进公司时带【她的投递】
- 测试 `tests/is1.mjs`（普通家境→搜 JYP→官网→投递→九天后保底邀请→邮箱里接受→提醒事项有试镜）

### 2.23 圈内名册（10-27 夜，`lib/idol-groups.ts`）
- kv `idol_groups_v1`：这个世界里所有团和艺人只记一份。官网、日历大事记、热搜、搜索、自动世界书（circleText 末尾）、通讯录捏人（rosterLine）都读它
- **谁先写谁说了算**（她定的）：`upsertGroups` 已有的团只补空字段（公司、类型、人数、出道年、风格、粉丝名、成员），「最近」可更新，新歌往后加；公司对不上的不动（别家官网抢不走）
- 大事记 JSON 多了 `group` 字段，第一次出现的团记进名册（只有公司，成员等官网补）
- 出道年份比例（她担心年龄差太大）：官网每家至少两个近四年出道、一个五到八年、最多一个老前辈；大事记新团多数近四年
- **名册不带成员出生年**（她说内容太多）：她对谁感兴趣就去接触、加进通讯录时再生成年龄，可以改；捏人提示里要求团的信息照名册、年龄跟出道年份对得上
- 日历「记一笔大事」加了「哪个团」「公司」，填了团名出现「记进圈内名册」勾选（默认勾上，可以不勾）；名册已有的团自动带公司、显示已有信息，公司对不上不改名册；标题带「出道」就记出道年份（只补空）。测试 `tests/gr2.mjs`
- 测试 `tests/gr1.mjs`；开发模式 `window.__idolGroups = { load, month, site }`

---

## 3. 定下来但还没做的（按她的意愿排）

**10-27 白天**：出道那一套、第 5 块日历、第 6 块通知都做完了（见 2.16～2.18）。还剩：调用开关（钱）、出道后的阶段。

**10-27 凌晨进度**：第 1、2、3 块和第 4 块的账、排名做完了。出道判定和出道那一套**她说要精致，先出预览**：第一版五张在 `mockups/debut/`（说明在 events.md 末尾），d5 出道当天锁屏通知定稿，d1～d4 她明天再说怎么改。然后然后 5 大事记日历、6 锁屏通知（她嫌现在桌面提示条丑，要 iOS 横幅）和调用开关。完整设计在 `docs/idol/events.md`。

### 2.10 去哪儿（10-27，`lib/idol-places.ts`）
- 剧情右上 + =「去哪儿」：类别（公司/宿舍/附近/出去玩/生活/自己写，出道后那类藏着）点地点，公司宿舍前面自动带公司名，没进公司锁着
- 谁在：「交给世界」（默认）或「我叫上人」。交给世界 = 没挑人 → meta.open，提示里加【可能碰上的人】（见过的/主要人物按相关度排：在这个地方有过事、最近有交集、主要人物、加了 Kakao；前 25 个写身份+平时两句+最近一件事，其余只写名字身份，人多也不漏），世界自己判断谁在；出场写 `[出场:名字]` 拉进这场
- **她定的：不加「常去的地方」**（怕刻板，让世界按身份习惯推）
- 测试 `tests/pl1.mjs`（截图）`pl2.mjs`（交给世界）

### 2.11 大群路人（10-27，`lib/idol-crowd.ts`）
- kv `idol_group_crowd_v1`：按群会话存路人 {id: crowd_xxx, name, role, promotedTo?}；练习生群建好时塞 30～60 个（代码起韩国名，少量外国练习生）
- 群名人数 = 成员 + 没转正的路人 + 她；群聊提示词末尾加【群里的其他人】（最近说过话的路人在前，最多列 15 个），路人偶尔冒一句
- `parseGroupChatResponse` 名单外的名字查路人名册；chat-room 落库那里放行 crowd id；路人头像用默认头像
- 点路人头像 → `promoteCrowd` 建背景人物、进群成员、后台补全卡 → 宿主陌生人名片「加好友」（加了升主要人物）
- 测试 `tests/cr2.mjs`

### 2.24 关注度（10-27 夜，`lib/idol-fame.ts`、`components/contacts/fame-card.tsx`、`styles/fame.css`）
- kv `idol_fame_v1`：pop 人气（慢涨基本不掉）+ heat 热度（半衰期一周，按世界时间衰减；退掉的按周并成一行「热度慢慢退了」）+ log。旧存档 `idol_events_v1.fame` 自动迁过来
- 三档 `FAME_TIERS`：0～19 普通人 / 20～49 小有人知 / 50+ 公众人物；career.stage 是 idol 一律公众人物（`fameTier`）
- 开局人气：童星 55、星二代 50、富二代/财阀 30、普通和自己写 5
- `fameEvent(size, text)`：small 热度+2；medium 热度+5 人气+1；big 热度+10～20；debut 人气+30。发动机 PLAN_RULES 事件多了 `fame` 字段（AI 标），runEvent 时加；完成机会走 medium（`addFame`）；出道当天 `sendDday` 加 debut
- `idol-events` 里 `fameNow/addFame/fameWord` 留着转到这里；新加 `addWorldFeed(text)`
- 名片：练习生证下面薄荷绿「인지도」证（预览 mockups/fame2）；点开液态玻璃详情（现在/三档只写档名/最近的变化近 30 天+看更早的，开局那行固定最底/自己改滑条 `setFameTotal`，差多少算在人气上）
- 测试 `tests/fm1.mjs`

### 2.25 ins（10-27 夜，`lib/idol-ins.ts`、`components/ins/ins-app.tsx`、`styles/ins.css`，桌面图标 `ins`）
- 预览定稿 `mockups/ig/i2.png`、`i3.png`；主页和帖子直接用 checkphone.css 的 `cp-instagram-*`；**界面不要 emoji**，图标全是线条；锁着的号不标锁
- kv `idol_ins_v1`：me（handle/name/bio/private 默认 true/riskHint 默认 true）、accs（char 主号；出道爱豆=蓝勾公开号+私人小号 alt；团官方号从圈内名册来；路人 npc）、following/followers/requested/incoming/askedMe、posts、stories（24 小时）、notes、dms、filledAt、explore
- 起账号 `ensureAccounts`：主要人物一次 AI 调用起网名简介；练习生一律锁，爱豆大号公开认证+小号
- 关注：公开号直接关注；锁着的申请，`insTick` 到 decideAt 决定（见过的 95% 同意）；认识她的人偶尔来申请关注她（她私密就进「关注申请」）
- 打开 ins：距上次 >2 小时就 `fillFeed`（一次调用补她关注的号这段时间的帖子和快拍；帖子必须有图 1～5 张、配文短、韩国人韩语带 capZh）。不跟发动机
- 她发帖 `myPost` → `reactToMine`（一次调用：点赞评论 + 风险 none/low/mid/high + why + love）。被扒概率 = 风险 × 档位（普通人 0.3/小有人知 0.8/公众人物 1.3）× 公开 1/私密 0.5；会被扒就定 leakAt（high 3～12 小时、mid 1～3 天、low 3～7 天）。之前删帖/归档/切私密（`hiddenAt`）在前一半时间里就躲掉，晚了 50%。被扒 → `fameEvent` + `addWorldFeed` + 横幅 + 老师 `queueMessage`（秀恩爱按恋爱禁令约谈）
- 风险灰字只在 me.riskHint 开着时显示（更多选项里的开关），判断照样做
- 图：描述卡（黑底宋体）+「生成这张图」（`generateImg`，带「照片里有谁」的参考图，`SELF_REFERENCE_ID` 是她）；相册选图（`loadPhotos`）或上传（`storeMediaBlob`）
- 快拍：纯色底+字或画面；谁看过由代码排（关注她的人，心动的人深夜看的多，深夜时间标粉）
- 探索：每个世界日一次调用 12 条公开帖
- 私信：只给没加 Kakao 的人（`dmAllowed`）；默认不自动回，+ 里「让他回」「他先说一句」「照片（没做）」「聊天设置」（自动回复：她停 10 秒后回；他会主动来找你：开关已有，**主动来找还没接发动机**）；长按 换一条/编辑/复制/删除
- 还没做：私信发照片、陌生人私信请求的来源（fill 里还没出）、他主动来私信、出道后公司开公开号（现在只有她自己切公开）
- 测试 `tests/ig1.mjs`

- 10-27 深夜补（c255637、8bd88b2）：陌生人关注（公开号按档位：普通人偶尔、小有人知几个、公众人物很多；私密号变成关注申请，代码起网名不花调用）；fillFeed 同一次调用里出 dms（陌生人私信最多按档位 0～3 个，进「请求」；熟人主动私信只限 ins 上有来往、没加 Kakao、开着「会主动来找你」的）；点赞；她自己评论 + 评论区只一个「加载更多评论」（她评论过而还没人回，这批里楼主/被她回的人一定回她，像微博那样）；私信发照片（描述卡/上传/相册）；一个人说话语言统一（韩国人每句韩语带 zh）；主页名字只在 ID 下面出现一次

- 10-27 深夜最后（19b9191、928cd38、d9cbf57）：主页去掉按钮下的横线，三个标签帖子/视频（占位）/被标记，选中黑线在图标下面；陌生人关注用 `strangersAt` 单独记时间；编辑主页换头像 `me.avatar`（上传或相册，可换回练习生证照片）；发帖：没图时一张空卡片「添加照片」→ 弹出「从相册选 / 写画面」，相册打勾多选（右上角序号、「下一步（N）」）、上传 multiple、写画面一次写多张（「再写一张」）；有图后**不放加号、不放「N 张 · 重新选」**（她嫌不好看），重选就点 × 删光。测试 `tests/ig2.mjs`

### 2.26 社交 app 统一身份（10-27 深夜，`lib/idol-social.ts`）
- `socialTick` 每 5 秒：装了 `nox.weibo`、`nox.douban` 的，往它们的 meta 集合写一行 `idol_mode`：publicChars（profile.isIdol 且 role/group 里没有「练习生」）、publicMe（关注度公众人物档）、tierMe、whoMe、altOnly、meAnon；变了才写
- 微博 0.9.30：读到 idol_mode 就覆盖 publicFigure/publicChars；她小有人知时评论区偶尔有人认出；设置里「身份」和编辑资料的「公众人物」改成只显示「由世界决定」，手动开关不响应
- 豆瓣 0.4.0：公众人物 char 出场一律匿名（`altOnly`：genTopics、authorFrom、char 主页旧帖），匿名楼「他的马甲」只她看得到；publicLine 写明他只用匿名小号不暴露身份；她发帖回帖默认匿名；设置里公众人物那块改成说明
- 小红书（宿主）：`idolXhsLine()` 塞进路人反应她笔记、加载更多评论两处提示
- 包在 `~/Desktop/爱豆小手机安装包/`（mail 0.2.0、weibo 0.9.30、douban 0.4.0）。**爱豆版用的版本号跳开了 float**：float 那边微博还在 0.9.26、豆瓣 0.3.4，以后 float 发版别撞这两个号
- 测试 `tests/sc1.mjs`

### 「有人来找你」（大部分已做，见 2.9；还没做的：平常日子偶尔有人来、多人叠卡）
1. 戏里有人要她的号或给她号 → 记号（比如 `[加好友:名字|谁提的]`）。**她要加人不能自动加上**：她得去 KakaoTalk 右上 + 添加好友、输入他的 KakaoTalk ID 搜出来发申请（宿主已有：`chat-message-list.tsx` 按 wechatID 搜）；他加她 → 走「新的朋友」好友申请（`lib/friend-request-storage.ts`、`lib/group-friend.ts` 已有类似逻辑）
2. 背景人物被她搜 ID 时，才照模板补全卡、弹给她看
3. 发动机在节点前后安排人来找她：进公司第一天管理老师拉她进练习生群、月考后同期私聊、管理老师/经纪人在 KakaoTalk 提前通知日程
4. 平常日子偶尔有人来加她或找她聊天
5. 加上以后私聊开头一行灰字写在哪认识，他带着戏里的记忆

### 练习生时期补全（她问「做完了吗」——没有）
- 还缺：给前辈伴舞、公司年末演唱会、拍练习生公开视频、有人进来有人走（淘汰）、放假回家、生日、生病体检、语言课
- 出道组选拔 → 定位置 → 定队名 → 录出道曲 → 出道；按她填的「练多久」走到出道
- 出道后：回归四阶段（准备 2-4 周/回归周/打歌 3-6 周/休整）、打歌节目周几（The Show 周二、Show Champion 周三、M Countdown 周四、音乐银行周五、音乐中心周六、人气歌谣周日）、年末颁奖季、大事件后论坛热帖
- 挫折可以有但要有剧情里的具体原因，不许莫名挑刺；不做「挫折多少」调节

### 其他待做
- 好几个新人同时出场：一个弹窗叠几张卡，左右翻，一张张点或「都要」（现在是直接存背景人物）
- 锁屏通知（消息、好友申请、日程提醒）
- 「她是谁」世界书：给微博、bubble、小红书读（身份、出道几年、关注度——练习生也有一小撮粉丝，从公开视频/伴舞来）；练习生时期没有自己的 bubble，但能订已出道前辈的 bubble
- ~~IdolSearch~~ 做完了（2.22）
- 新 app：ins（练习生一般不能开公开号，可有私人小号）、YouTube（公司频道放练习生视频，评论区是早期粉丝来源）
- 存档：一个链接里多个档，整机快照（用 `lib/data-management/backup.ts`），设置里「存档」页每档显示练习生证；开局页留「重新开局」
- 设置里「用户身份」入口改成跳去通讯录我的名片；多身份切换在爱豆版藏掉
- 每个人的状态栏（剧情 app 原有状态栏方案她可以自己设）
- 上线：新 Netlify 站

---

## 4. 测试方法（重要：我这边没有她的 API）

- puppeteer-core，用本机 Chrome，headless，viewport 430×900；脚本放在 `docs/idol/tests/`（node_modules 需要软链一个有 puppeteer-core 的目录，之前在 scratchpad 的 t/node_modules → `/private/tmp/claude-501/-Users-flora/9ef8172c-.../scratchpad/t/node_modules`，新窗口要重新找或 `npm i puppeteer-core` 到 scratchpad）
- **假 AI**：kv 里写一个 API 配置 baseUrl `https://mock.test/v1`，puppeteer 拦截请求，OPTIONS 回 204 + CORS 头，POST 按顺序回假的 OpenAI 格式回复。见 `tests/cr1.mjs`（完整：邀请→试镜→签约→日程）、`tests/st3.mjs`（世界模式演戏+结束记账）
- 种数据：直接写 IndexedDB `AiPhoneKvDB` 的 `entries` 表（key/value），再 reload
- 改世界时间：页面里 `window.__worldClock.offset = 目标 - __worldClock.RealDate.now()`（别写 localStorage，会被 pagehide 覆盖）
- 开锁：点 `.lock-swipe`；打开 app：`window.postMessage({type:"OS_CMD",action:"open_app",appId:"..."},"*")`
- 截图后自己先 Read 看一遍再给她；看字形要放大截图（deviceScaleFactor 3）
- 开发服务器偶尔在重新编译时截到没样式的页面，重跑一次就好

## 5. 关键数据键一览

| key | 存什么 |
|---|---|
| localStorage `idol_world_clock_v1` | 世界时钟 |
| kv `idol_world_alarms_v1` / `_last_v1` | 闹钟 |
| kv `idol_lock_v1` / `idol_lock_wallpaper_v1` | 锁屏 |
| kv `idol_trainee_card_v1` | 练习生证 |
| kv `idol_people_v1` / `idol_contact_lists_v1` | 人物档案 / 自建列表 |
| kv `idol_scene_meta_v1` | 每场戏的地点、开始时间、新面孔、节点、总结 |
| kv `idol_career_v1` | 发动机状态 |
| kv `idol_pending_scene_v1` | 待开的戏 |
| kv `idol_scenes_v1` | 旧 SceneApp 的戏（已不用） |

参考资料都在 `docs/idol/`：`idol.txt`（Kpop 爱豆模拟器文档）、`ehp.txt`、`cortis.txt`（嫂子模拟器）、`mockups/`（定稿预览）。

### 2.27 10-27 夜：ins 小改 + YouTube 定稿（还没开工）
- eb32157：点图放大（`ImgViewer`，portal 到 `.ig-app`）里「生成图片 / 编辑文字」，别人的描述也能改（`editImgDesc`）；去掉图片右下角生成按钮；每条帖子、快拍「…」里「彻底删除」（`purgePost` / `purgeStory`，当没发生过，连通知、发现页一起清）；她自己的帖子还保留戏里的「归档 / 删除」（影响被扒）。测试 `tests/ig3.mjs`
- f64d231：点赞数、评论数跟在图标旁边，去掉「N 次赞」那行
- ins 画面字体保持宋体（她看了苹方对比，说先别换）
- **待改三条（a2228b0 已做完）**：
  1. ins 没有退出键。左上角 Instagram 字样不变，改成点一下它就退出 ins
  2. 发快拍不能用自己的图：要能上传图片、从相册选（像发帖那样）
  3. 快拍顶端（进度条、头像名字时间、… 和 ×）有地方没对齐，整页都检查一遍对齐
- YouTube：预览 `mockups/youtube/y1`、`y2` 定稿，规矩全在记忆 project_virtual_time 末尾两条；另外她同意：右上角搜索（团名/公司名/人名，只搜名册 `idol-groups.ts` + IdolSearch 公司里有的，没有就搜不到），第一次进频道 AI 照名册写好存下，频道能订阅，底栏「订阅」看更新，每周自动刷先照顾订阅的

### 2.28 YouTube（10-27 晚，1042bb1，`lib/idol-youtube.ts`、`components/youtube/youtube-app.tsx`、`styles/youtube.css`）
- kv `idol_youtube_v1`：channels（公司频道 id `co_<公司>`，团/个人频道）、videos（target 播放量，`viewsOf` 本地按 3 天曲线涨；评论数 `cmtCountOf` 本地估）、subs、feedAt、me.handle（她的匿名小号）
- 她的视频：`closeWorldScene` 记账 JSON 多一个 `video`（只有真给公司公开频道拍了才写，画面写名字和站位），`recordSceneVideo` 存进公司频道，上传时间 = 戏的时间 + 2～6 天；`ytTick` 到点记关注度 medium + 通知。没签公司不记
- 首页：`needsFeed` 世界过 7 天自动 `fillFeed` 一次（5～8 条，频道只能是名册里的团或六家公司，可补新团进名册），下拉刷新手动；分类按 kind 筛
- 评论不自动刷：她的视频第一次点开评论补第一批，其余全靠「加载更多评论」；楼中楼「N 条回复」展开、「加载更多回复」；她自己的评论下有「看看有没有人回复」，她说过话的楼一定有人回；认识她的人偶尔用小号评论，`charId` → 粉色「他的小号」
- 搜索 `searchYt`：六家公司（含别名）+ 已有频道 + 名册团名/成员名，没有就搜不到；`openHit` 建频道，`writeChannel` 第一次进 AI 写简介、订阅数、几条旧视频
- 点画面放大（生成图片 / 编辑文字），「…」里看大图、彻底删除；点左上 YouTube logo 退出；底栏 + 提示练习生不能开频道；Shorts 占位
- 测试 `tests/yt1.mjs`
