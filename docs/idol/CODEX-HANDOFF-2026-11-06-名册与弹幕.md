# 给 Codex 的交接：名册 app + 同期资料生成 + 通讯录同期页 + 直播弹幕浮窗（2026-11-06）

> 设计都是 Flora 定的。先读：`docs/idol/DISCUSSION-2026-11-06-同学录情缘录.md`（内容定稿 + 她的拍板）。
> 视觉稿（定稿，照着做，别自己改风格）：`previews/yearbook/v6-card.html`（同学录）、`previews/yearbook/romance-v2.html`（情缘录 + 入口书架）。对应截图同目录 .png。
> 测试先别跑大套的网页测试（她说烧额度），`node_modules/.bin/tsc --noEmit` 过 + 自己写的小测试就行。

## 工作区现状（重要）

- 分支 `idol`，HEAD `5d83aa4f`，**一个 commit 都还没推**。
- 工作区里有三拨没提交的改动，**别 reset、别 checkout、别混着提交**：
  1. 你自己的 TheQoo 论坛（app/forum-preview、components/theqoo、lib/theqoo-*、public/theqoo、styles/theqoo.css 及 desktop-shell/idol-world/idol-kakao/idol-ins/idol-youtube/story-app-base 等接线）。
  2. Claude 11-06 改的情缘/剧情触发（lib/idol-romance-live.ts、idol-romance-lines.ts、idol-stage.ts、idol-plots.ts、idol-starroad.ts、idol-calendar.ts、idol-ins.ts、idol-places.ts、idol-career.ts、idol-roster-live.ts、idol-reminders.ts、active-call.ts、components/vn/vn-player.tsx）。
  3. 你这次的新东西。
- 有几个文件两拨人都动过（idol-ins.ts、idol-world.ts、desktop-shell.tsx、idol-kakao.ts），改之前先看当前内容。提交的事等 Flora 说，届时分开提交。

---

## 一、名册 app（同学录 + 情缘录，一个 app）

**app 名字：名册**。桌面加一个图标（参照现有 idol app 的注册方式：lib/desktop-config.ts、components/icon-glyph.tsx、desktop-shell 的 app 路由）。新档（kv `idol_roster_v1` 存在）才有内容；旧档进来显示空状态即可。

### 入口
一打开是两本书并排：黑色 CLASSMATES（同学录）、粉色 LOVE RECORD（情缘录），点哪本进哪本（romance-v2.html 第一屏）。

### 同学录（黑白，v6-card.html）
- 封面 → 目录（一页 12 人，分页；顶部 All / Class A / B / C / D 筛选）→ 个人页。
- 目录卡：照片（人物头像 `loadCharacters()[].avatar`，没有就灰框）、中文名、英文名（没有就省略这一行）、`班级 · 特长`。
  - 她的室友：照片角上 ROOMMATE 小标签。室友 = `loadCareer().roommates`（charId 数组）。**只有室友标，别人不显示宿舍号。**
  - 退社的（`profile.leave.phase === "left"`）：整张变淡 + WITHDRAWN 章，仍保留页。
- 个人页从上到下：
  1. **STUDENT CARD**：照片（室友盖 ROOM MATE 圆章）+ 下划线字段两列：NAME / AGE+BIRTH / FROM(国籍)+HEIGHT / CLASS+MAJOR(特长) / MBTI+ENTRY(入社年月 = career.signedAt)。
  2. **ABILITY 属性**：八项两列，写数字 + 细线条长度；特长那项前面 ✦。数据：名册 `idol_roster_v1` 里 `npcs[].stats`（按 `charId` 找）。**每次打开都读最新值**（NPC 每周结算一次）。八项中文：声乐/舞蹈/说唱/形象/演技/综艺/作曲/语言。不放她自己的对比数（她说不要）。
  3. **PROFILE 档案**：表格式（她选的 A 方案）：左列英文小标签 LOOKS / NATURE / FAMILY / TMI，右列内容，细线分隔。数据见第二节。
  4. **RECORDS 月考**：每月一行：月份 / 事件（入社·C 班、升入 B 班…）/ 名次。数据：`lib/idol-ledger.ts` 的 `months[].rows`（按人找 rank、group、change）。
  5. **BETWEEN US 我们**：十档圆点（`RELATIONS`，lib/idol-people.ts）+ 当前档位中文；下面列关系事件 = `profile.events`（只记客观事，日期 + 一句）。
  6. **HER CIRCLE**：她在同期里的好朋友 / 朋友 / 熟人 = 名册 `npcs[].friends`（tier）。
  7. **STORIES**：和她有关的同期支线 = `branchesState().branches.filter(b => b.charId === id)`，日期 + 一句 + Open/Closed（active）。
  8. **MY NOTE 我的印象**：横线纸，**只有 Flora 自己写**，系统永远不写、不提炼、不代写，空着就空着。存 `profile.note`（现成字段，"只有她看得到"）。
- 没有她自己的一页。

