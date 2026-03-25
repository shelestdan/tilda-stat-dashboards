const data = window.TILDA_STATS_DATA;
const sourceGroupLookup = new Map((data.sources.groups || []).map((item) => [item.label, item.count]));

const trafficSeries = [
  { key: "views", label: "Просмотры", color: "#d8aa45", soft: "rgba(216, 170, 69, 0.12)" },
  { key: "sessions", label: "Сессии", color: "#c36c31", soft: "rgba(195, 108, 49, 0.18)", primary: true },
  { key: "visitors", label: "Посетители", color: "#365f70", soft: "rgba(54, 95, 112, 0.12)" },
];

const channelViews = [
  {
    id: "search",
    label: "Поиск",
    items: data.sources.search,
    color: "#c36c31",
    groupLabel: "Поисковые системы",
  },
  {
    id: "referrers",
    label: "Рефералы",
    items: data.sources.referrers,
    color: "#365f70",
    groupLabel: "Сторонние сайты",
  },
  {
    id: "email",
    label: "Email",
    items: data.sources.email,
    color: "#7b8550",
    groupLabel: "Почтовые рассылки",
  },
  {
    id: "social",
    label: "Соцсети",
    items: data.sources.social,
    color: "#3b8fca",
    groupLabel: "Социальные сети",
  },
  {
    id: "ads",
    label: "Реклама",
    items: data.sources.ads,
    color: "#d85bb7",
    groupLabel: "Реклама",
  },
];

const contentViews = [
  { id: "products", label: "Товары" },
  { id: "pages", label: "Страницы" },
  { id: "events", label: "События" },
  { id: "utm", label: "UTM" },
];

const MONTH_ABBR = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatPercent(value, digits = 2) {
  return `${Number(value).toFixed(digits)}%`;
}

