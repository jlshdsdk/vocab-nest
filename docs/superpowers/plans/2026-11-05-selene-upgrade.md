# 拾词 · 塞勒涅的月下藏书室 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 用户已确认本会话原生实施、隔离工作区及最终独立审查。实施记录位于本计划对应的 ledger，最终证据另存 verification 文档。

**Goal:** 将拾词升级为移动端优先、月之暗面与古希腊月神意象结合的学习网站，完成兼容旧数据的复习、自测、统计与按组加载。

**Architecture:** 保留纯静态、零构建的原生 JS 页面，以现有 hash 路由和事件委托为基础。将可独立测试的存储、复习算法、统计与词库加载拆为小型浏览器模块，页面编排仍由 `js/app.js` 负责；原词库作为完整兜底保留。新增学习元数据与旧 `{s,t}` 状态隔离，旧进度同步码及按词时间戳合并协议不变。

**Tech Stack:** HTML、原生 CSS/SVG、vanilla JS、Service Worker、localStorage、Web Speech API；开发验证仅使用 Node 22 内置测试和本机浏览器工具，不引入应用框架、构建链或运行时包管理器。

**Spec:** 用户提供的《拾词站-月之暗面升级提示词.md》，加上用户于 2026-11-05 确认的九项文件级方案与 Selene 古希腊月神视觉方向。执行所需的完整约束与验收值已纳入下文；原始本地附件路径不随公开发布。

**Approved visual reference:** 用户确认的 Selene 移动端概念稿；网站只部署独立插画 assets/art/selene-moon.webp，不公开本地参考图路径。示例数字和例词不是用户真实学习数据；网页必须用 HTML/CSS 实现。

## Global Constraints

- 纯静态、零构建、零框架；不引入 React、Vue、Tailwind 或应用包管理器。
- 现有 `vocab-progress-v1`、`vocab-prefs-v1`、`vocab-sync-v1` 键名保留；进度实际记录为 `{s:'hard'|'mastered', t:number}`，不是提示词中的展开字段名。
- 不丢失原词条、进度、同步码、未知但合法的旧进度键、备份、主题偏好；新字段增量保存，旧记录提供默认值，不将默认值伪装成学习历史。
- 主云端协议仍为 `{v:1,words,updatedAt}`，原同步码格式及逐词时间戳取较新的一侧的规则不变。
- 全部词库字段只增不改不删；保留 `js/data.js` 完整兜底，并兼容原脚本的词法全局 `GROUPS` 与 `window.GROUPS`。
- TTS 英美音、例句发音、深浅主题、自动/手动云同步、备份导入导出、PWA 和移动端导航均不可退化。
- 360px 宽全部页面可用；桌面内容居中，最大宽度 1080px；触控主操作至少 44px，输入框至少 16px，保留设备安全区与屏幕键盘空间。
- 深色背景 `#07090f`、卡片 `#0e1320`、月光银 `#c9d4ee`、主文字 `#e8edf8`；生词琥珀、掌握月海青；旧金仅作小面积强调。浅色为月白对应分支。
- 月神 Selene、月牙冠、爱奥尼亚柱式、月轨与少量月桂为统一叙事。装饰集中在首页，学习正文保持清晰；不用霓虹、满屏雕像、高饱和紫蓝和重玻璃拟态。
- Cinzel 用于英文栏目标题；Cormorant Garamond 用于词头及例句斜体；中文正文系统 sans、中文标题可用宋体；IPA 独立字体栈。字体本地 WOFF2、`font-display:swap`、明确 fallback 与尺寸，失败不能挡住内容。
- 普通过渡 120–260ms，翻卡 320ms，达标庆祝最多 1.5s；星点不超过 40，背景呼吸约 60s。`prefers-reduced-motion` 下全部降级。
- 可见焦点、可读 aria 标签、纯键盘学习闭环；正文及功能文字对比度满足 WCAG AA，不将弱装饰色直接用作不可读正文。
- 每日目标默认 20，可设置；三种自测为英→义四选一、义→英拼写、例句挖空；错词连续答对两次才移出重练队列。
- 统计近 12–26 周热力图、连续天数、近 30 天曲线和各组掌握；历史仅显示实际记录，不用当前掌握率推造打卡数据。
- 首屏不再下载完整约 2.8MB 词库；分组 JSON 与全字段搜索索引独立按需加载；弱网有骨架、错误和重试状态，不白屏。
- `sw.js` 必须更新缓存版本；同源其他项目的缓存不应被删除；同步 API 不缓存；非导航请求失败不能返回 HTML 假装 JSON。
- 实测移动端 Lighthouse Performance ≥85 且不低于基线，Accessibility ≥95；没有运行或没有达到就明确报告，不捏造分数。
- GitHub 网络全程直连，不用代理和镜像；不修改 Codex 配置或认证文件，不暴露密钥。位图由 remote-imagegen 生成，默认 `gpt-image-2.5-sunburst`；遇 5xx/503 不重复发起生成。

