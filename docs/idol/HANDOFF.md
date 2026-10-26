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
- 记号：`[给号:名字|ID]` 记下他的 ID（`gaveId`，剧情里提示条留 8 秒）；`[加你:名字|一句话]` 排进 kv `idol_kakao_v1.incoming`，15～115 分钟后进「新的朋友」（`sourcePlace`）
- 她自己的 ID：`myKakaoId()`，通讯录我的名片可改；世界的提示里带上
- KakaoTalk 添加朋友（`chat-message-list.tsx`、`chat-contacts-list.tsx`）：只能搜 ID（不分大小写），候选列表去掉了；搜到薄卡（没有平时）→ `fleshOut` 照模板补全（`completeCard`），可「换一个」；加上 = 直接好友 + 升主要人物 + 灰字写在哪认识 + 他回一句
- 接受申请也升主要人物；在哪认识写进灰字；拒绝了不会再来缠
- 背景人物没给过 ID：名片显示「他还没给你」，通讯录搜索也搜不到 ID
- 发动机：第一天那场结束（或没演过去了）→ 管理老师（在场的老师，没有就 AI 捏）拉群「公司 新人练习生」，在场的同期一起进；节点前 20 小时内老师在群里发通知（AI 用老师口吻）；月考那场结束 → 70% 有一个在场同期来加
- 测试：`docs/idol/tests/kk1.mjs`（按请求内容回假 AI）

---

## 3. 定下来但还没做的（按她的意愿排）

### 她 10-27 新提的（等她点头）
- **点地点出门**：开戏时选地点（公司各房间/宿舍/便利店/汉江/弘大……/自己写），世界按时间、地点、日程决定谁在；每人加「常去的地方」；也能手动拉人
- **大群路人**：群显示人数，路人只有名字+一句身份不捏卡，偶尔冒一句；被点开或加了才转正补卡（宿主群聊现在只认角色卡，要改群聊）

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
- IdolSearch（搜公司、官网、用邮箱投递）——「你去找公司」那条路，最后也走 `signCompany`
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
