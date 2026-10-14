
"use strict";

(() => {
  const LIMITE_MINUTOS = 30;

  const STORAGE_KEY = "aiCasinoAnalyzer_dailyLimit_v1";
  const LEADER_KEY = "aiCasinoAnalyzer_dailyLimit_leader_v1";

  const LEADER_DURATION = 5000;
  const SAVE_INTERVAL = 1000;

  const $ = (selector) => document.querySelector(selector);

  const frame = $("#platformFrame");
  const shell = document.querySelector(".frame-shell");
  const form = $("#platformForm");
  const urlInput = $("#platformUrl");

  if (!frame || !shell) {
    console.error("[Limite diário] Iframe ou contêiner não encontrado.");
    return;
  }

  const LIMITE_MS = LIMITE_MINUTOS * 60 * 1000;
  const TAB_ID =
    Date.now().toString(36) +
    Math.random().toString(36).slice(2);

  let lastTick = Date.now();
  let lastSave = 0;
  let locked = false;
  let originalFormState = null;

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  function nextMidnight() {
    const date = new Date();
    date.setHours(24, 0, 0, 0);
    return date;
  }

  function readState() {
    const today = localDateKey();

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : null;

      if (!saved || saved.date !== today) {
        return {
          date: today,
          usedMs: 0
        };
      }

      const usedMs = Number(saved.usedMs);

      return {
        date: today,
        usedMs: Number.isFinite(usedMs)
          ? Math.max(0, Math.min(usedMs, LIMITE_MS))
          : 0
      };
    } catch (error) {
      console.error("[Limite diário] Erro ao ler o estado:", error);

      return {
        date: today,
        usedMs: LIMITE_MS
      };
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          date: localDateKey(),
          usedMs: Math.min(
            LIMITE_MS,
            Math.max(0, state.usedMs)
          )
        })
      );
    } catch (error) {
      console.error("[Limite diário] Não foi possível salvar:", error);
    }
  }

  function readLeader() {
    try {
      const raw = localStorage.getItem(LEADER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function acquireLeadership() {
    const now = Date.now();
    const leader = readLeader();

    if (
      !leader ||
      !Number.isFinite(leader.expiresAt) ||
      leader.expiresAt <= now ||
      leader.id === TAB_ID
    ) {
      try {
        localStorage.setItem(
          LEADER_KEY,
          JSON.stringify({
            id: TAB_ID,
            expiresAt: now + LEADER_DURATION
          })
        );
      } catch {
        return false;
      }
    }

    const current = readLeader();
    return current?.id === TAB_ID;
  }

  function renewLeadership() {
    try {
      const leader = readLeader();

      if (leader?.id === TAB_ID) {
        localStorage.setItem(
          LEADER_KEY,
          JSON.stringify({
            id: TAB_ID,
            expiresAt: Date.now() + LEADER_DURATION
          })
        );
      }
    } catch {
      // O próximo ciclo tentará novamente.
    }
  }

  function isPlatformConfigured() {
    const src = frame.getAttribute("src") || "";

    return (
      src !== "" &&
      src !== "about:blank" &&
      !src.startsWith("javascript:")
    );
  }

  function isUsageActive() {
    return (
      document.visibilityState === "visible" &&
      isPlatformConfigured() &&
      !locked
    );
  }

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return (
      String(minutes).padStart(2, "0") +
      ":" +
      String(seconds).padStart(2, "0")
    );
  }

  function createOverlay() {
    let overlay = $("#dailyLimitOverlay");

    if (overlay) return overlay;

    overlay = document.createElement("section");
    overlay.id = "dailyLimitOverlay";
    overlay.className = "daily-limit-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");

    overlay.innerHTML = `
      <div class="daily-limit-card">
        <div class="daily-limit-icon" aria-hidden="true">⌛</div>

        <span class="daily-limit-label">
          CONTROLE DE ACESSO
        </span>

        <h2>LIMITE DIÁRIO ATINGIDO</h2>

        <p>
          Você atingiu seu limite de uso de hoje.
          O acesso será liberado automaticamente amanhã.
        </p>

        <div class="daily-limit-release">
          <span>Próxima liberação</span>
          <strong id="dailyLimitReleaseTime">00:00</strong>
        </div>

        <div class="daily-limit-usage">
          Limite diário: ${LIMITE_MINUTOS} minutos
        </div>
      </div>
    `;

    shell.appendChild(overlay);
    return overlay;
  }

  const overlay = createOverlay();

  function setFormDisabled(disabled) {
    if (!form) return;

    const controls = form.querySelectorAll(
      "input, button, select, textarea"
    );

    if (disabled) {
      if (!originalFormState) {
        originalFormState = [...controls].map((element) => ({
          element,
          disabled: element.disabled
        }));
      }

      controls.forEach((element) => {
        element.disabled = true;
      });

      if (urlInput) {
        urlInput.setAttribute("aria-disabled", "true");
      }
    } else {
      if (originalFormState) {
        originalFormState.forEach(({ element, disabled: wasDisabled }) => {
          if (element.isConnected) {
            element.disabled = wasDisabled;
          }
        });
      }

      originalFormState = null;

      if (urlInput) {
        urlInput.removeAttribute("aria-disabled");
      }
    }
  }

  function blockPlatform() {
    locked = true;

    overlay.hidden = false;
    setFormDisabled(true);

    frame.removeAttribute("src");
    frame.style.display = "none";

    const placeholder = $("#framePlaceholder");
    if (placeholder) {
      placeholder.hidden = true;
    }

    const release = $("#dailyLimitReleaseTime");
    if (release) {
      release.textContent = nextMidnight().toLocaleString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
      });
    }

    const status = $("#platformStatus");
    if (status) {
      status.textContent = "LIMITE DIÁRIO ATINGIDO";
    }
  }

  function unblockPlatform() {
    locked = false;

    overlay.hidden = true;
    frame.style.display = "";

    setFormDisabled(false);

    const status = $("#platformStatus");
    if (status && status.textContent === "LIMITE DIÁRIO ATINGIDO") {
      status.textContent = "PLATAFORMA DISPONÍVEL";
    }

    // O script principal poderá restaurar a URL salva.
    // Não abre automaticamente um endereço desconhecido.
  }

  function reconcile() {
    const state = readState();

    if (state.usedMs >= LIMITE_MS) {
      blockPlatform();
    } else {
      unblockPlatform();
    }

    return state;
  }

  function tick() {
    const now = Date.now();
    const delta = Math.min(now - lastTick, SAVE_INTERVAL * 2);

    lastTick = now;

    let state = reconcile();

    if (state.usedMs >= LIMITE_MS) {
      blockPlatform();
      return;
    }

    if (acquireLeadership()) {
      renewLeadership();

      if (isUsageActive()) {
        state.usedMs = Math.min(
          LIMITE_MS,
          state.usedMs + Math.max(0, delta)
        );

        saveState(state);
      }
    }

    state = reconcile();

    if (state.usedMs >= LIMITE_MS) {
      saveState(state);
      blockPlatform();
    }

    lastSave = now;
  }

  function refreshOnReturn() {
    lastTick = Date.now();

    const state = reconcile();

    if (state.usedMs < LIMITE_MS) {
      acquireLeadership();
    }
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === LEADER_KEY) {
      reconcile();
    }
  });

  window.addEventListener("pageshow", refreshOnReturn);
  window.addEventListener("focus", refreshOnReturn);

  document.addEventListener("visibilitychange", refreshOnReturn);

  if (form) {
    form.addEventListener(
      "submit",
      (event) => {
        if (reconcile().usedMs >= LIMITE_MS) {
          event.preventDefault();
          event.stopImmediatePropagation();
          blockPlatform();
        }
      },
      true
    );
  }

  // Impede que o script principal volte a abrir o iframe
  // enquanto o limite estiver esgotado.
  const observer = new MutationObserver(() => {
    if (reconcile().usedMs >= LIMITE_MS) {
      frame.removeAttribute("src");
      frame.style.display = "none";
      overlay.hidden = false;
    }
  });

  observer.observe(frame, {
    attributes: true,
    attributeFilter: ["src"]
  });

  // Verifica a mudança da data local e salva o uso periodicamente.
  setInterval(() => {
    tick();

    if (Date.now() - lastSave >= SAVE_INTERVAL) {
      const state = readState();
      saveState(state);
      lastSave = Date.now();
    }
  }, SAVE_INTERVAL);

  reconcile();
  console.info("[Limite diário] Controle iniciado.");
})();
