# 离线重建频闪数据

从站点根目录运行：

```sh
node scripts/svm/rebuild.mjs
# package.json 可定义 "data:svm": "node scripts/svm/rebuild.mjs"
npm run data:svm
```

入口读取 `data/svm/manifest.original.json` 与 `data/svm/raw/`，重建 `processed/`、`index.json` 和 `source.json`。原始文件保持不变。无联网、无第三方依赖，已在 Node **22.23.1** 实际运行。`runtime/` 是使用 Node 内置 `stripTypeScriptTypes` 生成的模块；可删除，下次运行会重建。

仅校验当前结果与离线重建是否逐字一致：

```sh
node scripts/svm/rebuild.mjs --check
node scripts/svm/audit.mjs
```

`audit.mjs` 独立核对原始读数、源校验值、降噪说明、矩阵与三条固定灰阶曲线的逐格关系，以及估计值标记；仅输出聚合结果，不改数据。

`source/*.ts` 是固定来源提交 `48bf54c6d52a20179e5471d63e18717d8602c934` 的原模块，算法未修改。来源：[smartLanny/svm-full-range-visualizer](https://github.com/smartLanny/svm-full-range-visualizer/tree/48bf54c6d52a20179e5471d63e18717d8602c934)，分支 `claude/brave-archimedes-bd546k`。原项目 **MIT** 声明见同目录 `LICENSE`；`source.json` 保存模块 SHA-256 与原版权声明及 Mate 90 表格来源校验值。

固定曲线只使用 17 份记录共同实测行 **G34 / G124 / G255**。`headerNits` 是当前显示的白场档位亮度；`levelEstimated:true` 表示该档位经过原算法重估。SVM 插值、当前灰阶亮度估计与白场档位重估分别通过 `interpolated`、`luminanceEstimated`、`levelEstimated` 标明，不能统称实测。Mate 90 的有效点位仍只来自源表 72 个测量格；缺测保持空值，默认 500 nits 过滤按 G255 轴统计为 0 点。

跨平台 `--check` 对原始值、结构、状态与数量严格比较；仅明确标记为计算结果的浮点字段允许 `1e-11` 绝对误差加 `1e-11` 相对误差，避免不同系统数学库的末位差异。来源中的 `processing.runtime` 保留生成快照时的环境信息。嵌入原版 SVM release 的复现仍为逐字比较。
