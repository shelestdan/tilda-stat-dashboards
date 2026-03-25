(async function () {
  const mount = document.querySelector("[data-auth-guard]");
  const source = document.documentElement.dataset.dashboardSource;

  if (!source || !window.TildaAuth) {
    return;
  }

  try {
    window.TILDA_STATS_DATA = await window.TildaAuth.loadEncryptedJson(source);
    await window.TildaAuth.loadScript("app.js");
    document.documentElement.classList.add("auth-ready");
  } catch (error) {
    if (String(error.message || "").startsWith("AUTH_")) {
      return;
    }

    document.documentElement.classList.add("auth-ready");

    if (mount) {
      mount.innerHTML = `
        <section class="panel">
          <div class="panel__head panel__head--stack">
            <div>
              <div class="panel__eyebrow">Ошибка</div>
              <h2>Дашборд не удалось загрузить</h2>
            </div>
            <p class="panel__sub">${error.message}</p>
          </div>
        </section>
      `;
    }
  }
})();