## Verified Baseline / Workspace Safety

- 原工作区：本地 vocab-nest 普通仓库，分支 main；绝对用户目录不写入公开发布记录。
- 本地 HEAD：`f9ec93056559cd798c406d00b8b24f1483274b4b`；2026-11-05 核验远端 main：`2174639bf5568b9f6dc23b1198e1eee041a31807`，远端领先 2 个提交。
- GitHub Pages 从 `main:/` 发布，核验时状态 `built`。
- 唯一既有未跟踪文件 `_deploy4.ps1`，SHA256 `9D8877190F83A076032B6F7D960488DEF99181802D94A4620A3623F546C7AEA1`；不编辑、不删除、不自动执行、不纳入提交。
- `node --check js/app.js` 与 `node --check sw.js` 已通过；无既有自动化测试套件，不能将语法检查声称为功能测试。
- Node 为 v22.14.0；词库读取校验为 134 组、2679 词，首尾组 `g01` / `g134`。
- 已在独立浏览器会话复现 360px 首页问题：hero 宽 309px，双栏为 99px / 155px，标题容器仅 99px，导致近乎一字一行。问题来源是窄屏仍使用双栏且右栏固定最小宽度，不是靠整体缩小文字修复。

## Review Focus

**User addition, 2026-11-05:** 每个词条的近形词/近义词辨析支持独立收藏，生词本同时展示生词、近形辨析、近义辨析。收藏保存源词、关联词、类型、辨析说明与组信息；同一关联词来自不同源词时不合并丢上下文。收藏取消用带时间戳的 inactive 记录，避免同步后复活；纳入完整备份与新增元数据同步。此追加项随 Task 1 / Task 5 / Task 6 实施与验证。

1. 老用户没有新字段、词库尚未加载、旧客户端再次同步：原 `{s,t}` 和同步码必须原样可用，新增日志不可被旧端洗掉。归属 Task 1、Task 2。
2. 弱网分组失败、离线缺组、升级中 HTML/脚本/清单版本不一致：提供可恢复状态，禁止旧响应覆盖新路由，禁止 JSON 得到 HTML。归属 Task 2、Task 7。
3. 360px 长单词、IPA、中文输入法、屏幕键盘、深浅色：可读可操作、不横溢、不误触翻卡、提交按钮不被遮挡。归属 Task 3、Task 4、Task 7。
4. 同组释义重复、词数不足、无匹配例句、连续错题：不出重复选项或泄露答案，不产生空题或错误移除重练项。归属 Task 4。
5. 午夜切日、重复点击评分、重复导入/同步日志、浏览记录但未答题：按本地日历真实计数，streak 和目标不重复膨胀，刷新不丢。归属 Task 1、Task 5。

## File Ownership / Module Boundaries

| File | Responsibility |
| --- | --- |
| `js/storage.js` | 旧进度/偏好兼容、新学习元数据与日志、备份及合并纯函数 |
| `js/learning.js` | 复习调度、题目构造、答案比较、持久化错题队列的纯算法 |
| `js/stats.js` | 本地日历、唯一词学习计数、连续天数、热力图与月相辅助 |
| `js/data-loader.js` | 清单、分组、搜索索引的异步读取、去重缓存与完整词库兜底 |
| `js/app.js` | 路由、页面渲染、事件、TTS、原云同步及学习会话编排 |
| `index.html`, `css/style.css`, `css/fonts.css` | 首屏骨架、导航、响应式与双主题、字体层级和可访问性 |
| `assets/art/`, `assets/fonts/` | 压缩月神插画和有许可证的本地字体，不存 API 响应或密钥 |
| `tools/split-data.cjs`, `data/` | 由原词库机械生成版本清单、分组与独立搜索索引，无部署构建步骤 |
| `sw.js`, `manifest.webmanifest`, `icons/` | 一致的 PWA 元信息、版本缓存、离线与更新流程 |
| `tests/*.test.cjs`, `tools/browser-smoke.ps1` | Node 内置算法/兼容测试与本机浏览器验证，不依赖框架 |

