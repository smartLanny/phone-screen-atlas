# 反射率图表提取

原始目录中按“反射率”命名的 23 个候选文件都是 PNG 图表；在这些候选中没有仪器原始点列。图表坐标明确给出波长 400–700 nm 与反射率 0–10%；输出沿用这两个绝对坐标轴，不归一化，也不补齐图例遮挡或颜色重叠的波段。

`source-spec.json` 记录原图相对路径、设备条件、颜色与图例标注。`data/reflectance/source/` 保存逐字节复制的原图，`data/reflectance/source-manifest.json` 保存 NAS 相对路径、文件尺寸和 SHA-256。`data/reflectance/index.json` 是静态 iframe 使用的曲线索引。

首次从原始 NAS 目录重新导入并提取：

```sh
python3 scripts/reflectance/rebuild.py ingest
```

使用仓库内源图离线重建：

```sh
python3 scripts/reflectance/rebuild.py rebuild
```

校验本地源图哈希、轴单位、曲线范围与重建结果：

```sh
python3 scripts/reflectance/rebuild.py check
```

脚本需要 Python、NumPy 和 Pillow。数字化采样网格为 2 nm；这是从 PNG 读取曲线的坐标间隔，不是仪器的原始采样间隔。误差口径为波长 ±1 nm、反射率 ±0.05 个百分点。点列只保留可从原图识别的颜色像素；未识别处在曲线中保留缺口。iPhone 16 Pro Max 全反射曲线只可读到 614 nm；漫反射红线可读到 700 nm，但保留 68 nm 中部缺口及其他像素空段。SCI/SCE 只写入 Find X9 源图明确标出的曲线；其他图没有标记时保持未知。
