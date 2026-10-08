# 野生的装机宅屏幕数据库

统一选择机型，查看可视角、频闪、均匀度和全光谱反射率。暗色、简洁，优先展示原版画面。

[在线访问](https://smartlanny.github.io/phone-screen-atlas/)

![暗色展示](docs/desktop-overview.png)

## 界面

- 统一选机型，从上往下查看可视角、频闪、均匀度、反射率，四个板块共用对比机型；顶部可直接跳到对应项目。
- 可视角复用原版 WebGL 仿真和圆形观看方向热力图，支持拖动、亮度／色偏、配色与扫描。手机上方标明机型与状态，双机分别显示方向图，共用观看角度。
- 频闪复用原版彩色热力图、立体和同灰阶二维曲线，亮度范围固定 ≤500 nits；二维默认 G255，灰阶滑块及快捷按钮直接使用原版组件。
- 均匀度复用既有亮度／色温热力图，默认 300 nits 白场；100 nits G20、10 nits G20 按真实记录切换，10 nits 不提供缺测的色温图。指标和相对色阶说明折叠在“测量信息”。
- 反射率展示 400–700 nm 曲线，支持全反射／漫反射、真实贴膜与内外屏条件，触摸或悬浮读点。原图提取结果保留缺段，不把 2 nm 提取网格冒充仪器采样；详细来源和估计精度在测量信息中。
- 调光模式与防窥状态直接点按钮，普通状态叫“默认”。
- 说明点击打开，不常驻详细数字或引用链接；水印仅在各图表留白保留一处，不覆盖手机、曲线或色块。
- 对比时每台手机各一张频闪图，桌面并排、窄屏纵排；两张二维曲线的灰阶联动。缺少频闪数据的机型保留“待补充”位置。

17 个机型、16 条频闪记录，3 款机型的 15 张均匀度热力图，以及 17 部设备的反射率曲线。华为 Mate 90 Pro Max 典藏版已接入六方向可视角，频闪源文件待补充，机身外观按正反面参考图还原。小米 18 Pro Max 与 iPhone 18 Pro Max 的默认／防窥状态各含 0°、30°、60°、90°、120°、150° 六个实测方向（正负角度合计 12 条方向线）。iPhone 18 Pro Max 两类测量来自同一台 GH3 面板手机。

## 本地运行

Node.js 22.13+，无需安装依赖。

```sh
npm run dev
```

打开 `http://127.0.0.1:8874`。任意静态服务器也可以服务整个仓库；直接双击 HTML 不适用。

```sh
npm run check
```

检查包含脚本语法、数据复算、原始矩阵审阅、原版 SVM 嵌入逐字复现、桥接状态与存储隔离，以及静态资源完整性。

## 原版复用边界

`vendor/svm/original.html` 保存固定版本原始 release。嵌入适配仅调整外层工具 UI、隔离持久化并加入父页状态桥接；原渲染器、配色、数据与计算保持原样。二维曲线沿用原 Inspector 的灰阶控件及事件处理。

`vendor/angle/` 保留原光学模型、手机几何、WebGL 画面和方向图交互。适配只安排原方向图位置、连接父页机型与分享状态；观看距离固定 30 cm。新增方向来自原始 `.ang2`，文件名方向优先于内部旧标签，逐曲线正视归一化规则保持原样，原始文件校验见测量清单。

频闪 iframe 内使用临时内存状态，关闭自身持久化，防止所选记录子集覆盖原工具数据。父页与原工具的存储不受影响。分享链接保存机型、模式、频闪视图、灰阶、观看角度、方向、画面、配色、亮度／色偏和防窥状态。

## 更新与复算

```sh
npm run embed:svm
npm run embed:angle
npm run data:svm
npm run data:audit
npm run check
```

可视角嵌入生成需要 Python 3。正常运行与频闪嵌入不需要安装依赖或联网。

数据与原文件按固定提交随项目保存，不在用户访问时从外站抓取。更新原项目版本时，需要同步对应来源记录和适配检查；新增机型需更新机型目录和数据索引。

## 来源与许可

- `phone-view-angle-sim`：`fe12e3f238f000e8865ef832fac7a8f8c578b9de`，来源见 `vendor/angle/SOURCE.json`。
- `svm-full-range-visualizer`：`4189c501004904a494a35ae438dda761cff2be0c`，来源见 `vendor/svm/SOURCE.json` 与 `data/svm/source.json`。

MIT，原项目许可原文随源码保留。

## 新增测量来源

- `data/uniformity/index.json`：来自视频制作项目已有 `data/unif/maps.json`、`maps.js` 和 `uniformity_metrics.json`。15 张热力图只做无损竖屏旋转，保留 alpha 掩膜、相对色阶、原始矩阵尺寸与哈希。源码和生成方式见 `vendor/uniformity/README.md` 与 `scripts/uniformity/export_maps.py`。G20 沿用原标记，不改写为 20%。
- `data/reflectance/source-manifest.json`：23 张反射率源图的相对来源路径与 SHA-256。曲线为 PNG 坐标提取，估计误差 ±1 nm、±0.05 个百分点；波长和反射率单位分别为 nm、%。源图未标明的 SCI/SCE 方法保持未知。iPhone 16 Pro Max 总反射只可读至 614 nm；漫反射保留可读后段和中间缺口。图例整体读数沿用原图标注，不称为重新计算的均值。

反射率可从仓库内源图离线重建（Python 3、NumPy、Pillow）：

```sh
python3 scripts/reflectance/rebuild.py check
python3 scripts/reflectance/rebuild.py rebuild
```

`npm run check` 同时校验两类索引、机型归属、图片与源图副本哈希、曲线顺序、单位、缺段和模块本地资源。