## Task 1: Compatible state and metadata persistence

**Files:** Create `js/storage.js`, `tests/storage.test.cjs`; modify `js/app.js` persistence adapters and `index.html` script loading.

**Interfaces:**
- Browser global `VocabStorage`; same pure exports available to Node tests through guarded CommonJS export.
- `normalizeProgress(raw) -> ProgressMap`; preserve valid `gid:word` records and `{s,t}` semantics without requiring the full dictionary.
- `defaultReview(record, now) -> {ease,interval,due,repetitions,lastReviewed}`; defaults do not create activity.
- `mergeProgress(local, remote) -> ProgressMap` keeps newer `t`, with local winning equal timestamps as before.
- `mergeActivity(localEvents, remoteEvents) -> ActivityEvent[]` deduplicates immutable event IDs.
- `readState(storage) -> {progress,prefs,sync,learning,activity}`; new keys `vocab-learning-v1` and `vocab-activity-v1` are separate from old state.
- Learning shape is `{review:{[wordKey]:ReviewRecord},wrongQueue:{[wordKey]:{streak,updatedAt}},comparisons:{[comparisonKey]:Comparison},resume:{gid,idx,updatedAt}|null}`. Each review record additionally has `updatedAt`; activity events are `{id,key,at,kind:'study'|'review'|'quiz',correct:boolean|null}`. A Comparison is `{gid,sourceWord,kind:'confusable'|'synonym',word,note,active,updatedAt}`; `comparisonKey` is the JSON-encoded `[gid,sourceWord,kind,word]` tuple. Expose `comparisonKey`, `normalizeComparisons`, and `mergeLearning` for tested context-preserving LWW merges.
- `parseBackup(text) -> {progress,learning,activity}` accepts legacy bare progress and legacy `{v:1,words}` as well as the additive full backup; import is a merge, not replacement.

- [ ] Step 1: Write failing tests for keeping `{'g01:perceive':{s:'hard',t:1700000000000}}` unchanged, preserving a valid unloaded group, ignoring malformed input without prototype pollution, LWW conflict resolution, no migration activity, and repeated activity merge idempotence. Assert old sync code and preferences remain byte-for-byte equivalent after a load/save round trip.

```js
assert.deepEqual(normalizeProgress({'g01:perceive':{s:'hard',t:1700000000000}}), {'g01:perceive':{s:'hard',t:1700000000000}});
assert.deepEqual(mergeProgress({'g01:x':{s:'hard',t:2}}, {'g01:x':{s:'mastered',t:1}}), {'g01:x':{s:'hard',t:2}});
assert.equal(mergeActivity([event], [event]).length, 1); // event is one valid immutable fixture
assert.equal(readState(legacyStorageFixture).activity.length, 0);
```

- [ ] Step 2: Run `node --test tests/storage.test.cjs`; confirm failure is the missing module/export, not an unavailable runtime.
- [ ] Step 3: Implement the interfaces and adapters. Keep primary cloud payload and code format unchanged. Store new metadata separately; expose full backup including new state, while still importing old backups. Never serialize sync secrets to test output or screenshots.
- [ ] Step 4: Run the tests and legacy JSON fixture round trips. Test quota/storage exceptions and malformed new-state JSON: old progress still loads and an actionable warning appears.
- [ ] Step 5: Commit only Task 1 files after tests pass, excluding `_deploy4.ps1` and generated API response JSON.

## Task 2: Versioned lazy dictionary and safe async routing

**Files:** Create `tools/split-data.cjs`, `js/data-loader.js`, `tests/data-loader.test.cjs`, generated `data/manifest.json`, `data/groups/*.json`, `data/search-index.json`; modify initialization in `js/app.js`, `index.html`, and add the nonbreaking `window.GROUPS` fallback exposure to `js/data.js`.

