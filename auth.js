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
    if (!config || username !== config.username) {
      return false;
    }

    const digest = await pbkdf2Bytes(
      `${username}:${password}`,
      config.auth.salt,
      config.auth.iterations,
      32,
    );

    return bytesToBase64(digest) === config.auth.hash;
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
      const keyBytes = await pbkdf2Bytes(
        session.password,
        payload.kdf.salt,
        payload.kdf.iterations,
        32,
      );
      const key = await window.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: base64ToBytes(payload.iv),
        },
        key,
        base64ToBytes(payload.ciphertext),
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

    document.documentElement.classList.add("auth-ready");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearLoginError();

      const username = form.username.value.trim();
      const password = form.password.value;

      if (!username || !password) {
        showLoginError("Введите логин и пароль.");
        return;
      }

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
