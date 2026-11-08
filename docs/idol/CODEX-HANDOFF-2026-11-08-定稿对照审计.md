# 给 Codex：九大系统「定稿对照审计」（2026-11-08）

## 任务

把 11-06 实现的九大系统，逐条对照 Flora 的定稿文档，找出**所有「代码跑得通、但跟定稿不一致」的地方**（做少了、做岔了、漏做的）。只读代码和文档，**不改任何代码、不提交**，输出一份差异清单。

背景：今晚她玩的时候发现「同期支线」没按她定的三入口做（系统自己往日历塞日程）。这类问题测试测不出来，只能逐条对文档。

## 输入（先读，全部是她的定稿，GPT 只整理）

1. `docs/idol/needs/` 六份需求文档
2. `docs/idol/DISCUSSION-2026-11-05-一年养成数值方案.md`
3. `docs/idol/DISCUSSION-2026-11-05-情缘系统.md`
4. `docs/idol/DISCUSSION-2026-11-06-同学录情缘录.md`
5. `docs/idol/RESUME-2026-11-06.md`（九大系统清单 + 实现进度）

## 九大系统 → 实现文件对照

| # | 系统 | 主要实现文件 |
|---|---|---|
| 1 | 年度固定事业主线（14 节点调度 + 出道管道） | `lib/idol-mainline.ts` `lib/idol-career.ts` `lib/idol-debut-pipeline.ts` `lib/idol-debut.ts` |
| 2 | 课堂随机剧情（8 类） | `lib/idol-plots.ts` |
| 3 | 固定课堂文本（55 段）+ 上课管线 | `lib/idol-class-texts.ts` `lib/idol-starroad.ts` |
| 4 | 固定生活剧情（9 + 老师介绍新练习生） | `lib/idol-plots.ts` |
| 5 | 条件特殊生活剧情（6 类）+ 同期人物支线（5 类型） | `lib/idol-plots.ts` `lib/idol-branches.ts` |
| 6 | 随机事业机会（8 类） | `lib/idol-opportunities.ts` |
| 7 | 情缘系统（六线 25 节点） | `lib/idol-romance-lines.ts` `lib/idol-romance-live.ts` `lib/idol-romance.ts` |
| 8 | 一年养成数值系统（数值 + 月评换血） | `lib/idol-training.ts` `lib/idol-roster.ts` `lib/idol-roster-live.ts` `lib/idol-ledger.ts` |
| 9 | 上课大改（主动进公司 + 行动点） | `lib/idol-starroad.ts` `lib/idol-actionpoints.ts` |

另：关注度 `lib/idol-fame.ts`、大群路人 `lib/idol-crowd.ts`、通讯录/名册 `components/contacts/` `components/yearbook/` 也在范围内。

## 输出

写到新文件 `docs/idol/AUDIT-2026-11-08.md`，每个系统一节：

```
## N. 系统名
- 定稿要求：……（引用文档原文要点）
- 实现现状：……（代码里实际怎么做的，标文件行号）
- ✅ 符合 / ⚠️ 偏差：…… / ❌ 没做：……
```

只列**有问题**的条目，没问题的系统写「✅ 全部符合」即可。

## 规矩

1. **只读，不改代码，不 commit**。发现问题写清单，改代码由 Claude 来。
2. 今天已经发现并修好的，**不要重复报**：
   - 支线三入口（KKT/此刻/日历）——今天已改（a09c7578）
   - 课表请假按钮/隐形、入社前课表、A 班资料暂无自愈、颜值特长 A、试镜热度、家人不发动态、同期重名去重、通讯录/档案库/备忘录规则、加练/作业结算、见过即进通讯录、旷课误判、练习生群 39 路人、总结用名字
   - 以上对应规则见 `docs/idol/RESUME-2026-11-06.md` 和今晚的提交（81265d77 之后）。
3. 不确定算不算偏差的，写「疑似」并说明理由。
4. 对照时以**她的文档为准**，代码和文档冲突一律按文档报。
