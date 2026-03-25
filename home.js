const DASHBOARD_REGISTRY = [
  {
    id: "rvz",
    title: "RVZ",
    description: "Основной сайт и промо-зеркало в одном рабочем дашборде.",
    pageUrl: "rvz.html",
    dataUrl: "data/site-stats.enc.json",
    accent: "copper",
  },
  {
    id: "vgs2000",
    title: "VGS2000",
    description: "Сводная статистика по всей группе сайтов VGS2000.",
    pageUrl: "vgs2000.html",
    dataUrl: "data/vgs2000-stats.enc.json",
    accent: "slate",
  },
];

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function formatPercent(value, digits = 2) {
  return `${Number(value).toFixed(digits)}%`;
}

function pluralizeDashboards(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "дашборд";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "дашборда";
  return "дашбордов";
}

function pluralizeSites(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "сайт";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "сайта";
  return "сайтов";
}

function applyRevealDelays() {
  document.querySelectorAll(".reveal").forEach((node, index) => {
    node.style.setProperty("--delay", `${index * 70}ms`);
  });
}

function renderHubOverview(dashboards) {
  const target = document.getElementById("hub-overview");
  const ranges = [...new Set(dashboards.map((item) => item.stats.project.range).filter(Boolean))];
  const totalSites = dashboards.reduce(
    (sum, item) => sum + (((item.stats.project.sites || []).length || 1)),
    0,
  );

  target.innerHTML = `
    <div class="meta-line meta-line--compact">
      <span>Дашборды</span>
      <strong class="meta-value--large">${dashboards.length}</strong>
    </div>
    <div class="meta-line meta-line--compact">
      <span>Площадки</span>
      <strong>${formatNumber(totalSites)}</strong>
    </div>
    <div class="meta-line meta-line--compact">
      <span>Период</span>
      <strong>${ranges.length === 1 ? ranges[0] : "периоды указаны в карточках"}</strong>
    </div>
    <div class="meta-stack">
      <span>Подключено сейчас</span>
      <div class="meta-pills">
        ${dashboards.map((item) => `<span class="meta-pill">${item.title}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderHubSummary(dashboards) {
  const target = document.getElementById("hub-summary");
  const totals = dashboards.reduce(
    (acc, item) => {
      acc.sites += (item.stats.project.sites || []).length || 1;
      acc.sessions += item.stats.summary.sessions.value;
      acc.views += item.stats.summary.views;
      acc.visitors += item.stats.summary.visitors;
      acc.leads += item.stats.summary.leads.value;
      return acc;
    },
    { sites: 0, sessions: 0, views: 0, visitors: 0, leads: 0 },
  );

  const metrics = [
    {
      label: "Каталог",
      value: `${dashboards.length} ${pluralizeDashboards(dashboards.length)}`,
      meta: `${formatNumber(totals.sites)} площадок внутри`,
    },
    {
      label: "Сессии",
      value: formatNumber(totals.sessions),
      meta: "по всем карточкам ниже",
    },
    {
      label: "Просмотры",
      value: formatNumber(totals.views),
      meta: "общий обзор каталога",
    },
    {
      label: "Посетители",
      value: formatNumber(totals.visitors),
      meta: "суммарно по дашбордам",
    },
    {
      label: "Заявки Tilda",
      value: formatNumber(totals.leads),
      meta: "сумма всех подключенных проектов",
    },
  ];

  target.innerHTML = metrics
    .map(
      (metric) => `
        <div class="metric">
          <div class="metric__label">${metric.label}</div>
          <span class="metric__value">${metric.value}</span>
          <div class="metric__meta">${metric.meta}</div>
        </div>
      `,
    )
    .join("");
}

function renderCards(dashboards) {
  const target = document.getElementById("dashboard-catalog");

  target.innerHTML = dashboards
    .map((item) => {
      const sites = [...(item.stats.project.sites || [])].sort((left, right) => right.sessions - left.sessions);
      const topSites = sites.slice(0, 4);
      const activeLeadSites = sites.filter((site) => site.leads > 0).length;

      return `
        <a class="panel dashboard-tile dashboard-tile--${item.accent} reveal" href="${item.pageUrl}">
          <div class="dashboard-tile__head">
            <div>
              <div class="panel__eyebrow">${formatNumber(sites.length || 1)} ${pluralizeSites(sites.length || 1)} в группе</div>
              <h2>${item.title}</h2>
              <p class="panel__sub">${item.description}</p>
            </div>
            <span class="dashboard-tile__cta">Открыть дашборд</span>
          </div>

          <div class="dashboard-tile__metrics">
            <div class="dashboard-tile__metric">
              <span>Сессии</span>
              <strong>${formatNumber(item.stats.summary.sessions.value)}</strong>
            </div>
            <div class="dashboard-tile__metric">
              <span>Просмотры</span>
              <strong>${formatNumber(item.stats.summary.views)}</strong>
            </div>
            <div class="dashboard-tile__metric">
              <span>Посетители</span>
              <strong>${formatNumber(item.stats.summary.visitors)}</strong>
            </div>
            <div class="dashboard-tile__metric">
              <span>Заявки</span>
              <strong>${formatNumber(item.stats.summary.leads.value)}</strong>
            </div>
          </div>

          <div class="dashboard-tile__footer">
            <div class="dashboard-tile__meta">
              <span>Период: ${item.stats.project.range}</span>
              <span>Заявки есть у ${formatNumber(activeLeadSites)} из ${formatNumber(sites.length || 1)} сайтов</span>
              <span>Конверсия: ${formatPercent(item.stats.summary.conversion.value)}</span>
            </div>
            <div class="dashboard-tile__site-pills">
              ${topSites.map((site) => `<span class="dashboard-tile__site-pill">${site.site}</span>`).join("")}
            </div>
          </div>
        </a>
      `;
    })
    .join("");
}

function renderError(message) {
  const target = document.getElementById("dashboard-catalog");
  target.innerHTML = `
    <article class="panel reveal">
      <div class="panel__head panel__head--stack">
        <div>
          <div class="panel__eyebrow">Ошибка загрузки</div>
          <h2>Не удалось собрать главную страницу</h2>
        </div>
        <p class="panel__sub">${message}</p>
      </div>
    </article>
  `;
  applyRevealDelays();
}

async function init() {
  try {
    await window.TildaAuth.requireAuth();

    const dashboards = await Promise.all(
      DASHBOARD_REGISTRY.map(async (item) => {
        const stats = await window.TildaAuth.loadEncryptedJson(item.dataUrl);
        return { ...item, stats };
      }),
    );

    renderHubOverview(dashboards);
    renderHubSummary(dashboards);
    renderCards(dashboards);
    document.documentElement.classList.add("auth-ready");
    applyRevealDelays();
  } catch (error) {
    renderError(error.message);
  }
}

init();