**Interfaces:**
- `VocabData.loadManifest() -> Promise<Manifest>` where manifest has `version`, `totalWords`, and groups `{id,name,note,count,words:[wordString],preview,file}`.
- `VocabData.loadGroup(gid) -> Promise<Group>` returns original word objects with every field unchanged; concurrent requests share one in-flight fetch.
- `VocabData.loadSearchIndex() -> Promise<SearchEntry[]>` deferred until searching; each entry has `gid,word,definition,text` covering word, definition, examples, usage, comparisons, collocations and mnemonic.
- `VocabData.useLegacy(groups)` accepts the existing complete dictionary; fallback failure is explicit, not a blank screen.
- App uses a monotonic route token; a resolved async load may render only if its token still matches the active route.

- [ ] Step 1: Write failing tests for canonical JSON deep equality of every generated word, stable group IDs, missing chunk errors, in-flight deduplication, cache retry after rejection, legacy lexical/global fallback, and late group response after navigating home.

```js
assert.deepEqual(generatedGroup, canonicalGroup); // one fixture per original group
assert.equal(manifest.groups.length, 134);
assert.equal(manifest.totalWords, 2679);
await assert.rejects(data.loadGroup('missing-group'));
assert.equal(groupFetchCountAfterConcurrentLoads, 1);
assert.equal(activeRouteAfterLateResponse, '#/');
```

- [ ] Step 2: Run `node --test tests/data-loader.test.cjs`; confirm intended failure.
- [ ] Step 3: Implement generator and loader. Use Node built-ins and canonical `js/data.js` as source. Mechanical JSON generation is a maintenance command, not a runtime build requirement. Do not evaluate the 2.8MB dictionary during normal startup. Initialize the app before indexing words so failed data cannot throw before the error guard. Adapt homepage counts/group percentages to manifest word keys, group routes to loaded full groups, and notebook to loading only groups referenced by hard records. Keep the existing word/definition search working through the deferred index before adding Task 6 highlighting; no intermediate release may show empty existing progress merely because words are not loaded.
- [ ] Step 4: Run generator and tests. Assert manifest `134` groups / `2679` words on this baseline, source fields deep-equal, no group missing; verify homepage network never requests `js/data.js` or search index in the healthy path. Compare transferred startup bytes with baseline.
- [ ] Step 5: Commit generator, loader, generated data, fixture tests and affected startup files together.

## Task 3: Selene design system and usable mobile shell

**Files:** Modify `index.html`, `css/style.css`, `js/app.js` shell/home/card views; create `css/fonts.css`, licensed `assets/fonts/*`, `assets/art/selene-moon.webp`, `tests/ui-contract.test.cjs`; update PWA art only as needed.

**Interfaces:**
- Root tokens keep existing `--c-*` compatibility while adding display/word/example/IPA font roles and a three-step reading-size preference.
- Navigation: `#/` groups, `#/today` daily review, `#/review` existing notebook, `#/stats` statistics; settings stays accessible in the header. Existing group URLs remain valid.
- `renderHome(manifest,state)` uses real group metadata, real resume position and real counts; missing history never selects an invented last session.
- Learning actions reserve safe bottom space above global navigation, and typing/reading never triggers incidental swipes.

- [ ] Step 1: Capture baseline 360px home and learning view; write a failing layout contract for mobile single-column hero, minimum 44px actions, font roles, reduced motion, semantic controls and all existing route links. Record current hero title width 99px as the reproduction, not an acceptable layout.

```js
assert.ok(mobile360.scrollWidth <= mobile360.innerWidth);
assert.ok(mobile360.heroTitleWidth >= 240);
assert.ok(mobile360.minimumPrimaryTargetHeight >= 44);
assert.equal(reducedMotion.activeAnimations, 0);
assert.equal(legacyRoutes.every(route => route.hasUsableView), true);
```

- [ ] Step 2: Run `node --test tests/ui-contract.test.cjs`; verify intended contract failures. Start an isolated browser without any real sync credentials.
- [ ] Step 3: Implement the complete dark/month-white shell, restrained lunar geometry, Selene home art, Cinzel labels and Cormorant word/italic roles. Use local licensed WOFF2 with swap and stable fallbacks. Generate the artwork through the configured remote-imagegen runner using the approved image as reference, once; inspect it, optimize to WebP, and keep source image outside deployed assets. If generation returns 5xx/503, report the original error and do not repeat the request.
- [ ] Step 4: Verify 360/390/430px and desktop up to the 1080px content cap, long headwords and IPA, light/dark, 200% text zoom, keyboard focus and reduced motion. Ensure art failure leaves layout and functions intact; only visible font weights load. Check screenshots visually, not just DOM width.
- [ ] Step 5: Commit shell/style/font/art changes with source/license notes, not a screenshot pretending to be working UI.

