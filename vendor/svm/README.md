# 原版 SVM 嵌入

`original.html` 是固定提交 `4189c501004904a494a35ae438dda761cff2be0c` 的 `release/SVM-Visualizer.html` 原始字节。`embed.html` 保留原图表、计算、绘制和交互，仅隔离持久化键并追加 Shell 隐藏样式与消息桥。来源、SHA-256 及具体改动见 `SOURCE.json`；原 MIT 声明见 `LICENSE`。

从站点根目录运行：

```sh
node scripts/build-svm-embed.mjs
node scripts/build-svm-embed.mjs --check
node vendor/svm/verify-bridge.mjs
```

无需安装或联网。构建检查原始 SHA-256、持久化字面量数量以及所有内联 JavaScript 语法。`--check` 复算后逐字比较已有 `embed.html`。

## 父页调用

```html
<iframe id="svm" src="./vendor/svm/embed.html" title="SVM 原版可视化"></iframe>
```

```js
const frame = document.querySelector('#svm');
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
  if (event.data?.type === 'atlas-svm-ready') {
    frame.contentWindow.postMessage({
      type: 'atlas-svm-set',
      files: ['iPhone17ProMax.json', 'huawei_mate80rs.json'],
      view: 'scene3d',
      sliceGray: 34,
      sliceNits: 100,
      sliceMode: 'gray',
      terrainView: 'top',
      layout: 'sideBySide',
      denoise: true
    }, location.origin);
  }
});
```

`files` 必填，含 1–2 个 manifest 内文件名，不允许重复。其他字段可省略：`view` 为 `scene3d | chart2d | stats`；`sliceMode` 为 `gray | brightness`；`terrainView` 为 `perspective | top | front | side`；`layout` 为 `single | sideBySide | diff`；`sliceGray` 为有限数字 0–255；`sliceNits` 为有限数字 0.01–500；`denoise` 为布尔值。未知字段与整个无效请求均拒绝。只接受 `event.source === parent` 且 `event.origin === location.origin` 的消息。

消息直接调用原 `store.setState()`，不重载 iframe。原记录 ID 是 `bundled:${filename}`。准备完成后先缓存完整原记录索引，每次按 `files` 从完整索引取记录，向原 `store.records` 仅放入所选 1–2 条、`hiddenIds:[]`；因此二维图例不出现其他隐藏机型，换组后也能切回。双机默认 `sideBySide`，单机强制 `single`；清空额外比较面板。`view` 映射 `tab`，`terrainView` 映射原 `view` 字段。准备前收到的最后一个有效请求会在 `ready` 后应用。

发回事件：`atlas-svm-ready`（含可用 `files` 与 `views`）、`atlas-svm-applied`（含已应用 `files` 与 `view`）、`atlas-svm-error`（含 `message`）。父页可重复发送状态，原 3D 旋转/缩放、2D 交互和统计功能保留。初始化默认 `scene3d` + `top`，采用原正交俯视彩色热力图；每次父页设置均固定 `maxNits:500`。`values:false`、`title:false`、`axes:true`、`colorbar:true`、`contours:true` 在初始化和父页设置时应用。父页用 `terrainView:'top' / 'perspective'` 切换热力图/立体。

## 原版同灰阶二维曲线

父页发送 `view:'chart2d', sliceMode:'gray', sliceGray:127`。所选两条原记录在同一个原版二维画布内，使用同一个原 `sliceGray`；曲线、插值、hover 与图例交互均由原组件处理。

灰阶控制复用原 `Inspector2D` 第一个 Section 的原 `Slider` DOM：原标签、G0–255 滑块、255/192/127/64/32 预设以及 React `onChange` 完整保留。桥接仅点击原 Inspector 展开按钮完成挂载，并标记该原子树；CSS 将它显示为底部 96px 控制条。未重建、复制或重挂载该 React 控件。其他 Inspector 参数、原二维播放/表格工具条保持隐藏。图表 stage 缩短 96px 为原控件让位，由原 ResizeObserver 自行重排画布。

用户操作原控件会发送 `{type:'atlas-svm-change', view, sliceMode, sliceGray, sliceNits}`；父页主动 `atlas-svm-set` 不产生 change 回声。父页可以保存最后灰阶，并在再次切入二维时传回。“野生的装机宅”水印位于画布上方预留的 28px 背景带内，单处显示、无点击区域，不覆盖原图色块、曲线或标签。主站二维默认 G255，分享链接仍可指定其他灰阶。

嵌入在 capture 阶段屏蔽原 Shell 的 1/2/3/T 视图切换、F/H 展示切换以及空格/R 播放快捷键，避免绕过父页状态或启动隐藏播放。输入框、滑块、按钮保留浏览器默认键盘行为；原 Shell 的空格 keyup 也被隔离，保证按钮仍能正常空格激活。滑块方向键、Home/End/PageUp/PageDown、按钮 Enter、Ctrl/Cmd/Alt 组合键与输入法事件保持原样。

## CSS 与持久化隔离

隐藏选择器由 `embed.css` 明确列出：`.shell-header`、`[data-testid="sidebar"]`、`inspector`、`inspector-toggle`、`settings-panel`、`export-button`、`importer`、`drop-overlay`、`present-exit`、`present-hint`、`scene3d-values-hint`，以及 `[data-testid="scene3d"] [data-scene-ui]`（原四视角工具条）。

保留原 `[data-testid="main"]`、`stage-outer`、`stage`、`[data-view="scene3d"]`、`[data-view="chart2d"]`、`[data-view="stats"]`。原渲染器、鼠标/触摸旋转缩放、二维曲线交互、统计视图代码均保留。采用原工具的暗色画布与颜色。

已检查 `persistence.ts`、`uiStore.ts`、`StatsView.tsx` 及编译单文件所有 `localStorage` / `indexedDB` 调用。构建仍保留 13 类原持久化字面量的 `atlas-embed.` 前缀；当前桥接进一步在原 deferred module 执行前，为 iframe 自己的 `window` 设置 `indexedDB:undefined` 与空读/无写 `localStorage` 适配器。原 bootstrap 与 autosave 的不可用存储路径照常运行，页面状态仅存于内存。这样所选记录子集不会被 autosave 误存成删除其他 bundled 记录；重载后完整 16 条重新可用。父页 window、真实 IndexedDB/localStorage 和 `original.html` 均未改变。
