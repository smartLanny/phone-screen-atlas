const manifestUrl = new URL("../../data/uniformity/index.json", import.meta.url);
const dataRoot = new URL("../../data/uniformity/", import.meta.url);
const cards = document.querySelector("#cards");
const conditionControls = document.querySelector("#conditions");
const mapKindControls = document.querySelector("#mapKinds");
const parentOrigin = location.origin;
let manifest;
let phoneIds = [];
let phoneNames = [];
let hasParentSelection = false;
let conditionId = "300";
let mapKind = "luminance";
let lastHeight = 0;
let lastReportedState = "";

const labels = {
  luminance: "亮度",
  colorTemperature: "色温",
};

const formatNumber = (value, digits = 1) => new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value);

function activePhones() {
  const lookup = [...manifest.phones, ...manifest.metricsOnly, ...manifest.notRecorded];
  return phoneIds.map((id, index) => {
    const known = lookup.find((phone) => phone.id === id);
    return {
      ...(known ?? { id, heatmapStatus: "not-recorded", conditions: [] }),
      name: phoneNames[index] || known?.name || id,
    };
  });
}

function conditionFor(phone) {
  return phone.conditions.find((condition) => condition.id === conditionId);
}

function renderControls() {
  const phones = activePhones();
  const levels = [...new Set(phones.flatMap((phone) => phone.conditions.map((condition) => condition.id)))];
  if (!levels.includes(conditionId) && levels.length) conditionId = levels[0];
  conditionControls.replaceChildren(...levels.map((level) => {
    const condition = phones.map((phone) => phone.conditions.find((entry) => entry.id === level)).find(Boolean);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = condition.label;
    button.setAttribute("aria-pressed", String(level === conditionId));
    button.addEventListener("click", () => {
      conditionId = level;
      if (!phones.some((phone) => conditionFor(phone)?.maps?.[mapKind])) mapKind = "luminance";
      render();
    });
    return button;
  }));

  const kinds = ["luminance", "colorTemperature"].filter((kind) =>
    phones.some((phone) => conditionFor(phone)?.maps?.[kind]),
  );
  if (!kinds.includes(mapKind) && kinds.length) mapKind = kinds[0];
  mapKindControls.replaceChildren(...kinds.map((kind) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = labels[kind];
    button.setAttribute("aria-pressed", String(kind === mapKind));
    button.addEventListener("click", () => {
      mapKind = kind;
      render();
    });
    return button;
  }));
}

function mapStatus(phone, condition) {
  if (condition?.maps?.[mapKind]) return null;
  if (manifest.metricsOnly.some((entry) => entry.id === phone.id)) return "均匀度图待补充";
  if (manifest.notRecorded.some((entry) => entry.id === phone.id)) return "待测";
  if (condition) return "该条件待测";
  return "待测";
}

function legendFor(map) {
  let top;
  let bottom;
  let caption;
  if (mapKind === "luminance") {
    top = `${formatNumber(map.scale.maxPercentOfTypical, 0)}%`;
    bottom = `${formatNumber(map.scale.minPercentOfTypical, 0)}%`;
    caption = "相对典型亮度";
  } else {
    top = `+${formatNumber(map.scale.maxOffsetFromTypicalK, 0)}K`;
    bottom = `${formatNumber(map.scale.minOffsetFromTypicalK, 0)}K`;
    caption = "相对典型色温";
  }
  const stops = manifest.colorStops.map(([position, rgb]) => `rgb(${rgb.join(",")}) ${position * 100}%`).join(",");
  const wrap = document.createElement("div");
  wrap.className = "legend";
  const ramp = document.createElement("div");
  ramp.className = "legend-ramp";
  ramp.style.background = `linear-gradient(to top, ${stops})`;
  const topLabel = document.createElement("div");
  topLabel.className = "legend-top";
  topLabel.textContent = top;
  const bottomLabel = document.createElement("div");
  bottomLabel.className = "legend-bottom";
  bottomLabel.textContent = bottom;
  const description = document.createElement("div");
  description.className = "legend-caption";
  description.textContent = caption;
  wrap.append(ramp, topLabel, description, bottomLabel);
  return wrap;
}

function metricNodes(condition, kind) {
  const metric = condition.metrics[kind];
  if (!metric) return [];
  const result = [];
  const typical = document.createElement("span");
  typical.className = "metric";
  const typicalValue = document.createElement("strong");
  typicalValue.textContent = `${formatNumber(metric.typical, kind === "luminance" ? 3 : 0)} ${metric.unit}`;
  typical.append("典型值 ", typicalValue);
  result.push(typical);
  const spread = document.createElement("span");
  spread.className = "metric";
  const spreadValue = document.createElement("strong");
  if (kind === "luminance") {
    spreadValue.textContent = `${formatNumber(metric.ninePointUniformityPct, 1)}%`;
    spread.append("9 点均匀性 ", spreadValue);
  } else {
    spreadValue.textContent = `${formatNumber(metric.ninePointSpreadK, 0)} K`;
    spread.append("9 点色温差 ", spreadValue);
  }
  result.push(spread);
  if (kind === "luminance") {
    const area = document.createElement("span");
    area.className = "metric";
    const areaValue = document.createElement("strong");
    areaValue.textContent = `${formatNumber(metric.areaUniformityPct, 1)}%`;
    area.append("面均匀性 ", areaValue);
    result.push(area);
    const deviation = document.createElement("span");
    deviation.className = "metric";
    const deviationValue = document.createElement("strong");
    deviationValue.textContent = `${formatNumber(metric.deviation10PctArea, 2)}%`;
    deviation.append("偏离典型值 10% 以上的面积 ", deviationValue);
    result.push(deviation);
  } else {
    const area = document.createElement("span");
    area.className = "metric";
    const areaValue = document.createElement("strong");
    areaValue.textContent = `${formatNumber(metric.areaSpreadK, 0)} K`;
    area.append("全屏色温差 ", areaValue);
    result.push(area);
  }
  return result;
}