## Task 4: P0 spaced review, three quizzes and wrong-answer loop

**Files:** Create `js/learning.js`, `tests/learning.test.cjs`; modify `js/app.js`, `css/style.css`, `index.html`.

**Interfaces:**
- `VocabLearning.schedule(previous, grade, now) -> ReviewRecord`, `grade` is `known|fuzzy|forgot`; default ease 2.5, minimum ease 1.3. Known keeps ease and schedules 1 day, 6 days, then `round(previous.interval * ease)` days; fuzzy interval is `max(0.5, previous.interval * 0.5)` days, ease -0.15; forgot resets repetitions and interval, ease -0.2, and schedules 10 minutes later. All due timestamps are integer milliseconds. These exact intervals are implementation defaults, not claims that the user specified these numbers.
- `VocabLearning.todayQueue(manifest, progress, learning, now) -> WordKey[]` deduplicates due words and notebook words; newly marked hard words appear, and a completed non-due word is not endlessly re-added during the same session.
- `VocabLearning.normalizeAnswer(text) -> string` normalizes case, outer whitespace and Unicode hyphens without blanket removal of meaningful letters.
- `VocabLearning.makeQuestion(type, word, pool, rng) -> Question|null` supports `choice|spelling|cloze`; choice has four distinct valid meanings, cloze uses an escaped whole-target match and does not expose the answer in the visible prompt.
- `VocabLearning.compareAnswer(input, expected) -> {correct,letters}` supplies per-letter feedback; hyphen/case variants such as `COOPERATE` versus `co-operate` pass.
- `VocabLearning.updateWrongQueue(queue, key, correct) -> Queue` resets on wrong and removes only after two consecutive correct answers, across refreshes.

- [ ] Step 1: Write failing deterministic tests for interval values and due arithmetic; default old records; queue uniqueness; two-correct removal and reset after an intervening wrong; duplicate definitions and small pools; absent/mismatching examples; regex-special headwords; case/hyphen tolerance and wrong-letter highlighting. Test double submit changes scheduling and activity once only.

```js
assert.equal(schedule(null, 'known', now).interval, 1);
assert.equal(schedule(null, 'fuzzy', now).due, now + 12 * 60 * 60 * 1000);
assert.equal(schedule(null, 'forgot', now).due, now + 10 * 60 * 1000);
assert.equal(normalizeAnswer('COOPERATE'), normalizeAnswer('co-operate'));
assert.ok(wrongQueueAfterOneCorrect[key]);
assert.equal(wrongQueueAfterTwoConsecutiveCorrect[key], undefined);
assert.equal(new Set(choice.options.map(option => option.label)).size, 4);
```

- [ ] Step 2: Run `node --test tests/learning.test.cjs`; confirm intended failure.
- [ ] Step 3: Implement pure algorithms, then connect real sessions and persistence. If a requested quiz type cannot form a valid question, use another enabled valid type with a clear fallback, never invent definitions/examples. Require at least one quiz type enabled. Keep self-rating, objective quiz feedback and manual mastery status conceptually separate.
- [ ] Step 4: Verify mobile touch and keyboard flows: space flip/next, arrows switch, 1/2/3 self-rating, S speech, Esc back; choice digits operate only the visible choice question. Inputs, editable content, composing text, native button activation and browser modifier shortcuts must not be hijacked. In spelling/cloze, question, title and accessible labels must not reveal the target before grading.
- [ ] Step 5: Run storage + data + learning + UI tests and commit the P0 deliverable. Capture a real mobile example of all three question types and the wrong-answer completion loop.

## Task 5: P1 real statistics, goals, moon progress and notebook

**Files:** Create `js/stats.js`, `tests/stats.test.cjs`; modify `js/app.js`, `css/style.css` and full backup adapters.

