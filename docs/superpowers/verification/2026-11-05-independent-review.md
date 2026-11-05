# 独立审查与修复

审查基线：2174639bf5568b9f6dc23b1198e1eee041a31807 → 4a98cb47ea32aeac8656da2d35c7951bd5e507d4。

审查为一次全分支只读检查，使用独立上下文；没有子任务复审，也未让审查者改动文件。审查结果：Critical 0，Important 3，Minor 0，Declined to judge 空。原结论为 With fixes，以下为作者逐项验证后的处理。

## 1. 自测离开后返回同组，学习区可能空白

原因：路由切换清空 session，但同一组的 quiz 模式保留，渲染器在无 session 时返回空内容。

修复：无有效会话的 quiz 模式回到卡片。已完成的答题、复习安排、错词状态及日志均已保存，不因切换设置丢失；返回后可重新开始自测。

证据：真实浏览器用例 leaving a quiz for settings then navigating back never leaves an empty study area，修复前失败，修复后通过。

## 2. 少数释义直接包含英文答案

用真实数据核实：g12 prior 的释义含 prior to，g62 saturate 的释义含 saturate。不能直接原样作为拼写题目或选择题选项。

修复：只在自测的展示文本遮蔽词形；原始词条、释义、例句和学习页不修改。选择题遮蔽后重新去重，避免不同原文变成相同选项。

证据：两个实际词条的泄题回归、遮蔽后选项去重用例均经历 RED→GREEN；原对象序列化对比保持不变。

## 3. 后续更新期间可能把新 HTML 配给旧脚本

原因：当前 worker 导航取网络 HTML，但 JS/CSS 命中当前版本 cache；新 worker 尚未安装完成时会跨版本组合。

修复：受当前 worker 控制的导航使用该版本预缓存 HTML，完整新壳安装后才随新 worker 切换。若壳缺失，不把网络 HTML 与残留旧脚本组合，恢复请求绕过旧 HTTP 缓存。新壳预缓存仍强制重新验证 HTTP 资源。

证据：active worker / future deployment 和 missing shell / leftover script 两个缓存模拟用例修复前失败、修复后通过；真实旧 worker 升级、max-age=600、已缓存组离线使用、缺组重试的浏览器回归仍通过。

## 最终回归

node --test --test-reporter=spec tests/*.test.cjs：69 tests，69 pass，0 fail，0 skipped，约 68 秒。修改后的 JS 语法检查与 git diff --check 通过。

没有再次请求审查者确认修复，修复证据为对应失败用例转绿及完整套件转绿。没有遗留 Critical / Important 阻断项，也没有待延期的 Minor。

生产发布尚未执行；真实设备音色和用户自己的配对过程仍需上线后观察。
