# 均匀度 iframe

这是父页统一选择机型的静态组件。`data/uniformity/index.json` 的 `phones` 只列出有可显示热力图的 canonical 机型；`metricsOnly` 单独列出只有源指标、没有导出热力图的机型，`notRecorded` 记录本次来源里没有对应记录的机型。

iframe 收到同源且来自父窗口的 `{type:"atlas-uniformity-set",phones:[id,...],names:[name,...],condition?,map?}` 后更新，最多显示两台。`names` 可选，与 `phones` 同序，用来显示其他模块引入的机型名；`condition` 可为 `300`/`100`/`10`，`map` 可为 `luminance`/`colorTemperature`。独立打开时默认显示小米 18 Pro Max 的 300 nits 白场亮度图。完成数据载入后发送 `atlas-uniformity-ready`；内容高度变化时发送去重后的 `atlas-uniformity-height`；条件或地图类型变化后发送 `atlas-uniformity-change`，供父页保存分享状态。

亮度色图以本机典型值归一化，色温色图以本机典型色温为中心，范围为 -1090 K 至 +510 K；图下典型值和 9 点指标使用源 `maps.json` 数值。色温按钮只在当前条件存在色温图时显示。

## 重建静态资产

转换脚本不重算 Radiant 数据，只验证现有 `maps.json`、`maps.js`、`uniformity_metrics.json`，并将已有 RGBA 热力图无损旋转为竖屏，保留源 alpha 掩膜。可选传入原始测量 TXT 根目录以记录矩阵分辨率和哈希：

```sh
python3 scripts/uniformity/export_maps.py \
  --source-dir "/path/to/视频制作/data/unif" \
  --measurements-root "/path/to/手机数据整理/01单机数据"
```

脚本默认写入 `data/uniformity/` 和仓库外的 `../../work/uniformity/source-audit.json`。
