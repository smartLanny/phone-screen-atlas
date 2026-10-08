# 频闪数据

本目录保存 `smartLanny/svm-full-range-visualizer` 分支 `claude/brave-archimedes-bd546k` 的 17 份原始记录与默认降噪显示结果。固定来源提交：`48bf54c6d52a20179e5471d63e18717d8602c934`。完整归因、模块校验值与处理方式见 `source.json`，许可原文见 `LICENSE`（MIT）。Mate 90 原始表格范围、导出 SHA-256 和缺测数量也记录在 `source.json`。

## 文件入口

- `index.json`：`{schemaVersion, fixedGrayKeys, sourceFile, records}`，`records` 保持原 manifest 次序；每条含 `device`、`mode`、`id`、`rawFile`、`processedFile`、`displayedDataPoints` 等。`displayedDataPoints` 按处理后矩阵的 G255 `headerNits` 轴计算 `0–500 nits` 内的有效格数，和原 bundle 的 `maxNits: 500` 口径一致。
- `manifest.original.json`：源 manifest 原始字节。
- `raw/<file>.json`：源记录原始字节，保留其 `excluded` 字段。
- `processed/<file>.json`：线上 `processRecord(raw, {denoise:true})` 的结果与状态；未新增统计综合分或健康排名。

## 处理结果结构

```js
{
  schemaVersion: 1,
  source: {repository, branch, commit, file, sha256},
  identity: {file, device, mode, deviceEn?, modeEn?, id},
  denoise: true,
  record: {
    id, name, data,
    matrix: {
      rows: [255, 233, /* 实测灰阶 */],
      cols: [100, 90, /* 亮度百分比 */],
      headerNits: [/* 每列 G255 白场档位亮度 nits */],
      grid: [[{gray, brightnessPercent, nits, svm} /* 或 null */]]
    }
  },
  cellStatus: [[{
    status,              // measured | interpolated | lumEstimated | noData | missing
    interpolated,        // 线上 denoise 对 SVM 做了插值
    luminanceEstimated,  // 亮度是估计值
    restoredFromExcluded // 原记录曾排除此格，线上先复原再重新判定
  }]],
  noteGrid: [[/* null 或完整 CellNote，含原因、原值、显示值、插值来源 */]],
  levelNotes: [/* 白场档位亮度重估记录 */],
  analysis: {/* 原模块完整检测结果 */},
  notes: [/* 原模块完整处理说明 */],
  summary: {/* 原模块处理数量统计 */},
  fixedGraySlices: {
    "34":  {gray: 34,  points: [/* 各亮度列，按 x 升序 */]},
    "124": {gray: 124, points: [/* 各亮度列，按 x 升序 */]},
    "255": {gray: 255, points: [/* 各亮度列，按 x 升序 */]}
  }
}
```

`cellStatus[r][c]` 与 `noteGrid[r][c]` 使用 `record.matrix` 的原始行列顺序。

固定灰阶使用全部 17 表共同实测行中最接近 G32 / G128 / G255 的 **G34 / G124 / G255**。这些曲线未新增灰阶插值。每个 `points` 数组包含全部 18 列（无效格保留，不能先过滤再连线）：

```js
{
  gray, brightnessPercent,
  x, headerNits,      // 两者相同，白场档位亮度，用作横轴
  rawHeaderNits,     // 处理前白场档位亮度
  levelEstimated,   // 当前 headerNits 是否经过线上重估
  svm, nits,        // 显示结果；无数据为 null
  rawSvm, rawNits,   // 复原 excluded 后的原读数
  status, interpolated, luminanceEstimated, restoredFromExcluded,
  note              // 完整处理说明或 null
}
```

横轴必须使用 `x` / `headerNits`，它表示亮度档位下 G255 的白场亮度。`nits` 表示当前灰阶格的亮度，只用于读数提示。`lumEstimated` 格保留实测 SVM；`interpolated` 格的 SVM 是线上插值结果；`noData` / `missing` 格必须断线。

iPhone 18 Pro Max 两份原文件分别带 122 / 105 个 `excluded` 记录。线上处理会先复原这些原读数再运行当前降噪算法，因此处理后有效格数可能高于原文件 `data.length`。这不代表新增测量。

## 原生 JavaScript 调用

```js
const index = await fetch('./data/svm/index.json').then(r => r.json());
const entry = index.records[0];
const dataset = await fetch(`./data/svm/${entry.processedFile}`).then(r => r.json());
const points = dataset.fixedGraySlices['124'].points;

// 根据 points[i].svm === null 断线；使用 points[i].x 横坐标。
// points[i].interpolated 可用于绘制空心点或显示“插值”提示。
```

来源算法保持不变；只使用 Node 自带 TypeScript 转换并补齐本地模块导入扩展名。复算脚本与固定来源模块保存在任务的 `work/svm-source/`，不需要安装依赖。
