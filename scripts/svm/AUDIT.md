# 数据审阅结果

2026-10-08，Node v22.23.1。本地离线重建与独立审阅均通过，来源提交 `4189c501004904a494a35ae438dda761cff2be0c`。

审阅脚本独立读取原始记录并复原其 `excluded`，未调用 `processRecord`。它核对源字节 SHA-256、未处理格原值、降噪说明与显示格、插值端点及数值、亮度估计、白场档位重估和固定曲线逐格关系。

- 16 份记录，共 6,696 格；显示 5,959 格，无数据 737 格。
- 状态统计：`measured` 5,824 格、`lumEstimated` 107 格、`interpolated` 28 格、`noData` 737 格。
- 从源文件 `excluded` 复原 227 个原读数，未新增测量。
- G34 / G124 / G255 共 864 个曲线点，与处理矩阵严格对齐；原始列齐全、按 `headerNits` 升序、未新增灰阶插值。
- 4 个白场亮度档位经过原算法重估，均有 `levelNotes` 与 `levelEstimated:true`。三条曲线共 12 个点继承这些档位标记。
- 135 格当前灰阶亮度经过估计或插值；固定曲线包含其中 16 格。固定曲线的 SVM 有 2 格为原算法插值，均已标记。

独立审阅发现并修正了状态元数据的一处遗漏：23 个黑场或重复读数格在 SVM 插值时也采用插值亮度，原先 `luminanceEstimated` 没有覆盖这种情况。现已标为 `true`；原始记录、降噪后的数值和算法均未改变。

验收命令：

```sh
node scripts/svm/rebuild.mjs
node scripts/svm/audit.mjs
node scripts/svm/rebuild.mjs --check
```

`--check` 对处理文件、索引与来源信息进行逐字比较。本次重建后比较通过。