function formatSignedPercent(value, digits = 2) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(digits)}%`;
}

function formatDelta(value, digits = 2) {
  if (!value) return null;
  return formatSignedPercent(value, digits);
}

function shortMonth(row) {
  if (row.month) {
    const [, month] = row.month.split("-");
    return MONTH_ABBR[Number(month) - 1];
  }

  return row.label.replace(" 2025 г.", "").replace(" 2026 г.", "");
}

function getChartLabelStep(containerWidth) {
  if (containerWidth <= 520) return 3;
  if (containerWidth <= 860) return 2;
  return 1;
}

function createSvg(name, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function pathFromPoints(points) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

function areaFromPoints(points, baseY) {
  if (!points.length) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `M${first.x} ${baseY} L${first.x} ${first.y} ${points
    .slice(1)
    .map((point) => `L${point.x} ${point.y}`)
    .join(" ")} L${last.x} ${baseY} Z`;
}

function makePanelLegend(items) {
  const legend = document.createElement("div");
  legend.className = "chart-legend";

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = `
      <span class="legend-dot" style="background:${item.color}"></span>
      <span>${item.label}</span>
    `;
    legend.appendChild(row);
  });

  return legend;
}

function attachTooltip(frame) {
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  frame.appendChild(tooltip);

  return {
    show(x, y, html) {
      tooltip.innerHTML = html;
      tooltip.style.left = `${Math.max(12, x)}px`;
      tooltip.style.top = `${Math.max(12, y)}px`;
      tooltip.classList.add("is-visible");
    },
    hide() {
      tooltip.classList.remove("is-visible");
    },
  };
}

function renderLineChart(container, rows, series) {
  container.innerHTML = "";
  const containerWidth = Math.max(container.clientWidth, 320);
  const labelStep = getChartLabelStep(containerWidth);
  const axisFontSize = containerWidth <= 640 ? 11 : 12;
  const width = 960;
  const height = containerWidth >= 1180 ? 346 : 390;
  const margin = {
    top: 44,
    right: 28,
    bottom: labelStep > 1 ? 44 : 58,
    left: containerWidth <= 640 ? 52 : 64,
  };

  const frame = document.createElement("div");
  frame.className = "chart-frame";
  frame.appendChild(makePanelLegend(series));

  const svg = createSvg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: String(height),
    role: "img",
    "aria-label": "График динамики показателей по месяцам",
  });

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xStep = plotWidth / (rows.length - 1);
  const maxValue = Math.max(...rows.flatMap((row) => series.map((item) => row[item.key])));
  const yMax = Math.ceil(maxValue * 1.1 / 500) * 500;

  const tooltip = attachTooltip(frame);
  const group = createSvg("g");
  svg.appendChild(group);

  for (let i = 0; i <= 4; i += 1) {
    const value = (yMax / 4) * i;
    const y = margin.top + plotHeight - (value / yMax) * plotHeight;
    group.appendChild(
      createSvg("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: "rgba(82, 76, 62, 0.14)",
        "stroke-dasharray": "4 8",
      }),
    );

    const label = createSvg("text", {
      x: margin.left - 12,
      y: y + 4,
      fill: "#67695e",
      "font-size": String(axisFontSize),
      "text-anchor": "end",
    });
    label.textContent = formatNumber(value);
    group.appendChild(label);
  }

  const pointsBySeries = series.map((item) =>
    rows.map((row, index) => ({
      x: margin.left + xStep * index,
      y: margin.top + plotHeight - (row[item.key] / yMax) * plotHeight,
      raw: row[item.key],
      label: row.label,
    })),
  );

  pointsBySeries.forEach((points, index) => {
    const item = series[index];
    if (item.primary) {
      group.appendChild(
        createSvg("path", {
          d: areaFromPoints(points, margin.top + plotHeight),
          fill: item.soft,
        }),
      );
    }

    group.appendChild(
      createSvg("path", {
        d: pathFromPoints(points),
        fill: "none",
        stroke: item.color,
        "stroke-width": item.primary ? "3.5" : "2.5",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    );

    points.forEach((point) => {
      group.appendChild(
        createSvg("circle", {
          cx: point.x,
          cy: point.y,
          r: item.primary ? "4.5" : "3.5",
          fill: "#fff",
          stroke: item.color,
          "stroke-width": "2",
        }),
      );
    });
  });

  rows.forEach((row, index) => {
    const x = margin.left + xStep * index;
    if (index % labelStep === 0 || index === rows.length - 1) {
      const label = createSvg("text", {
        x,
        y: height - 18,
        fill: "#67695e",
        "font-size": String(axisFontSize),
        "text-anchor": "middle",
      });
      label.textContent = shortMonth(row);
      group.appendChild(label);
    }

    const hit = createSvg("rect", {
      x: x - xStep / 2,
      y: margin.top,
      width: index === 0 || index === rows.length - 1 ? xStep / 2 : xStep,
      height: plotHeight,
      fill: "transparent",
    });

    hit.addEventListener("mouseenter", () => {
      const legendNode = frame.querySelector(".chart-legend");
      const legendHeight = legendNode ? legendNode.offsetHeight : 0;
      const xPx = x * (svg.clientWidth / width);
      const yPx = legendHeight + pointsBySeries[1][index].y * (svg.clientHeight / height);
      const tooltipX = Math.min(xPx + 18, frame.clientWidth - 180);
      const tooltipY = Math.max(10, yPx - 12);
      const lines = series
        .map(
          (item) =>
            `<div><span style="color:${item.color}">●</span> ${item.label}: <strong style="display:inline;margin:0">${formatNumber(
              row[item.key],
            )}</strong></div>`,
        )
        .join("");
      tooltip.show(tooltipX, tooltipY, `<strong>${row.label}</strong>${lines}`);
    });
    hit.addEventListener("mouseleave", () => tooltip.hide());
    group.appendChild(hit);
  });

  frame.appendChild(svg);
  container.appendChild(frame);
}

function renderBarLineChart(container, rows) {
  container.innerHTML = "";
  const containerWidth = Math.max(container.clientWidth, 320);
  const labelStep = getChartLabelStep(containerWidth);
  const axisFontSize = containerWidth <= 640 ? 11 : 12;
  const width = 960;
  const height = containerWidth >= 960 ? 346 : 390;
  const margin = {
    top: 40,
    right: containerWidth <= 640 ? 62 : 76,
    bottom: labelStep > 1 ? 44 : 58,
    left: containerWidth <= 640 ? 52 : 64,
  };

  const frame = document.createElement("div");
  frame.className = "chart-frame";
  frame.appendChild(
    makePanelLegend([
      { label: "Заявки", color: "#c36c31" },
      { label: "Конверсия", color: "#365f70" },
    ]),
  );

  const svg = createSvg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: String(height),
    role: "img",
    "aria-label": "График заявок и конверсии по месяцам",
  });

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xStep = plotWidth / rows.length;
  const leadsMax = Math.max(...rows.map((row) => row.leads), 1);
  const conversionMax = Math.max(...rows.map((row) => row.conversion), 1);
  const yLeadsMax = Math.max(4, Math.ceil(leadsMax * 1.2));
  const yConversionMax = Math.ceil(conversionMax * 1.25 * 100) / 100;

  const tooltip = attachTooltip(frame);
  const group = createSvg("g");
  svg.appendChild(group);

  for (let i = 0; i <= 4; i += 1) {
    const leftValue = (yLeadsMax / 4) * i;
    const rightValue = (yConversionMax / 4) * i;
    const y = margin.top + plotHeight - (i / 4) * plotHeight;
    group.appendChild(
      createSvg("line", {
        x1: margin.left,
        y1: y,
        x2: width - margin.right,
        y2: y,
        stroke: "rgba(82, 76, 62, 0.14)",
        "stroke-dasharray": "4 8",
      }),
    );

    const leftLabel = createSvg("text", {
      x: margin.left - 12,
      y: y + 4,
      fill: "#67695e",
      "font-size": String(axisFontSize),
      "text-anchor": "end",
    });
    leftLabel.textContent = formatNumber(Math.round(leftValue));
    group.appendChild(leftLabel);

    const rightLabel = createSvg("text", {
      x: width - margin.right + 12,
      y: y + 4,
      fill: "#67695e",
      "font-size": String(axisFontSize),
      "text-anchor": "start",
    });
    rightLabel.textContent = `${rightValue.toFixed(2)}%`;
    group.appendChild(rightLabel);
  }

  const linePoints = rows.map((row, index) => ({
    x: margin.left + xStep * index + xStep / 2,
    y: margin.top + plotHeight - (row.conversion / yConversionMax) * plotHeight,
  }));

  rows.forEach((row, index) => {
    const x = margin.left + xStep * index;
    const barHeight = (row.leads / yLeadsMax) * plotHeight;
    const bar = createSvg("rect", {
      x: x + xStep * 0.22,
      y: margin.top + plotHeight - barHeight,
      width: xStep * 0.56,
      height: Math.max(barHeight, row.leads ? 2 : 0),
      rx: "8",
      fill: "rgba(195, 108, 49, 0.78)",
    });
    group.appendChild(bar);

    if (index % labelStep === 0 || index === rows.length - 1) {
      const xLabel = createSvg("text", {
        x: x + xStep / 2,
        y: height - 18,
        fill: "#67695e",
        "font-size": String(axisFontSize),
        "text-anchor": "middle",
      });
      xLabel.textContent = shortMonth(row);
      group.appendChild(xLabel);
    }

    const hit = createSvg("rect", {
      x,
      y: margin.top,
      width: xStep,
      height: plotHeight,
      fill: "transparent",
    });

    hit.addEventListener("mouseenter", () => {
      const legendNode = frame.querySelector(".chart-legend");
      const legendHeight = legendNode ? legendNode.offsetHeight : 0;
      const xPx = (x + xStep / 2) * (svg.clientWidth / width);
      const yPx = legendHeight + linePoints[index].y * (svg.clientHeight / height);
      const tooltipX = Math.min(xPx + 18, frame.clientWidth - 180);
      const tooltipY = Math.max(10, yPx - 18);
      tooltip.show(
        tooltipX,
        tooltipY,
        `<strong>${row.label}</strong>
        <div><span style="color:#c36c31">●</span> Заявки: <strong style="display:inline;margin:0">${formatNumber(
          row.leads,
        )}</strong></div>
        <div><span style="color:#365f70">●</span> Конверсия: <strong style="display:inline;margin:0">${row.conversion.toFixed(
          2,
        )}%</strong></div>`,
      );
    });

    hit.addEventListener("mouseleave", () => tooltip.hide());
    group.appendChild(hit);
  });

  group.appendChild(
    createSvg("path", {
      d: pathFromPoints(linePoints),
      fill: "none",
      stroke: "#365f70",
      "stroke-width": "3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );

  linePoints.forEach((point) => {
    group.appendChild(
      createSvg("circle", {
        cx: point.x,
        cy: point.y,
        r: "4.5",
        fill: "#fff",
        stroke: "#365f70",
        "stroke-width": "2",
      }),
    );
  });

  frame.appendChild(svg);
  container.appendChild(frame);
}

function renderProgressList(container, items, options = {}) {
  container.innerHTML = "";
  const list = document.createElement("div");
  list.className = "progress-list";
  const max = Math.max(...items.map((item) => item.count), 1);

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "progress-row";

    const secondary = options.subtitle ? options.subtitle(item) : null;
    row.innerHTML = `
      <div class="progress-row__top">
        <div class="progress-row__label">
          ${options.label ? options.label(item) : item.label}
          ${secondary ? `<small>${secondary}</small>` : ""}
        </div>
        <div class="progress-row__value">
          ${formatNumber(item.count)}
          ${typeof item.share === "number" ? `<div class="row-share">${item.share.toFixed(0)}%</div>` : ""}
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${(item.count / max) * 100}%; background:${
      options.color || "#c36c31"
    }"></div>
      </div>
    `;
    list.appendChild(row);
  });

  container.appendChild(list);
}

function renderDonutBlock(container, segments, config) {
  container.innerHTML = "";

  const total = segments.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;
  const gradient = segments
    .map((item, index) => {
      const start = cursor;
      cursor += total ? (item.count / total) * 100 : 0;
      return `${config.colors[index % config.colors.length]} ${start}% ${cursor}%`;
    })
    .join(", ");

  const wrapper = document.createElement("div");
  wrapper.className = "donut-block";

  wrapper.innerHTML = `
    <div class="donut" style="background: conic-gradient(${gradient});">
      <div class="donut__center">
        <div class="donut__value">${config.valueFormatter(total)}</div>
      </div>
    </div>
    <div class="donut__caption">${config.centerLabel}</div>
  `;

  const list = document.createElement("div");
  list.className = "detail-list";
  segments.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "progress-row";
    row.innerHTML = `
      <div class="progress-row__top">
        <div class="progress-row__label">${item.label}</div>
        <div class="progress-row__value">${formatNumber(item.count)}
          ${typeof item.share === "number" ? `<div class="row-share">${item.share.toFixed(2)}%</div>` : ""}
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${total ? (item.count / total) * 100 : 0}%; background:${
      config.colors[index % config.colors.length]
    }"></div>
      </div>
    `;
    list.appendChild(row);
  });

  wrapper.appendChild(list);
  container.appendChild(wrapper);
}

function makeSegmentedControl(container, items, onSelect) {
  container.innerHTML = "";

  items.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `segmented__button${index === 0 ? " is-active" : ""}`;
    button.textContent = item.label;
    button.dataset.id = item.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", index === 0 ? "true" : "false");

    button.addEventListener("click", () => {
      container.querySelectorAll(".segmented__button").forEach((node) => {
        node.classList.remove("is-active");
        node.setAttribute("aria-selected", "false");
      });
      button.classList.add("is-active");
      button.setAttribute("aria-selected", "true");
      onSelect(item);
    });

    container.appendChild(button);
  });

  onSelect(items[0]);
}

function renderTable(container, config) {
  container.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = config.className || "table-shell";

  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = `
    <thead>
      <tr>
        ${config.columns
          .map(
            (column) =>
              `<th ${column.align === "right" ? 'data-align="right"' : ""}>${column.label}</th>`,
          )
          .join("")}
      </tr>
    </thead>
    <tbody>
      ${config.rows
        .map(
          (row) => `
            <tr>
              ${config.columns
                .map((column) => {
                  const value = column.render(row);
                  const align = column.align === "right" ? ' data-align="right"' : "";
                  return `<td${align}>${value}</td>`;
                })
                .join("")}
            </tr>
          `,
        )
        .join("")}
    </tbody>
  `;

  shell.appendChild(table);
  container.appendChild(shell);
}

function pageTitle(page) {
  return page.title === "/" ? "Главная" : page.title;
}

function humanizeSlug(text) {
  return text.replace(/^\/+/, "").replace(/[-_]+/g, " ").trim();
}

function renderProjectMeta() {
  const meta = document.getElementById("project-meta");
  const sites = data.project.sites || [];
  const visiblePills = (sites.length ? sites : [{ site: data.project.site }]).slice(0, 8);
  const hiddenPillCount = Math.max((sites.length || 1) - visiblePills.length, 0);
  const visibleRows = (sites.length ? sites : [{ site: data.project.site, sessions: data.summary.sessions.value }]).slice(0, 6);
  const hiddenRowCount = Math.max((sites.length || 1) - visibleRows.length, 0);

  meta.innerHTML = `
    <div class="meta-line meta-line--compact">
      <span>Площадки</span>
      <strong class="meta-value--large">${sites.length || 1}</strong>
    </div>
    <div class="meta-line meta-line--compact">
      <span>Период</span>
      <strong>${data.project.range}</strong>
    </div>
    <div class="meta-stack">
      <span>Сайты</span>
      <div class="meta-pills">
        ${visiblePills
          .map((site) => `<span class="meta-pill">${site.site}</span>`)
          .join("")}
        ${hiddenPillCount ? `<span class="meta-pill meta-pill--muted">+${hiddenPillCount} еще</span>` : ""}
      </div>
    </div>
    <div class="meta-stack">
      <span>Вклад по сессиям</span>
      <div class="meta-site-list">
        ${visibleRows
          .map(
            (site) => `
              <div class="meta-site-row">
                <span>${site.site}</span>
                <strong>${formatNumber(site.sessions)}</strong>
              </div>
            `,
          )
          .join("") || '<div class="meta-site-row"><span>Общий сайт</span><strong>1</strong></div>'}
        ${hiddenRowCount ? `<div class="meta-site-note">Показаны топ-${visibleRows.length} площадок, еще ${hiddenRowCount} ниже по дашборду.</div>` : ""}
      </div>
    </div>
  `;
}

function renderSummary() {
  const strip = document.getElementById("summary-strip");
  const mobile = data.summary.devices.find((item) => item.label === "Мобильные");
  const metrics = [
    {
      label: "Сессии",
      value: formatNumber(data.summary.sessions.value),
      meta: formatDelta(data.summary.sessions.delta),
      positive: data.summary.sessions.delta > 0,
    },
    {
      label: "Просмотры",
      value: formatNumber(data.summary.views),
      meta: "за весь период",
    },
    {
      label: "Посетители",
      value: formatNumber(data.summary.visitors),
      meta: "уникальная аудитория",
    },
    {
      label: "Заявки",
      value: formatNumber(data.summary.leads.value),
      meta: formatDelta(data.summary.leads.delta),
      positive: data.summary.leads.delta > 0,
    },
    {
      label: "Конверсия",
      value: formatPercent(data.summary.conversion.value),
      meta: formatDelta(data.summary.conversion.delta),
      positive: data.summary.conversion.delta > 0,
    },
    {
      label: "Мобильный трафик",
      value: formatPercent(mobile.share),
      meta: formatDelta(mobile.delta),
      positive: mobile.delta > 0,
    },
  ];

  strip.innerHTML = metrics
    .map((metric) => {
      const deltaClass =
        metric.meta && metric.meta.startsWith("+")
          ? "delta delta--positive"
          : metric.meta && metric.meta.startsWith("-")
            ? "delta delta--negative"
            : "";
      return `
        <div class="metric">
          <div class="metric__label">${metric.label}</div>
          <span class="metric__value">${metric.value}</span>
          <div class="metric__meta">
            ${metric.meta ? `<span class="${deltaClass}">${metric.meta}</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTraffic() {
  const peakMonth = [...data.monthly].sort((left, right) => right.sessions - left.sessions)[0];
  document.getElementById("traffic-note").textContent =
    `Пик по сессиям: ${peakMonth.label}, ${formatNumber(peakMonth.sessions)}.`;
  renderLineChart(document.getElementById("traffic-chart"), data.monthly, trafficSeries);
}

function renderDevices() {
  const sessions = data.summary.sessions.value;
  const segments = data.summary.devices.map((item) => ({
    label: item.label,
    count: Math.round((sessions * item.share) / 100),
    share: item.share,
  }));

  renderDonutBlock(document.getElementById("device-breakdown"), segments, {
    colors: ["#c36c31", "#365f70"],
    centerLabel: "оценка по сессиям",
    valueFormatter: formatNumber,
  });
}

function renderSources() {
  renderDonutBlock(document.getElementById("source-breakdown"), data.sources.groups, {
    colors: ["#c36c31", "#365f70", "#7b8550", "#d8aa45", "#3b8fca", "#d85bb7", "#8573d8", "#bdb8ad"],
    centerLabel: "сводка категорий Tilda",
    valueFormatter: formatNumber,
  });

  const channelNote = document.getElementById("channel-note");
  makeSegmentedControl(document.getElementById("channel-tabs"), channelViews, (selection) => {
    renderProgressList(document.getElementById("channel-list"), selection.items, {
      color: selection.color,
    });

    if (!channelNote) return;

    const visibleTotal = selection.items.reduce((sum, item) => sum + item.count, 0);
    const groupTotal = sourceGroupLookup.get(selection.groupLabel) || 0;

    if (!selection.items.length) {
      channelNote.textContent = "В этом экспорте Tilda для выбранной категории нет строк детализации.";
      return;
    }

    if (!groupTotal) {
      channelNote.textContent = `Видимая детализация Tilda: ${formatNumber(visibleTotal)}.`;
      return;
    }

    if (visibleTotal === groupTotal) {
      channelNote.textContent = `Детализация совпадает со сводкой Tilda: ${formatNumber(groupTotal)} в категории «${selection.groupLabel}».`;
      return;
    }

    if (visibleTotal < groupTotal) {
      channelNote.textContent =
        `Показаны строки детализации Tilda: ${formatNumber(visibleTotal)} из ${formatNumber(groupTotal)} в категории «${selection.groupLabel}».`;
      return;
    }

    channelNote.textContent =
      `В исходном экспорте Tilda есть расхождение: детализация даёт ${formatNumber(visibleTotal)}, а сводка категории «${selection.groupLabel}» — ${formatNumber(groupTotal)}.`;
  });
}

function renderLeads() {
  const best = [...data.monthly].sort((left, right) => right.leads - left.leads)[0];
  document.getElementById("leads-note").textContent =
    `Лучший месяц: ${best.label}, ${formatNumber(best.leads)} заявок и ${best.conversion.toFixed(2)}% конверсии.`;
  renderBarLineChart(document.getElementById("leads-chart"), data.monthly);
}

function renderGeo() {
  renderProgressList(document.getElementById("country-list"), data.geo.countries, {
    color: "#365f70",
  });
  renderProgressList(document.getElementById("city-list"), data.geo.cities, {
    color: "#7b8550",
  });
}

function renderProductsPanel() {
  const products = [...data.products].sort((left, right) => right.sessions - left.sessions);
  const top = products[0];
  const note = document.getElementById("products-note");

  if (note) {
    note.textContent = top
      ? `${products.length} товаров в экспорте. Лидер: ${humanizeSlug(top.name)}, ${formatNumber(top.sessions)} сессий.`
      : "В экспорте Tilda нет товарной таблицы.";
  }

  if (!products.length) {
    document.getElementById("product-list").innerHTML = "";
    return;
  }

  const items = products.slice(0, 8).map((product) => ({
    label: humanizeSlug(product.name),
    count: product.sessions,
    meta: `${formatNumber(product.views)} просмотров · ${formatNumber(product.visitors)} посетителей`,
  }));

  renderProgressList(document.getElementById("product-list"), items, {
    color: "#c36c31",
    subtitle: (item) => item.meta,
  });
}

function renderLeadSites() {
  const container = document.getElementById("lead-sites-table");
  const note = document.getElementById("lead-sites-note");

  if (!container || !note) return;

  const sites = [...(data.project.sites || [])].sort(
    (left, right) => right.leads - left.leads || right.sessions - left.sessions,
  );
  const totalLeads = sites.reduce((sum, site) => sum + (site.leads || 0), 0);
  const activeSites = sites.filter((site) => site.leads > 0).length;

  note.textContent = sites.length
    ? `${formatNumber(totalLeads)} заявок = сумма карточек «Заявки» из ${formatNumber(sites.length)} сайтов. Заявки есть у ${formatNumber(activeSites)} из них.`
    : "В проекте нет списка сайтов для разреза по заявкам.";

  if (!sites.length) {
    container.innerHTML = "";
    return;
  }

  renderTable(container, {
    className: "table-shell table-shell--compact",
    columns: [
      {
        label: "Сайт",
        render: (site) => `
          <div class="row-title">${site.site}</div>
          <div class="row-subtitle">${formatNumber(site.sessions)} сессий · ${formatNumber(site.views)} просмотров</div>
        `,
      },
      {
        label: "Заявки",
        align: "right",
        render: (site) => `<span class="row-kpi">${formatNumber(site.leads)}</span>`,
      },
      {
        label: "Доля",
        align: "right",
        render: (site) => `<span class="row-share">${totalLeads ? formatPercent((site.leads / totalLeads) * 100) : "0.00%"}</span>`,
      },
      {
        label: "Конверсия",
        align: "right",
        render: (site) => `<span class="row-share">${site.sessions ? formatPercent((site.leads / site.sessions) * 100) : "0.00%"}</span>`,
      },
    ],
    rows: sites,
  });
}

function renderContent() {
  makeSegmentedControl(document.getElementById("content-tabs"), contentViews, (selection) => {
    const target = document.getElementById("content-table");

    if (selection.id === "pages") {
      renderTable(target, {
        columns: [
          {
            label: "Страница",
            render: (page) => `
              <div class="row-title">${pageTitle(page)}</div>
              <div class="row-subtitle">${page.url}${page.sites ? ` · ${page.sites.join(" + ")}` : ""}</div>
            `,
          },
          { label: "Просмотры", align: "right", render: (page) => `<span class="row-kpi">${formatNumber(page.views)}</span>` },
          { label: "Сессии", align: "right", render: (page) => `<span class="row-kpi">${formatNumber(page.sessions)}</span>` },
          { label: "Посетители", align: "right", render: (page) => `<span class="row-kpi">${formatNumber(page.visitors)}</span>` },
        ],
        rows: data.pages.slice(0, 16),
      });
    }

    if (selection.id === "products") {
      renderTable(target, {
        columns: [
          {
            label: "Товар",
            render: (product) => `
              <div class="row-title">${humanizeSlug(product.name)}</div>
              <div class="row-subtitle">${product.url}${product.sites ? ` · ${product.sites.join(" + ")}` : ""}</div>
            `,
          },
          { label: "Просмотры", align: "right", render: (product) => `<span class="row-kpi">${formatNumber(product.views)}</span>` },
          { label: "Сессии", align: "right", render: (product) => `<span class="row-kpi">${formatNumber(product.sessions)}</span>` },
          { label: "Посетители", align: "right", render: (product) => `<span class="row-kpi">${formatNumber(product.visitors)}</span>` },
        ],
        rows: data.products,
      });
    }

    if (selection.id === "events") {
      renderTable(target, {
        columns: [
          {
            label: "Событие",
            render: (event) => `
              <div class="row-title">${humanizeSlug(event.label)}</div>
              <div class="row-subtitle">${event.type} · ${event.id}${event.sites ? ` · ${event.sites.join(" + ")}` : ""}</div>
            `,
          },
          { label: "Сессии", align: "right", render: (event) => `<span class="row-kpi">${formatNumber(event.sessions)}</span>` },
          { label: "Количество", align: "right", render: (event) => `<span class="row-kpi">${formatNumber(event.count)}</span>` },
        ],
        rows: data.events.slice(0, 16),
      });
    }

    if (selection.id === "utm") {
      renderTable(target, {
        columns: [
          {
            label: "UTM",
            render: (utm) => `
              <div class="row-title">${utm.name}</div>
            `,
          },
          { label: "Сессии", align: "right", render: (utm) => `<span class="row-kpi">${formatNumber(utm.sessions)}</span>` },
          { label: "Заявки", align: "right", render: (utm) => `<span class="row-kpi">${formatNumber(utm.leads)}</span>` },
          { label: "Конверсия", align: "right", render: (utm) => `<span class="row-kpi">${utm.conversion.toFixed(2)}%</span>` },
        ],
        rows: data.utm,
      });
    }
  });
}

function applyRevealDelays() {
  document.querySelectorAll(".reveal").forEach((node, index) => {
    node.style.setProperty("--delay", `${index * 70}ms`);
  });
}

function init() {
  if (!data) return;
  renderProjectMeta();
  renderSummary();
  renderTraffic();
  renderDevices();
  renderSources();
  renderLeads();
  renderLeadSites();
  renderGeo();
  renderProductsPanel();
  renderContent();
  applyRevealDelays();
}

init();
