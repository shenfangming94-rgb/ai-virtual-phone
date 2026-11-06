# TheQoo 接续说明（2026-11-06）

当前基线：CC 提交 `5d83aa4f`。本次论坛工作仍在工作区，未提交、未推送；不要 reset 或覆盖工作区中的 TheQoo 文件。CC 的提交和 `docs/idol/RESUME-2026-11-06.md` 未改。

## 已接上的部分

- TheQoo 离线预览、本地 demo 数据、世界/试玩分离、持久化、点赞、韩文评论中文翻译开关、热门/最新排序、加载更多、同帖新进展、旧评论保留、通知直达原帖，沿用 `lib/theqoo-*` 与 `components/theqoo/`。
- `requestForumDiscussion(source, batchId, generate?, notifyPolicy?)` 是后续剧情节点、日历和其他 App 可调用的统一生成入口。重复事件/批次幂等；切换存档时丢弃迟到结果；写入 IndexedDB 成功后才通知。
- 每篇帖子持久化 `notifiedRevisions`。同一阶段普通评论增长不重复通知；重要新进展使用新 revision 后可再次通知。
- 帖子来源有 `owner` 和 `storyKind`，只向模型传 `publicFacts`，不传整场私人剧情。世界剧情中的公开素材要求由剧情记账提取逐字 `quote`，并校验该句确实在 transcript 中。
- 玩家相关触发已接入：路演照片/视频、公司练习视频实际上传、公开 INS 动态、确有公开证据的日常照片/出圈片段、出道企划、正式名单、正式出道。路演/照片/片段/INS 仅在满足公开素材条件时出现。
- 情缘帖子已接入：MV 女主身份公开、直播双排、画报公开、合作舞台公开、校园庆典目击；前四条情缘帖按需求必通知，练习生合作舞台和校园目击达到热度才通知。
- 地下音乐圈 `scandal_talk` 沿用原节点：打开此场前先生成绯闻帖并发 TheQoo 通知，然后给现有室长发送真实 KakaoTalk 私信并打开「此刻」。节点提示要求公司询问情况，但不替玩家承认交往、不改变关系状态。
- 正式名单公布和正式出道时，会挑一条最早的玩家相关公开旧帖，保留原帖标题/正文/历史评论，只提高 revision 并追加新评论。新进展热度达到门槛时可对该原帖再次通知。

## 主要代码位置

- `lib/theqoo-model.ts`：公开来源、修订比较、帖子状态与防覆盖 reducer。
- `lib/theqoo-store.ts`：IndexedDB 持久化、revision 通知回执。
- `lib/theqoo-events.ts`：AI 生成入口、幂等请求、通知策略和热度判断。
- `lib/theqoo-triggers.ts`：主线/情缘/INS/YouTube 事件适配器与旧帖翻出。
- `lib/idol-world.ts`：公开素材提取、情缘绯闻场景前置、剧情结束后接事件。
- `lib/idol-youtube.ts`：公司练习视频真正上传后才通知论坛。
- `lib/idol-ins.ts`：沿用现有 INS 反应调用判断公开动态是否值得搬运。
- `lib/idol-kakao.ts`、`components/desktop-shell.tsx`：地下音乐圈绯闻后的公司 KKT 消息与通知。
- `docs/idol/RESUME-2026-11-06.md`：CC 的原有接续档，保持未改。

## 需要 CC 接手时留意

- TheQoo 自动剧情发帖使用现有已配置 Chat API；试玩页的 demo 数据不调用 API。没配置或调用失败时不会伪造帖子，但除地下绯闻重试点外还没有持久化重试队列。
- 条件通知暂按 `views >= 5000` 或 `recommendations >= 50` 判热，写在 `lib/theqoo-events.ts` 的 `FORUM_HOT_LIMITS`；需要和实际游戏观察值再调。
- 1 月出道企划帖要求：关注度至少 12、已有玩家公开论坛记录、剧情中出现明确的官方公开企划原句；不会把公司内部宣布误当公开新闻。该主线场景提示已按用户需求加入同场公开公告，并禁止透露候选名单。
- 没有给论坛热帖加关注度奖励，避免 MV/画报/出道等既有奖励重复结算；后续若要加，先为可重复的公开事件做幂等记账并排除已有奖励事件。
- KKT 通知使用当前档案里的室长。若存档尚无 `teacherId`，helper 会跳过 KKT 消息；实机触发前应确保练习生入公司流程已建好室长联系人。
- 浏览器验收覆盖的是 TheQoo UI 和 demo 持久化，不是游戏剧情的真实 AI 事件流；后续可用 mock generator + 测试存档补一轮剧情触发验收，不需要先消耗真实 API。

## 本次检查

- `node_modules/.bin/tsc --noEmit --pretty false`：通过。
- `node /Users/flora/work/theqoo-app-design/verify-forum-v1.cjs`：通过；列表/详情、点赞保存、翻译切换、热度/最新排序、加载更多、同阶段评论、新进展 revision、旧评论未改、重开/刷新/新标签页、试玩/正式数据隔离、搜索/板块、320–430px 无横向溢出、中文字体 11px 均通过。
- 验收报告：`/Users/flora/work/theqoo-app-design/verification-v1.json`。测试过程拦截 API 与外网请求，`apiRequests: 0`、`pageErrors: []`。
- 临时服务器已停止；只停止了本次 3066 端口进程，没有触碰 CC 的 3001 端口。