**Interfaces:**
- `VocabStats.dayKey(timestamp) -> YYYY-MM-DD` follows the device's local calendar, not UTC slicing.
- `VocabStats.recordActivity(events,event) -> Events` counts completed study interactions, not merely visiting a card, with immutable IDs and unique word/day counting for daily word goals.
- `VocabStats.summarize(events, now, goal) -> {todayWords,streak,last30,heatmap,goalReached}` gives a 26-week heatmap and 30 local-calendar days. Repeated merges/imports do not add duplicate events.
- `VocabStats.moonPhase(mastered,total) -> {ratio,label,path}` maps 0% to new moon and 100% to full moon, with an accessible percentage independent of SVG appearance.
- Notebook selection supports group/time filters, sorting, CSV/JSON export; bulk action is explicitly labelled “标记掌握并移出生词本” so the existing `hard/mastered` sync protocol stays meaningful rather than inventing incompatible deletion states.
- Each relation in a word card has a 44px favorite button with an accessible name including source/related word. Notebook categories “生词 / 近形辨析 / 近义辨析” display saved contexts, TTS, source-word link and cancellation; filters, exports and auxiliary sync include these entries. Test two source words sharing one related word, both relation types, reload, backup, cancellation and older-cloud merge without resurrection.

- [ ] Step 1: Write failing tests for local midnight, missing yesterday, current streak including yesterday when today has not started, one word studied repeatedly, same event imported twice, no fabricated migration history, default goal 20, one celebration per day and goal attainment, and moon endpoints/intermediate ratios. Test CSV quoting, UTF-8/BOM and spreadsheet-formula safety for user-supplied text.

```js
assert.equal(summarize([], now, 20).todayWords, 0);
assert.equal(summarize(twoEventsForSameWordToday, now, 20).todayWords, 1);
assert.equal(summarize(twentyUniqueWordsToday, now, 20).goalReached, true);
assert.equal(moonPhase(0, 20).ratio, 0);
assert.equal(moonPhase(20, 20).ratio, 1);
assert.equal(moonPhase(10, 20).ratio, 0.5);
```

- [ ] Step 2: Run `node --test tests/stats.test.cjs`; confirm intended failure.
- [ ] Step 3: Implement stats views, real event logging, subtle ≤1.5s celebration, per-group moons and notebook controls. Use native accessible SVG, no chart library. Preserve manual note/mastery controls and make bulk actions explicit with a preview/confirmation.
- [ ] Step 4: Verify a fresh profile shows truthful empty statistics; a legacy profile retains marks and states that detailed activity starts with the upgrade. Complete activity, reload, import and merge twice: counts and goals remain correct. Heatmap may scroll inside its own region at 360px, never widen the whole page.
- [ ] Step 5: Run combined unit tests and commit the P1 deliverable with mobile screenshots of stats, goal and notebook filtering.

## Task 6: P2 search, preferences, metadata synchronization and polish

**Files:** Modify `js/app.js`, `js/storage.js`, `js/data-loader.js`, `css/style.css`, `css/fonts.css`; extend storage/loader/UI tests.

**Interfaces:**
- Search uses the deferred full-field index, safely escaped highlighted snippets, an input generation token and composition-end handling; late responses never restore an older query.
- Settings persist `prefs.fontSize:'small'|'medium'|'large'` (default `medium`), `prefs.englishFont:'serif'|'sans'` (default `serif`), `prefs.dailyGoal` (default 20) and `prefs.quizTypes` (default all three type names) without resetting theme or sync code. Daily goal must be a positive safe integer, and quiz types must retain at least one valid enabled entry.
- New metadata sync is separate from the unchanged primary progress KV: `metadataKey(code) -> Promise<string>` derives a bounded-length key using SHA-256 so all valid original 6–60-character codes still work; a separate versioned metadata payload merges review records by record timestamp and immutable activity by event ID. Failure must not block original progress sync or local use.
- Sync writes serialize a captured state revision and reschedule if local edits occur during a write; a successful old snapshot must not silently drop a newer local mark.

- [ ] Step 1: Add failing tests for Chinese full-field search, escaped HTML, rapid query/navigation changes, IME composition, all quiz switches off, preference preservation, 60-character code auxiliary key length, old clients rewriting primary KV without touching auxiliary data, repeated metadata import and an edit during an in-flight push.

```js
assert.ok((await metadataKey('a'.repeat(60))).length <= 60);
assert.match(await metadataKey('vocab-testcode'), /^[A-Za-z0-9_-]{6,60}$/);
assert.equal(searchFixture('察觉').some(hit => hit.word === 'perceive'), true);
assert.equal(settingsRoundTrip.theme, originalPrefs.theme);
assert.ok(settingsRoundTrip.quizTypes.length >= 1);
assert.equal(storedLatestProgressAfterInFlightEdit['g01:x'].t, newestEditTime);
```

