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

`files` 必填，含 1–2 个 manifest 内文件名，不允许重复。其他字段可省略：`view` 为 `scene3d | chart2d | stats`；`sliceMode` 为 `gray | brightness`；`terrainView` 为 `perspective | top | front | side`；`layout` 为 `single | sideBySide | diff`；`sliceGray` 为有限数字 0–255；`sliceNits` 为有限数字 0.01–100000；`denoise` 为布尔值。未知字段与整个无效请求均拒绝。只接受 `event.source === parent` 且 `event.origin === location.origin` 的消息。

消息直接调用原 `store.setState()`，不重载 iframe。原记录 ID 是 `bundled:${filename}`。只让所选记录可见；双机默认 `sideBySide`，单机强制 `single`；清空额外比较面板。`view` 映射 `tab`，`terrainView` 映射原 `view` 字段。准备前收到的最后一个有效请求会在 `ready` 后应用。

发回事件：`atlas-svm-ready`（含可用 `files` 与 `views`）、`atlas-svm-applied`（含已应用 `files` 与 `view`）、`atlas-svm-error`（含 `message`）。父页可重复发送状态，原 3D 旋转/缩放、2D 交互和统计功能保留。初始化默认 `scene3d` + `top`，采用原正交俯视彩色热力图；每次父页设置均固定 `maxNits:500`。`values:false`、`title:false`、`axes:true`、`colorbar:true`、`contours:true` 在初始化和父页设置时应用。父页用 `terrainView:'top' / 'perspective'` 切换热力图/立体。

## CSS 与持久化隔离

隐藏选择器由 `embed.css` 明确列出：`.shell-header`、`[data-testid="sidebar"]`、`inspector`、`inspector-toggle`、`settings-panel`、`export-button`、`importer`、`drop-overlay`、`present-exit`、`present-hint`、`scene3d-values-hint`，以及 `[data-testid="scene3d"] [data-scene-ui]`（原四视角工具条）。

保留原 `[data-testid="main"]`、`stage-outer`、`stage`、`[data-view="scene3d"]`、`[data-view="chart2d"]`、`[data-view="stats"]`。原渲染器、鼠标/触摸旋转缩放、2D 工具条、统计视图代码均保留。采用原工具的暗色画布与颜色。

已检查 `persistence.ts`、`uiStore.ts`、`StatsView.tsx` 及编译单文件所有 `localStorage` / `indexedDB` 调用。13 类原持久化字面量全部加 `atlas-embed.` 前缀（包括专用 IndexedDB 数据库、对象存储和未使用的 idb-keyval 默认库/存储）。因此嵌入不会读取、覆盖或删除原工具同域存储。`svm.shell.ui.v1` 的读取和清理路径两处都已改名。原 bootstrap 与 autosave 仍运行，但仅操作隔离命名空间。
