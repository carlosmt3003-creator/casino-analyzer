
"use strict";

(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const STORAGE_KEY = "aiCasinoAnalyzerPro_v1";
  const COOLDOWN_MS = 80 * 1000;
  const ANALYSIS_DELAY_MS = 2500;

  const gameNames = {
    roulette: "Roleta Brasileira",
    immersive: "Roleta Immersive",
    sicbo: "Mega Sic Bo",
    bacbo: "Bac Bo"
  };

  let selectedGame = "roulette";
  let analyzing = false;
  let analysisTimeout = null;

  const data = loadData();

  // =========================
  // ARMAZENAMENTO
  // =========================

  function loadData() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(STORAGE_KEY) || "null"
      );

      if (saved && typeof saved === "object") {
        return {
          histories: saved.histories || {},
          cooldowns: saved.cooldowns || {},
          lastAnalyses: saved.lastAnalyses || {},
          platformUrls: saved.platformUrls || {}
        };
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }

    return {
      histories: {},
      cooldowns: {},
      lastAnalyses: {},
      platformUrls: {}
    };
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error("Erro ao salvar dados:", error);

      const message = $("#actionMessage");
      if (message) {
        message.textContent = "Erro ao salvar os dados no navegador.";
      }

      return false;
    }
  }

  function getHistory(game = selectedGame) {
    if (!Array.isArray(data.histories[game])) {
      data.histories[game] = [];
    }

    return data.histories[game];
  }

  function normalizeResult(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
  }

  function setMessage(message) {
    const element = $("#actionMessage");
    if (element) element.textContent = message;
  }

  // =========================
  // BOTÕES DE REGISTRO RÁPIDO
  // =========================

  function renderQuickEntryButtons() {
    const container = $("#quickEntryButtons");
    const title = $("#quickEntryTitle");
    const description = $("#quickEntryDescription");

    if (!container || !title || !description) {
      console.error("Verifique os elementos do painel de registro rápido no HTML.");
      return;
    }

    container.replaceChildren();

    const isRoulette =
      selectedGame === "roulette" ||
      selectedGame === "immersive";

    if (isRoulette) {
      title.textContent = "Histórico rápido da roleta";
      description.textContent =
        "Clique no número que acabou de sair, de 0 a 36.";

      const redNumbers = new Set([
        1, 3, 5, 7, 9, 12, 14, 16, 18,
        19, 21, 23, 25, 27, 30, 32, 34, 36
      ]);

      for (let number = 0; number <= 36; number++) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "quick-result";

        if (number === 0) {
          button.classList.add("roulette-zero");
        } else if (redNumbers.has(number)) {
          button.classList.add("roulette-red");
        } else {
          button.classList.add("roulette-black");
        }

        button.textContent = String(number);
        button.dataset.result = String(number);
        button.setAttribute(
          "aria-label",
          `Registrar número ${number}`
        );

        container.append(button);
      }

      return;
    }

    title.textContent =
      selectedGame === "bacbo"
        ? "Histórico rápido do Bac Bo"
        : "Histórico rápido do Mega Sic Bo";

    description.textContent =
      "Clique na cor correspondente ao resultado da mesa.";

    const outcomes = [
      {
        value: "Azul",
        className: "player",
        label: "🔵"
      },
      {
        value: "Vermelho",
        className: "banker",
        label: "🔴"
      },
      {
        value: "Empate",
        className: "tie",
        label: "🟢"
      }
    ];

    outcomes.forEach(({ value, className, label }) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = `quick-result ${className}`;
      button.textContent = label;
      button.dataset.result = value;
      button.title = value;
      button.setAttribute(
        "aria-label",
        `Registrar resultado ${value}`
      );

      container.append(button);
    });
  }

  function registerQuickResult(value) {
    const history = getHistory();

    const item = {
      value: String(value),
      timestamp: Date.now(),
      source: "quick-button"
    };

    history.unshift(item);

    if (!saveData()) {
      history.shift();
      return;
    }

    setMessage(
      `Resultado ${value} registrado no histórico de ${gameNames[selectedGame]}.`
    );

    render();
  }

  // =========================
  // OPÇÕES DE ANÁLISE
  // =========================

  function makeEntry(name, description, category) {
    return { name, description, category };
  }

  function wheelNeighbors(wheel, number, radius) {
    const index = wheel.indexOf(number);
    if (index < 0) return [];

    const result = [];

    for (let offset = -radius; offset <= radius; offset++) {
      result.push(
        wheel[(index + offset + wheel.length) % wheel.length]
      );
    }

    return result;
  }

  function rouletteEntries() {
    const entries = [];

    for (const [a, b] of [[1, 2], [1, 3], [2, 3]]) {
      entries.push(
        makeEntry(
          `Dúzia ${a} + Dúzia ${b}`,
          `Combinação das dúzias ${a} e ${b}. Fazer a proteção no zero!.`,
          "Dúzias"
        )
      );
    }

    for (const [a, b] of [[1, 2], [1, 3], [2, 3]]) {
      entries.push(
        makeEntry(
          `Coluna ${a} + Coluna ${b}`,
          `Combinação das colunas ${a} e ${b}. Fazer a proteção no zero!.`,
          "Colunas"
        )
      );
    }

    const externalBets = [
      ["Pares", "Números pares de 2 a 36."],
      ["Ímpares", "Números ímpares de 1 a 35."],
      ["Baixos (1–18)", "Números de 1 a 18."],
      ["Altos (19–36)", "Números de 19 a 36."],
      ["Vermelho", "Fazer a proteção no zero!"],
      ["Preto", "Fazer a proteção no zero!"]
    ];

    for (const [name, description] of externalBets) {
      entries.push(makeEntry(name, description, "Apostas externas"));
    }

    const wheel = [
      0, 32, 15, 19, 4, 21, 2, 25, 17, 34,
      6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
      24, 16, 33, 1, 20, 14, 31, 9, 22, 18,
      29, 7, 28, 12, 35, 3, 26
    ];

    for (const [a, b] of [[9, 17], [8, 18], [26, 30], [19, 20]]) {
      const numbersA = wheelNeighbors(wheel, a, 2);
      const numbersB = wheelNeighbors(wheel, b, 2);
      const combined = [...new Set([...numbersA, ...numbersB])];

      entries.push(
        makeEntry(
          `Curva ${a} e ${b}`,
          `Cinco casas ao redor de ${a}: ${numbersA.join(", ")}. ` +
          `Cinco casas ao redor de ${b}: ${numbersB.join(", ")}. ` +
          `União: ${combined.join(", ")}.`,
          "Curvas"
        )
      );
    }

    return entries;
  }

  function sicboEntries() {
    const entries = [];

    for (let a = 1; a <= 4; a++) {
      for (let b = a + 1; b <= 5; b++) {
        for (let c = b + 1; c <= 6; c++) {
          entries.push(
            makeEntry(
              `Combinação ${a}–${b}–${c}`,
              `Faces selecionadas: ${a}, ${b} e ${c}..`,
              "Combinação de faces"
            )
          );
        }
      }
    }

    entries.push(
      makeEntry("Azul", "Resultado Azul.", "Resultados"),
      makeEntry("Vermelho", "Resultado Vermelho.", "Resultados"),
      makeEntry("Empate", "Resultado Empate", "Resultados")
    );

    return entries;
  }

  function bacboEntries() {
    return [
      makeEntry("Azul", "Resultado Azul, conforme as regras da mesa.", "Resultados"),
      makeEntry("Vermelho", "Resultado Vermelho, conforme as regras da mesa.", "Resultados"),
      makeEntry("Empate", "Resultado Empate, conforme as regras da mesa.", "Resultados")
    ];
  }

  function getEntries(game = selectedGame) {
    if (game === "roulette" || game === "immersive") {
      return rouletteEntries();
    }

    if (game === "sicbo") return sicboEntries();
    if (game === "bacbo") return bacboEntries();

    return [];
  }

  // =========================
  // SELEÇÃO DO JOGO
  // =========================

  function updateGame(game) {
    if (!gameNames[game]) return;

    selectedGame = game;
    analyzing = false;
    clearTimeout(analysisTimeout);

    $$(".tab").forEach((tab) => {
      const active = tab.dataset.game === game;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", String(active));
    });

    const gameTitle = $("#gameTitle");
    const platformTitle = $("#platformTitle");
    const platformUrl = $("#platformUrl");
    const platformStatus = $("#platformStatus");
    const platformFrame = $("#platformFrame");
    const placeholder = $("#framePlaceholder");
    const resultCard = $("#resultCard");
    const progress = $("#analysisProgress");

    if (gameTitle) gameTitle.textContent = gameNames[game];
    if (platformTitle) platformTitle.textContent = gameNames[game];

    const savedUrl = data.platformUrls[game] || "";

    if (platformUrl) platformUrl.value = savedUrl;

    if (platformStatus) {
      platformStatus.textContent = savedUrl
        ? "URL CONFIGURADA"
        : "URL NÃO CONFIGURADA";
    }

    if (platformFrame) {
      platformFrame.src = savedUrl || "about:blank";
    }

    if (placeholder) placeholder.hidden = Boolean(savedUrl);
    if (resultCard) resultCard.hidden = true;
    if (progress) progress.hidden = true;

    setMessage("Registre resultados reais ou execute uma seleção de entrada.");

    renderQuickEntryButtons();
    render();
  }

  // =========================
  // TEMPORIZADOR
  // =========================

  function formatTime(milliseconds) {
    const totalSeconds = Math.ceil(Math.max(0, milliseconds) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function remainingCooldown() {
    return Math.max(
      0,
      Number(data.cooldowns[selectedGame] || 0) - Date.now()
    );
  }

  function updateTimer() {
    const timer = $("#timerDisplay");
    const analyzeBtn = $("#analyzeBtn");

    if (timer) {
      timer.textContent = formatTime(remainingCooldown());
    }

    if (analyzeBtn) {
      analyzeBtn.disabled = analyzing || remainingCooldown() > 0;
    }
  }

  // =========================
  // ANÁLISE
  // =========================

  function analyze() {
    if (analyzing || remainingCooldown() > 0) {
      updateTimer();
      return;
    }

    analyzing = true;

    const analyzeBtn = $("#analyzeBtn");
    const resultCard = $("#resultCard");
    const progress = $("#analysisProgress");

    if (analyzeBtn) analyzeBtn.disabled = true;
    if (resultCard) resultCard.hidden = true;
    if (progress) progress.hidden = false;

    setMessage("Preparando uma opção cadastrada...");

    const gameAtStart = selectedGame;
    const sampleSize = getHistory(gameAtStart).length;

    analysisTimeout = setTimeout(() => {
      if (selectedGame !== gameAtStart) {
        analyzing = false;
        updateTimer();
        return;
      }

      const entries = getEntries(gameAtStart);

      if (!entries.length) {
        analyzing = false;
        if (progress) progress.hidden = true;
        setMessage("Nenhuma opção disponível neste módulo.");
        updateTimer();
        return;
      }

      // Seleção aleatória de uma opção cadastrada; não é uma previsão.
      const entry = entries[Math.floor(Math.random() * entries.length)];
      const completedAt = Date.now();

      data.cooldowns[gameAtStart] = completedAt + COOLDOWN_MS;
      data.lastAnalyses[gameAtStart] = completedAt;

      if (!saveData()) {
        analyzing = false;
        if (progress) progress.hidden = true;
        updateTimer();
        return;
      }

      const resultName = $("#resultName");
      const resultDescription = $("#resultDescription");
      const resultType = $("#resultType");

      if (resultName) resultName.textContent = entry.name;
      if (resultDescription) resultDescription.textContent = entry.description;
      if (resultType) {
        resultType.textContent = `Seleção aleatória • ${entry.category}`;
      }

      if (resultCard) resultCard.hidden = false;
      if (progress) progress.hidden = true;

      setMessage(
        `Analise concluída. `
      );

      analyzing = false;
      render();
    }, ANALYSIS_DELAY_MS);
  }

  // =========================
  // REGISTRO MANUAL
  // =========================

  function registerResult(event) {
    event.preventDefault();

    const input = $("#historyInput");
    if (!input) return;

    const value = normalizeResult(input.value);

    if (!value) {
      setMessage("Digite um resultado válido.");
      return;
    }

    const history = getHistory();
    history.unshift({
      value,
      timestamp: Date.now(),
      source: "manual"
    });

    if (!saveData()) {
      history.shift();
      return;
    }

    input.value = "";
    setMessage("Resultado registrado e salvo neste navegador.");
    render();
  }

  // =========================
  // ESTATÍSTICAS
  // =========================

  function renderStatistics() {
    const history = getHistory();
    const stats = new Map();

    history.forEach((item) => {
      stats.set(item.value, (stats.get(item.value) || 0) + 1);
    });

    const historyCount = $("#historyCount");
    const sampleLabel = $("#sampleLabel");
    const container = $("#statistics");

    if (historyCount) historyCount.textContent = String(history.length);
    if (sampleLabel) sampleLabel.textContent = `Amostra: ${history.length}`;
    if (!container) return;

    container.replaceChildren();

    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Ainda não há resultados registrados.";
      container.append(empty);
      return;
    }

    const sorted = [...stats.entries()].sort((a, b) => b[1] - a[1]);

    for (const [value, count] of sorted) {
      const card = document.createElement("article");
      card.className = "stat-card";

      const label = document.createElement("span");
      label.textContent = value;

      const amount = document.createElement("strong");
      amount.textContent = String(count);

      const percent = document.createElement("small");
      percent.textContent =
        `${((count / history.length) * 100).toFixed(2).replace(".", ",")}% da amostra`;

      card.append(label, amount, percent);
      container.append(card);
    }
  }

  // =========================
  // LISTA DO HISTÓRICO
  // =========================

  function renderHistoryList() {
    const history = getHistory();
    const list = $("#historyList");

    if (list) {
      list.replaceChildren();

      for (const item of history.slice(0, 30)) {
        const li = document.createElement("li");
        const value = document.createElement("span");
        const time = document.createElement("time");

        value.textContent = item.value;

        const date = new Date(item.timestamp);
        time.dateTime = date.toISOString();
        time.textContent = date.toLocaleString("pt-BR");

        li.append(value, time);
        list.append(li);
      }

      if (!history.length) {
        const li = document.createElement("li");
        li.textContent = "Nenhum resultado registrado.";
        li.style.color = "var(--muted)";
        list.append(li);
      }
    }

    const lastElement = $("#lastAnalysis");
    const last = data.lastAnalyses[selectedGame];

    if (lastElement) {
      lastElement.textContent = last
        ? new Date(last).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
          })
        : "Nenhuma";
    }
  }

  function render() {
    renderStatistics();
    renderHistoryList();
    updateTimer();
  }

  // =========================
  // LIMPAR HISTÓRICO
  // =========================

  function clearHistory() {
    const confirmed = window.confirm(
      `Deseja apagar todo o histórico de ${gameNames[selectedGame]}?`
    );

    if (!confirmed) return;

    const oldHistory = [...getHistory()];
    data.histories[selectedGame] = [];

    if (saveData()) {
      setMessage("Histórico apagado.");
      render();
    } else {
      data.histories[selectedGame] = oldHistory;
    }
  }

  // =========================
  // EXPORTAR CSV
  // =========================

  function exportCSV() {
    const history = getHistory();

    if (!history.length) {
      setMessage("Não há resultados para exportar.");
      return;
    }

    const escapeCSV = (value) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;

    const rows = [
      ["jogo", "resultado", "data_hora", "origem"],
      ...history.map((item) => [
        gameNames[selectedGame],
        item.value,
        new Date(item.timestamp).toISOString(),
        item.source || "manual"
      ])
    ];

    const csv = "\uFEFF" + rows
      .map((row) => row.map(escapeCSV).join(";"))
      .join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${selectedGame}-historico.csv`;
    document.body.append(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
    setMessage("Exportação CSV iniciada.");
  }

  // =========================
  // IMPORTAR CSV
  // =========================

  function normalizeHeader(value) {
    return String(value || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_");
  }

  function detectDelimiter(firstLine) {
    return firstLine.split(";").length > firstLine.split(",").length
      ? ";"
      : ",";
  }

  function parseCSV(content, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (char === '"') {
        if (inQuotes && content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && content[i + 1] === "\n") i++;

        row.push(field);
        if (row.some((cell) => cell.trim() !== "")) rows.push(row);

        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field);
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);

    return rows;
  }

  function gameKeyFromName(name) {
    const value = normalizeHeader(name);

    if (value.includes("immersive")) return "immersive";

    if (
      value.includes("roleta_brasileira") ||
      value === "roulette"
    ) {
      return "roulette";
    }

    if (
      value.includes("sic_bo") ||
      value.includes("sicbo") ||
      value.includes("mega_sic")
    ) {
      return "sicbo";
    }

    if (value.includes("bac_bo") || value.includes("bacbo")) {
      return "bacbo";
    }

    return null;
  }

  function importCSV(event) {
    const fileInput = event.target;
    const file = fileInput.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onerror = () => {
      setMessage("Não foi possível ler esse arquivo.");
      fileInput.value = "";
    };

    reader.onload = () => {
      try {
        const content = String(reader.result || "").replace(/^\uFEFF/, "");
        const firstLine = content.split(/\r?\n/).find((line) => line.trim());

        if (!firstLine) {
          setMessage("O arquivo CSV está vazio.");
          fileInput.value = "";
          return;
        }

        const rows = parseCSV(content, detectDelimiter(firstLine));

        if (rows.length < 2) {
          setMessage("O CSV precisa de cabeçalho e resultados.");
          fileInput.value = "";
          return;
        }

        const headers = rows[0].map(normalizeHeader);
        const resultIndex = headers.findIndex((h) =>
          ["resultado", "result", "value"].includes(h)
        );
        const gameIndex = headers.findIndex((h) =>
          ["jogo", "game"].includes(h)
        );
        const timeIndex = headers.findIndex((h) =>
          ["data_hora", "timestamp", "date", "datetime"].includes(h)
        );
        const sourceIndex = headers.findIndex((h) =>
          ["origem", "source"].includes(h)
        );

        if (resultIndex < 0) {
          setMessage("CSV inválido: falta a coluna resultado.");
          fileInput.value = "";
          return;
        }

        const imported = {};
        let skipped = 0;
        let sequence = 0;
        const defaultTimestamp = Date.now();

        for (const columns of rows.slice(1)) {
          const value = normalizeResult(columns[resultIndex] || "");

          if (!value) {
            skipped++;
            continue;
          }

          const gameName = gameIndex >= 0
            ? String(columns[gameIndex] || "").trim()
            : "";

          const game = gameName ? gameKeyFromName(gameName) : selectedGame;

          if (!game || !gameNames[game]) {
            skipped++;
            continue;
          }

          let timestamp = defaultTimestamp - sequence;

          if (timeIndex >= 0 && columns[timeIndex]) {
            const parsed = Date.parse(columns[timeIndex]);
            if (Number.isFinite(parsed)) timestamp = parsed;
          }

          sequence++;

          const source =
            sourceIndex >= 0 && columns[sourceIndex]
              ? String(columns[sourceIndex]).trim()
              : "csv";

          if (!imported[game]) imported[game] = [];
          imported[game].push({ value, timestamp, source });
        }

        const total = Object.values(imported)
          .reduce((sum, items) => sum + items.length, 0);

        if (!total) {
          setMessage("Nenhum resultado válido encontrado no CSV.");
          fileInput.value = "";
          return;
        }

        const previous = {};
        let newlyImported = 0;

        for (const [game, items] of Object.entries(imported)) {
          const history = getHistory(game);
          previous[game] = [...history];

          const existing = new Set(
            history.map((item) => `${item.value}\u0000${item.timestamp}`)
          );

          const unique = items.filter((item) => {
            const key = `${item.value}\u0000${item.timestamp}`;
            if (existing.has(key)) return false;
            existing.add(key);
            return true;
          });

          newlyImported += unique.length;

          data.histories[game] = [...unique, ...history]
            .sort((a, b) => b.timestamp - a.timestamp);
        }

        if (!saveData()) {
          for (const [game, history] of Object.entries(previous)) {
            data.histories[game] = history;
          }

          fileInput.value = "";
          return;
        }

        setMessage(
          newlyImported > 0
            ? `${newlyImported} resultado(s) importado(s).` +
              (skipped ? ` ${skipped} linha(s) ignorada(s).` : "")
            : "Os resultados já estavam salvos; nada foi duplicado."
        );

        fileInput.value = "";
        render();
      } catch (error) {
        console.error("Erro ao importar CSV:", error);
        setMessage("Erro ao importar. Confira o formato do CSV.");
        fileInput.value = "";
      }
    };

    reader.readAsText(file, "UTF-8");
  }

  // =========================
  // CONFIGURAR PLATAFORMA
  // =========================

  function configurePlatform(event) {
    event.preventDefault();

    const input = $("#platformUrl");
    const rawUrl = input ? input.value.trim() : "";

    if (!rawUrl) {
      setMessage("Informe a URL da plataforma.");
      return;
    }

    let url;

    try {
      url = new URL(rawUrl);
    } catch {
      setMessage("A URL informada é inválida.");
      return;
    }

    if (!["https:", "http:"].includes(url.protocol)) {
      setMessage("Utilize uma URL HTTP ou HTTPS válida.");
      return;
    }

    data.platformUrls[selectedGame] = url.href;

    if (!saveData()) return;

    const frame = $("#platformFrame");
    const placeholder = $("#framePlaceholder");
    const status = $("#platformStatus");

    if (frame) frame.src = url.href;
    if (placeholder) placeholder.hidden = true;
    if (status) status.textContent = "URL CONFIGURADA";

    setMessage(
      "URL configurada. A plataforma pode bloquear a incorporação."
    );
  }

  // =========================
  // EVENTOS
  // =========================

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      updateGame(tab.dataset.game);
    });
  });

  // Um único evento delegado: funciona também nos botões recriados.
  const quickEntryButtons = $("#quickEntryButtons");

  if (quickEntryButtons) {
    quickEntryButtons.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-result]");

      if (!button || !quickEntryButtons.contains(button)) return;

      registerQuickResult(button.dataset.result);
    });
  }

  const analyzeBtn = $("#analyzeBtn");
  if (analyzeBtn) analyzeBtn.addEventListener("click", analyze);

  const historyForm = $("#historyForm");
  if (historyForm) historyForm.addEventListener("submit", registerResult);

  const clearButton = $("#clearHistoryBtn");
  if (clearButton) clearButton.addEventListener("click", clearHistory);

  const exportButton = $("#exportBtn");
  if (exportButton) exportButton.addEventListener("click", exportCSV);

  const importButton = $("#importBtn");
  const fileInput = $("#arquivoCSV");

  if (importButton && fileInput) {
    importButton.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", importCSV);
  }

  const platformForm = $("#platformForm");
  if (platformForm) {
    platformForm.addEventListener("submit", configurePlatform);
  }

  window.setInterval(updateTimer, 250);

  // Inicialização
  updateGame(selectedGame);
})();