function measurementDetails(condition) {
  const details = document.createElement("details");
  details.className = "measurement-details";
  const summary = document.createElement("summary");
  summary.textContent = "测量信息";
  const values = document.createElement("div");
  values.className = "measurement";
  values.append(...metricNodes(condition, mapKind));
  const note = document.createElement("p");
  note.className = "figure-note";
  note.textContent = mapKind === "luminance"
    ? "热力图颜色按本机典型亮度归一化，不代表图中各点的绝对 nit 值。"
    : "热力图色阶以本机典型色温为基准，范围为 -1090 K 至 +510 K。";
  details.append(summary, values, note);
  return details;
}

function renderCard(phone) {
  const condition = conditionFor(phone);
  const map = condition?.maps?.[mapKind];
  const card = document.createElement("article");
  card.className = "phone-card";

  const head = document.createElement("header");
  head.className = "phone-head";
  const title = document.createElement("h2");
  title.textContent = phone.name;
  const conditionLabel = document.createElement("span");
  conditionLabel.className = "condition-label";
  conditionLabel.textContent = condition?.label ?? "";
  head.append(title, conditionLabel);

  const figure = document.createElement("div");
  figure.className = "figure";
  if (!map) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const text = document.createElement("span");
    text.textContent = mapStatus(phone, condition);
    empty.append(text);
    figure.append(empty);
  } else {
    const plot = document.createElement("div");
    plot.className = "plot-content";
    const frame = document.createElement("div");
    frame.className = "map-frame";
    const image = document.createElement("img");
    image.className = "heatmap";
    image.src = new URL(map.asset, dataRoot).href;
    image.alt = `${phone.name}，${condition.label}，${labels[mapKind]}均匀度热力图`;
    frame.append(image);
    plot.append(frame, legendFor(map));

    figure.append(plot, measurementDetails(condition));
  }

  const watermark = document.createElement("span");
  watermark.className = "watermark";
  watermark.textContent = "野生的装机宅";
  watermark.setAttribute("aria-hidden", "true");
  figure.append(watermark);
  card.append(head, figure);
  return card;
}

function reportHeight() {
  if (window.parent === window) return;
  const app = document.querySelector("#app");
  const bodyStyle = getComputedStyle(document.body);
  const verticalPadding = Number.parseFloat(bodyStyle.paddingTop) + Number.parseFloat(bodyStyle.paddingBottom);
  const verticalBorder = Number.parseFloat(bodyStyle.borderTopWidth) + Number.parseFloat(bodyStyle.borderBottomWidth);
  const height = Math.ceil(app.getBoundingClientRect().height + verticalPadding + verticalBorder);
  if (!height || height === lastHeight) return;
  lastHeight = height;
  window.parent.postMessage({ type: "atlas-uniformity-height", height }, parentOrigin);
}

function reportState() {
  if (window.parent === window || !hasParentSelection) return;
  const state = `${conditionId}:${mapKind}`;
  if (state === lastReportedState) return;
  lastReportedState = state;
  window.parent.postMessage({
    type: "atlas-uniformity-change",
    condition: conditionId,
    map: mapKind,
  }, parentOrigin);
}

function render() {
  if (!manifest) return;
  renderControls();
  const phones = activePhones();
  cards.dataset.count = String(phones.length);
  cards.replaceChildren(...phones.map(renderCard));
  reportState();
  requestAnimationFrame(reportHeight);
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || event.origin !== parentOrigin) return;
  if (event.data?.type !== "atlas-uniformity-set" || !Array.isArray(event.data.phones)) return;
  hasParentSelection = true;
  const selected = [];
  event.data.phones.forEach((id, index) => {
    if (typeof id !== "string" || selected.some((phone) => phone.id === id) || selected.length === 2) return;
    const name = Array.isArray(event.data.names) ? event.data.names[index] : "";
    selected.push({ id, name: typeof name === "string" ? name : "" });
  });
  phoneIds = selected.map((phone) => phone.id);
  phoneNames = selected.map((phone) => phone.name);
  if (["300", "100", "10"].includes(event.data.condition)) conditionId = event.data.condition;
  if (["luminance", "colorTemperature"].includes(event.data.map)) mapKind = event.data.map;
  render();
});

if ("ResizeObserver" in window) {
  const observer = new ResizeObserver(reportHeight);
  observer.observe(document.documentElement);
  observer.observe(document.querySelector("#app"));
}
cards.addEventListener("toggle", () => requestAnimationFrame(reportHeight), true);
window.addEventListener("load", reportHeight, { once: true });

fetch(manifestUrl)
  .then((response) => {
    if (!response.ok) throw new Error(`manifest request failed: ${response.status}`);
    return response.json();
  })
  .then((data) => {
    manifest = data;
    if (!hasParentSelection) {
      phoneIds = [manifest.defaultPhone];
      conditionId = manifest.defaultCondition;
      mapKind = manifest.defaultMap;
    }
    render();
    if (window.parent !== window) {
      window.parent.postMessage({ type: "atlas-uniformity-ready" }, parentOrigin);
    }
    reportHeight();
  })
  .catch((error) => {
    cards.textContent = "均匀度数据载入失败";
    console.error(error);
    reportHeight();
  });
