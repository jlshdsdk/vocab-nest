# 辨析双方释义

本站原词库 js/data.js 保持原字段与原意不变。relation-lexicon.json 只作为维护用的释义来源；浏览器不加载完整词典，而读取每组的小文件 definitions/gXX.json。

来源优先级：

1. 本站原词库中存在的词，保留其完整释义。
2. 通用英汉释义来自 [ECDICT](https://github.com/skywind3000/ECDICT)，按 MIT 许可引用，许可全文见 ECDICT-LICENSE.txt。
3. 词典未收录的短语、重音拼写和非标准拼写提示在 tools/relation-overrides.json 中明确补充，来源标注 curated。拼写错误不当成真实单词释义。

原下载 CSV 的 SHA256 记录在 relation-lexicon.json 的 source 字段；完整约 66MB 文件不部署。每个生成条目带 source，全部关联词覆盖由 tests/relations.test.cjs 验证。

维护流程：修改原词库后运行 node tools/split-data.cjs。若出现新关联词，先补充有出处的释义，再生成；不要把 note 辨析说明直接塞进词典释义。

重新抽取 ECDICT 数据时运行 node tools/build-relation-lexicon.cjs <已下载的ecdict.csv>，再运行 split-data。生成器拒绝不完整覆盖，不会用“暂无”冒充已补齐。
