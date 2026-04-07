(function () {
  const config = window.TILDA_AUTH_CONFIG;
  const STORAGE_KEY = "tilda_dashboard_auth_v1";
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function currentRelativePath() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    return `${path}${window.location.search}${window.location.hash}`;
  }

  function bytesToBase64(bytes) {
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = window.atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  async function pbkdf2Bytes(secret, salt, iterations, length) {
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      "PBKDF2",
      false,
      ["deriveBits"],
    );

    const derived = await window.crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: base64ToBytes(salt),
        iterations,
      },
      keyMaterial,
      length * 8,
    );

    return new Uint8Array(derived);
  }

  async function validateCredentials(username, password) {
    if (!config) {
      return false;
    }

    const entries = [];
    if (Array.isArray(config.users)) {
      entries.push(...config.users);
    }
    if (config.username && config.auth && !entries.some((entry) => entry.username === config.username)) {
      entries.push({ username: config.username, auth: config.auth });
    }

    const match = entries.find((entry) => entry && entry.username === username && entry.auth);
    if (!match) {
      return false;
    }

    const digest = await pbkdf2Bytes(
      `${username}:${password}`,
      match.auth.salt,
      match.auth.iterations,
      32,
    );

    return bytesToBase64(digest) === match.auth.hash;
  }

  function getSession() {
    try {
      return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "null");
    } catch (error) {
      return null;
    }
  }

  function setSession(session) {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }

  function clearSession() {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }

  function buildLoginUrl(nextPath) {
    const target = nextPath || currentRelativePath();
    if (!target || target === "index.html") {
      return "index.html";
    }
    return `index.html?next=${encodeURIComponent(target)}`;
  }

  function redirectToLogin(nextPath) {
    window.location.replace(buildLoginUrl(nextPath));
  }

  function bindLogoutControls() {
    document.querySelectorAll("[data-auth-logout]").forEach((button) => {
      button.addEventListener("click", () => {
        clearSession();
        redirectToLogin("index.html");
      });
    });
  }

  async function requireAuth(options = {}) {
    const shouldRedirect = options.redirect !== false;
    const session = getSession();

    if (!session || !session.username || !session.password) {
      if (shouldRedirect) {
        redirectToLogin(currentRelativePath());
      }
      throw new Error("AUTH_REQUIRED");
    }

    const valid = await validateCredentials(session.username, session.password);

    if (!valid) {
      clearSession();
      if (shouldRedirect) {
        redirectToLogin(currentRelativePath());
      }
      throw new Error("AUTH_INVALID");
    }

    document.documentElement.classList.add("auth-ready");
    return session;
  }

  async function loadEncryptedJson(path) {
    const session = await requireAuth();
    const response = await window.fetch(path, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Не удалось загрузить ${path}`);
    }

    const payload = await response.json();

    try {
      let key;

      if (payload.wrappedKeys && payload.wrappedKeys[session.username]) {
        const wrapped = payload.wrappedKeys[session.username];
        const passwordKeyBytes = await pbkdf2Bytes(
          session.password,
          wrapped.kdf.salt,
          wrapped.kdf.iterations,
          32,
        );
        const passwordKey = await window.crypto.subtle.importKey("raw", passwordKeyBytes, "AES-GCM", false, ["decrypt"]);
        const contentKeyBytes = await window.crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv: base64ToBytes(wrapped.iv),
          },
          passwordKey,
          base64ToBytes(wrapped.ciphertext),
        );
        key = await window.crypto.subtle.importKey("raw", new Uint8Array(contentKeyBytes), "AES-GCM", false, ["decrypt"]);
      } else {
        const legacyPayload = payload.legacy || payload;
        const keyBytes = await pbkdf2Bytes(
          session.password,
          legacyPayload.kdf.salt,
          legacyPayload.kdf.iterations,
          32,
        );
        key = await window.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      }

      const activePayload = payload.wrappedKeys && payload.wrappedKeys[session.username] ? payload : (payload.legacy || payload);
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(activePayload.iv),
        },
        key,
        base64ToBytes(activePayload.ciphertext),
      );

      return JSON.parse(decoder.decode(new Uint8Array(decrypted)));
    } catch (error) {
      clearSession();
      redirectToLogin(currentRelativePath());
      throw new Error("Не удалось расшифровать защищенные данные.");
    }
  }

  function loadScript(path) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = path;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Не удалось загрузить ${path}`));
      document.body.appendChild(script);
    });
  }

  function showLoginError(message) {
    const errorNode = document.getElementById("login-error");
    if (!errorNode) return;
    errorNode.hidden = false;
    errorNode.textContent = message;
  }

  function clearLoginError() {
    const errorNode = document.getElementById("login-error");
    if (!errorNode) return;
    errorNode.hidden = true;
    errorNode.textContent = "";
  }

  function nextPathFromQuery() {
    const params = new URLSearchParams(window.location.search);
    return params.get("next") || "hub.html";
  }

  async function initLoginPage() {
    try {
      const session = getSession();
      if (session && (await validateCredentials(session.username, session.password))) {
        window.location.replace(nextPathFromQuery());
        return;
      }
    } catch (error) {
      clearSession();
    }

    const form = document.getElementById("login-form");
    if (!form) return;
    const submitButton = form.querySelector(".auth-submit");

    document.documentElement.classList.add("auth-ready");

    form.addEventListener("input", () => {
      clearLoginError();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearLoginError();

      const username = form.username.value.trim();
      const password = form.password.value;

      if (!username || !password) {
        showLoginError("Введите логин и пароль.");
        return;
      }

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.classList.add("is-busy");
        submitButton.textContent = "Проверяем доступ...";
      }

      try {
        const isValid = await validateCredentials(username, password);
        if (!isValid) {
          showLoginError("Неверный логин или пароль.");
          return;
        }

        setSession({
          username,
          password,
          createdAt: new Date().toISOString(),
        });

        window.location.replace(nextPathFromQuery());
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.classList.remove("is-busy");
          submitButton.textContent = "Войти в дашборды";
        }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindLogoutControls, { once: true });
  } else {
    bindLogoutControls();
  }

  window.TildaAuth = {
    bindLogoutControls,
    clearSession,
    getSession,
    initLoginPage,
    loadEncryptedJson,
    loadScript,
    redirectToLogin,
    requireAuth,
  };

  if (document.documentElement.dataset.protected === "true") {
    requireAuth().catch(() => {});
  }
})();
