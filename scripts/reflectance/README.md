# 手机原始反射率与 PNG 对照

现行展示使用 `/Volumes/dav/黄海波/反射率.xml` 中人工核准的手机样品：24 款手机、32 个样品、64 条 SCI/SCE 曲线。每条保留 400–700 nm、10 nm 间隔的 31 个原始点。XML 数字为反射比，发布时乘 100 转成百分数；该单位解释通过同条件 PNG 纵轴交叉核对，不做归一化、补点或平均合并。不声明仪器精度。

`raw-spec.json` 明确允许的 XML 样品 ID、原名、手机 ID 与测试条件。型号、贴膜和内外屏按原样品名分别保留；未注明的状态不解释为裸屏或默认。iPad 属平板，显示器、电视、笔记本等均不进入手机索引。

原 XML 仅在 NAS 只读使用，不整份复制到公开目录。`data/reflectance/raw/phone-samples.json` 只保存核准手机的最小原始数字与样品元数据，并记录原 XML 哈希。`source-manifest.json` 的 `rawSource` 记录此最小导出哈希。静态 iframe 使用 `index.json`。

从指定 XML 导入并重建：

```sh
python3 scripts/reflectance/raw_ingest.py ingest --xml-source /Volumes/dav/黄海波/反射率.xml
```

依靠仓库内手机数字与 PNG 对照证据离线重建、校验：

```sh
python3 scripts/reflectance/rebuild.py rebuild
python3 scripts/reflectance/rebuild.py check
node scripts/check-measurements.mjs
```

对照 NAS 原 XML 全点核验，并运行不调用导入函数的独立比对：

```sh
python3 scripts/reflectance/raw_ingest.py check
python3 scripts/reflectance/verify_xml.py
```

索引顶层 `sampling` 表示当前 XML 原始采样口径，`gridIsInstrumentSampling=true`、`sampleStepsNm=[10]`。原始曲线为 `digitized=false`、`sourceKind=instrument-xml`，保留真实 `sampleStepNm`、SCI/SCE、样品名与日期，不带图片提取误差字段。图中连接线或悬停插值不代表新增仪器测量点。

旧 23 张 PNG 仍在 `data/reflectance/source/`，其相对路径、哈希、图例和坐标来自 `source-spec.json` 与 `source-manifest.json`，只作为核对证据。旧图提取的 2 nm 网格和 ±1 nm / ±0.05 个百分点估计误差放在索引 `corroboration.pngDigitization`，不能视作 XML 原始采样规格或仪器精度。旧图误差只是提取口径，实际交叉核对有 3 条曲线偏差超过该估计，详见 `work/reflectance/xml-verification.json`。

当前 40 条旧手机 PNG 曲线都有对应 XML 点列并已替换，iPhone 16 的原图缺口已由原始31点覆盖；没有正在展示的 PNG fallback。管线仍支持未来确无 XML 的 `sourceKind=png-digitized` 条件，每条回退曲线自带提取误差与真实缺口。旧图图例值只作为图例标注，不解释为31点算术均值或XML导出的综合反射率。

仅在需要刷新 PNG 核对源时运行 `python3 scripts/reflectance/rebuild.py ingest`；它保留已存在的 `rawSource` 元数据和手机原始数字优先级。离线图片复建需要 NumPy 与 Pillow，XML解析使用 Python 标准库。