- [ ] Step 2: Run affected test files and confirm intended failures.
- [ ] Step 3: Implement search/preferences, narrowly extend sync orchestration without changing original progress LWW behavior, and add the 320ms flip plus restrained lunar transitions. Auxiliary metadata is clearly additive; do not migrate away from or delete the original cloud key.
- [ ] Step 4: Verify two isolated browser profiles with disposable test data and a test-only mocked fetch; do not use or print a real user's sync code. Verify non-English input, speech calls made synchronously from a user gesture, font failure, reduced motion changes and offline editing followed by reconnect.
- [ ] Step 5: Run the full suite and commit the P2 deliverable.

## Task 7: PWA migration, full verification and release

**Files:** Modify `sw.js`, `manifest.webmanifest`, `README.md`; create `tests/sw.test.cjs`, `tools/browser-smoke.ps1` and `docs/superpowers/verification/2026-11-05-selene-upgrade.md` with measured evidence.

**Interfaces:**
- Cache names share an app-specific `vocab-nest-` prefix and a new release version. Activation deletes only obsolete caches in this app namespace.
- Precache only the coherent app shell and manifest; dictionary chunks, search index, art and fonts cache on successful use. Never eagerly cache full legacy `data.js` on a healthy initial visit.
- Navigation failure may use cached HTML; missing JSON/fonts/images return an honest error/fallback, not HTML. Same-origin GET only; external sync API remains untouched.
- Updates must not force reload in the middle of an answer. A ready update is applied at a safe navigation/reopen point; old shell still has compatible legacy assets during transition.

- [ ] Step 1: Write failing tests for app-only cache cleanup, failed critical precache retaining the previous usable worker, cross-origin exclusion, JSON failure content, legacy-to-new first visit and coherent offline shell/chunk retrieval. Record original Lighthouse baseline before production changes if the tool is available.

```js
assert.equal(cacheFixture.otherProjectCacheDeleted, false);
assert.equal(fetchFixture.externalSyncRequestIntercepted, false);
assert.notEqual(fetchFixture.failedGroupResponseType, 'text/html');
assert.equal(fetchFixture.eagerFullDictionaryRequests, 0);
assert.equal(legacyUpgradeFixture.hasUsableView, true);
```

- [ ] Step 2: Run `node --test tests/sw.test.cjs`; confirm intended failure.
- [ ] Step 3: Implement versioned caching and PWA metadata consistent with moon-black/month-white themes, icons and the actual static subpath `/vocab-nest/`. Document source-data maintenance and full backup behavior.
- [ ] Step 4: Run all tests with `node --test tests/storage.test.cjs tests/data-loader.test.cjs tests/ui-contract.test.cjs tests/learning.test.cjs tests/stats.test.cjs tests/sw.test.cjs`; run `node --check` for every modified JS file. Expected: zero failures, no syntax errors. Exercise every route and all requested controls at 360/390/430px and desktop, online/offline, old/fresh profiles and light/dark/reduced-motion. Inspect screenshots and browser error logs.
- [ ] Step 5: Run measured Lighthouse mobile checks: Performance ≥85 and ≥baseline, Accessibility ≥95. Record actual scores, tool/version, URL, transferred bytes, loaded font/art bytes and limitations. Do not mark a skipped check as passed. Obtain a whole-branch independent review using the chosen execution workflow, resolve actionable findings, then re-run affected verification.
- [ ] Step 6: Verify remote main has not advanced before integration; do not force-push or overwrite unrelated work. Integrate and publish only the approved task scope through the normal Pages branch, then verify deployed files/version, successful Pages state and a live mobile smoke test. Keep `_deploy4.ps1` untouched and leave a clear rollback commit reference.

## Execution Checkpoint

- Design and file-level scope: **user confirmed**.
- Detailed plan and execution method: **user confirmed**.
- Worktree: `.worktrees/selene-upgrade`, branch `codex/selene-upgrade`, created from the verified remote main.
- Method: native implementation in this chat, isolated worktree, one fresh whole-branch reviewer at the end.
- Production deployment remains a separate integration checkpoint; no shared-branch push or publish occurs during local development.