### 情缘录（粉色，romance-v2.html）
- 封面 → SIX FATES 页（两列三排六个位置）→ 他的页。
- 数据：`romanceState().lines`（lib/idol-romance-live.ts），六条线 `ROUTE_TYPES`，节点定义 `ROUTE_NODES`（lib/idol-romance-lines.ts）。
- **没关注的线**：虚线空框 + ?，写 NOT YET，**不显示类型**。
- **已关注**：照片下小椭圆写线的英文名 IDOL / UNDERGROUND / ESPORTS / HEIR / TRAINEE / CAMPUS，下面名字 + BOND 数字。
- 他的页：
  1. **FATE CARD**：NAME / AGE+BIRTH / FROM+HEIGHT / MBTI+MET（认识那天 = `profile.metAt.at`，**不要关注那天**）/ LINE+BOND。底部 `PROFILE →` 跳他的通讯录页。外貌性格不在这里放。
  2. **BETWEEN US**：十档圆点（同同学录，粉色版）。
  3. **CHAPTERS**：罗马数字 I II III…，**按这条线 `ROUTE_NODES[type]` 的长度排**（以后会加节点，别写死 4/5）。走过的（`line.doneNodes`）写节点标题 + 日期（career.nodes 里 note=`情缘节点：key` 的那条的 dueAt/doneAt），没走到的写 `? ? ?`。
  4. **BOND**：最近几次加分 = `line.history`（meet +5 / call +3 / kkt +1，中文写 见面 / 电话 / KKT 聊天）。**只显示当前数字，不显示门槛。**
- 没有「我的印象」。

---

## 二、同期资料生成（39 人现在只有名字、年龄、生日）

现在 `lib/idol-roster-live.ts` 的 `ensureRoster()` 建档时只填了 name/age/birthday/role/group。要补：**每个新档签约生成名册时，游戏自己调 AI 把 39 人资料写全**（用游戏里已配置的 Chat API，同 idol-people 的写卡调用方式）。

- 要写的字段（写进 IdolProfile）：`nationality`、`heightCm`、`appearance`（外貌）、`privateLines`（性格与相处）、`familyBackground`（家庭）、TMI（新加字段 `tmi?: string[]`，每人 1～2 条**只属于她的**小细节）、`mbti`、`speech`。
- **骨架先由代码定，AI 照骨架写血肉**：特长、态度（attitude）、初始班级、朋友圈都已在名册里，作为输入给 AI，让性格/TMI 跟这些对得上（例：态度 lazy 的人别写成拼命三娘）。
- **分四批，按班生成**（A/B/C/D 各一批），每批明令「不许重复模板、不许用同一个句式开头、每人 TMI 必须不同」。规矩沿用 `lib/idol-people.ts` 的 `CARD_RULES`，再加一段批量同期专属规矩。
- 国籍：以韩国为主，少量外籍（日本/中国/泰国/美国等），比例自然。
- **MBTI 只给 Flora 看**：生成一次存起来，**写人物提示词时不喂给 AI**（检查 `composePersona` 等拼人设的地方，同期练习生的 mbti 别拼进去）。
- 生成失败不阻塞游戏：名册照常可用，资料空着，下次再补（记一个「哪些人还没补」的列表，后台慢慢补）。

## 三、通讯录里的同期

- 通讯录（`components/contacts/contacts-app.tsx`）点开**同期练习生**（`profile.group === "同期练习生"`）→ 显示名册里她那一页（同学录个人页），不再用旧的名片模板。
- **其他人物（前辈、公司、家人、情缘男主等）一律不变。**
- 情缘的「关注」按钮还在通讯录人物页上（Claude 已做），别动。

## 四、直播双排的弹幕浮窗

- 场景：情缘电竞线最后一个节点「直播双排」（career node `note === "情缘节点：stream_duo"`），在「此刻」里演。
- 需求（Flora 的设计）：此刻画面上叠一个**直播浮窗**，弹幕在里面飘：观众震惊、起哄、猜她是谁、猜是不是在交往。
- 建议做法：
  - 只在这一场（`stageScene.nodeId` 对应的节点 note 是上面那个）显示浮窗。
  - 弹幕内容跟着剧情走：AI 每段回复末尾可以多写一个记号 `[弹幕:一句|一句|一句]`（参照 `lib/idol-world.ts` 里 `[新人:]` `[时间:]` 那套记号的写法：在这一场的 prompt 规矩里加说明、在 `extractSceneTags` 摘掉不显示在正文里），前端把这些句子做成从右往左飘的弹幕。
  - 浮窗样式：小窗（像直播画面右上角/下方一块半透明区域），可最小化；不挡对话框和输入。
  - 场景结束浮窗就没了；重播这一场时弹幕跟着重播。
- 韩国观众的弹幕用韩语 + 中文翻译（同项目里「说话语言」规矩：`IDOL_LANGUAGE_RULE`）。

---

## 验收（自己做，别让 Flora 边玩边找 bug）

- tsc 通过。
- 名册：用测试存档（参照 docs/idol/tests/*.mjs 的 kvPut 种子造一个新档）截图：书架、同学录目录、个人页、情缘录六格、他的页。手机宽 390～430 不横向溢出。截图放 `previews/yearbook/`。
- 资料生成：可以 mock 掉 LLM 测流程，不要真烧 API。
- 截图先给 Flora 看，她说可以才算完。
