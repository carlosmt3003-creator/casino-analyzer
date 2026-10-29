
"use strict";

(() => {
    /* ==========================================
       MEGA SIC BAC — CONTROLE INDEPENDENTE
       Cada IA possui seu próprio bloqueio.
    ========================================== */

    const CONFIG = {
        STANDARD: {
            duration: 10_000,
            cooldown: 60_000
        },
        PREMIUM: {
            duration: 20_000,
            cooldown: 300_000
        },
        STORAGE_KEY: "megaSicBac.independentLocks.v1",
        UPDATE_INTERVAL: 200
    };

    const $ = (id) => document.getElementById(id);

    const el = {
        standardCard: $("standardCard"),
        standardStatusArea: $("standardStatusArea"),
        standardStatus: $("standardStatus"),
        standardLiquidGrid: $("standardLiquidGrid"),
        standardEmptyState: $("standardEmptyState"),
        standardProgress: $("standardProgress"),
        standardProgressLabel: $("standardProgressLabel"),
        standardTimer: $("standardTimer"),
        standardButton: $("standardAnalyzeButton"),
        standardBestEntry: $("standardBestEntry"),
        standardBestValue: $("standardBestValue"),

        premiumCard: $("premiumCard"),
        premiumStatusArea: $("premiumStatusArea"),
        premiumStatus: $("premiumStatus"),
        premiumProgress: $("premiumProgress"),
        premiumProgressLabel: $("premiumProgressLabel"),
        premiumTimer: $("premiumTimer"),
        premiumButton: $("premiumAnalyzeButton"),
        premiumResult: $("premiumResult"),
        premiumBestEntry: $("premiumBestEntry"),
        premiumBestValue: $("premiumBestValue"),

        frame: $("platformFrame"),
        framePlaceholder: $("framePlaceholder")
    };

    const required = [
        "standardStatusArea",
        "standardStatus",
        "standardLiquidGrid",
        "standardEmptyState",
        "standardProgress",
        "standardProgressLabel",
        "standardTimer",
        "standardButton",
        "standardBestEntry",
        "standardBestValue",
        "premiumStatusArea",
        "premiumStatus",
        "premiumProgress",
        "premiumProgressLabel",
        "premiumTimer",
        "premiumButton",
        "premiumResult",
        "premiumBestEntry",
        "premiumBestValue",
        "frame",
        "framePlaceholder"
    ];

    for (const id of required) {
        if (!el[id]) {
            console.error(
                `Mega Sic Bac: elemento "${id}" não encontrado no HTML.`
            );
            return;
        }
    }

    /* ==========================================
       ESTADO INDEPENDENTE DE CADA IA
    ========================================== */

    const modes = {
        STANDARD: {
            active: false,
            startedAt: 0,
            lockedUntil: 0,
            intervalId: null,
            timeoutId: null
        },
        PREMIUM: {
            active: false,
            startedAt: 0,
            lockedUntil: 0,
            intervalId: null,
            timeoutId: null
        }
    };

    const results = {
        STANDARD: null,
        PREMIUM: null
    };

    const messages = {
        STANDARD: [
            { at: 0, text: "Preparando análise" },
            { at: 0.3, text: "Verificando resultados" },
            { at: 0.7, text: "Calculando indicadores" },
            { at: 0.9, text: "Concluindo análise" }
        ],
        PREMIUM: [
            { at: 0, text: "Inicializando análise premium" },
            { at: 0.12, text: "Analisando histórico disponível" },
            { at: 0.27, text: "Verificando até 120 rodadas anteriores" },
            { at: 0.43, text: "Comparando indicadores" },
            { at: 0.60, text: "Calculando porcentagens" },
            { at: 0.78, text: "Identificando melhor entrada" },
            { at: 0.93, text: "Finalizando análise" }
        ]
    };

    function getElements(type) {
        const premium = type === "PREMIUM";

        return {
            statusArea: premium
                ? el.premiumStatusArea
                : el.standardStatusArea,
            status: premium
                ? el.premiumStatus
                : el.standardStatus,
            progress: premium
                ? el.premiumProgress
                : el.standardProgress,
            progressLabel: premium
                ? el.premiumProgressLabel
                : el.standardProgressLabel,
            timer: premium
                ? el.premiumTimer
                : el.standardTimer,
            button: premium
                ? el.premiumButton
                : el.standardButton,
            bestEntry: premium
                ? el.premiumBestEntry
                : el.standardBestEntry,
            bestValue: premium
                ? el.premiumBestValue
                : el.standardBestValue
        };
    }

    /* ==========================================
       SALVAR E RESTAURAR OS BLOQUEIOS
    ========================================== */

    function saveLocks() {
        try {
            localStorage.setItem(
                CONFIG.STORAGE_KEY,
                JSON.stringify({
                    STANDARD: modes.STANDARD.lockedUntil,
                    PREMIUM: modes.PREMIUM.lockedUntil
                })
            );
        } catch (error) {
            console.warn("Não foi possível salvar os bloqueios.", error);
        }
    }

    function restoreLocks() {
        try {
            const saved = JSON.parse(
                localStorage.getItem(CONFIG.STORAGE_KEY) || "null"
            );

            if (!saved || typeof saved !== "object") {
                return;
            }

            for (const type of ["STANDARD", "PREMIUM"]) {
                const value = saved[type];

                modes[type].lockedUntil =
                    Number.isFinite(value) && value > Date.now()
                        ? value
                        : 0;
            }

            saveLocks();
        } catch (error) {
            console.warn("Não foi possível restaurar os bloqueios.", error);
        }
    }

    /* ==========================================
       FUNÇÕES AUXILIARES
    ========================================== */

    function formatTime(milliseconds) {
        const seconds = Math.max(
            0,
            Math.ceil(milliseconds / 1000)
        );

        const minutes = Math.floor(seconds / 60);
        const remainder = seconds % 60;

        return (
            String(minutes).padStart(2, "0") +
            ":" +
            String(remainder).padStart(2, "0")
        );
    }

    function setStatus(type, text, mode = "idle") {
        const ui = getElements(type);

        ui.status.textContent = text;

        ui.statusArea.classList.remove(
            "is-processing",
            "is-complete"
        );

        if (mode === "processing") {
            ui.statusArea.classList.add("is-processing");
        }

        if (mode === "complete") {
            ui.statusArea.classList.add("is-complete");
        }
    }

    function setProgress(type, percentage, text) {
        const ui = getElements(type);

        ui.progress.style.width =
            `${Math.max(0, Math.min(100, percentage))}%`;

        if (text) {
            ui.progressLabel.textContent = text;
        }
    }

    function stopTimers(type) {
        const mode = modes[type];

        if (mode.intervalId !== null) {
            clearInterval(mode.intervalId);
            mode.intervalId = null;
        }

        if (mode.timeoutId !== null) {
            clearTimeout(mode.timeoutId);
            mode.timeoutId = null;
        }
    }

    /* ==========================================
       ATUALIZA SOMENTE O MODO INFORMADO
    ========================================== */

    function updateMode(type) {
        const mode = modes[type];
        const ui = getElements(type);
        const now = Date.now();
        const remaining = Math.max(0, mode.lockedUntil - now);

        ui.button.disabled = mode.active || remaining > 0;

        if (mode.active) {
            const elapsed = now - mode.startedAt;

            ui.timer.textContent = formatTime(
                CONFIG[type].duration - elapsed
            );

            return;
        }

        if (remaining > 0) {
            ui.timer.textContent = formatTime(remaining);
            ui.progressLabel.textContent =
                "Próxima análise disponível em";
            return;
        }

        mode.lockedUntil = 0;

        ui.timer.textContent = formatTime(CONFIG[type].duration);

        ui.progressLabel.textContent = results[type]
            ? "Resultado demonstrativo disponível"
            : "Pronto para iniciar";

        if (results[type]) {
            setStatus(
                type,
                "Análise demonstrativa concluída",
                "complete"
            );
        } else {
            setStatus(type, "Aguardando análise", "idle");
        }
    }

    function updateAllModes() {
        updateMode("STANDARD");
        updateMode("PREMIUM");
        saveLocks();
    }

    /* ==========================================
       GERAÇÃO DEMONSTRATIVA DOS RESULTADOS
    ========================================== */

    function randomInteger(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function generateResults() {
        const yellow = randomInteger(0, 3);
        const remaining = 100 - yellow;
        const red = randomInteger(0, remaining);
        const blue = remaining - red;

        return { red, yellow, blue };
    }

    function renderLiquidResults(type, data) {
        const prefix = type === "STANDARD" ? "standard" : "premium";

        const definitions = [
            { key: "Red", value: data.red, label: "Vermelho" },
            { key: "Yellow", value: data.yellow, label: "Amarelo" },
            { key: "Blue", value: data.blue, label: "Azul" }
        ];

        for (const item of definitions) {
            const vessel = $(`${prefix}${item.key}Liquid`);
            const valueElement = $(`${prefix}${item.key}Value`);

            if (!vessel || !valueElement) {
                console.error(
                    `Indicador ausente: ${prefix}${item.key}`
                );
                continue;
            }

            const fill = vessel.querySelector(".liquid-fill");

            if (!fill) {
                console.error(
                    `Elemento .liquid-fill ausente em ${prefix}${item.key}Liquid`
                );
                continue;
            }

            valueElement.textContent = `${item.value}%`;

            vessel.setAttribute(
                "aria-label",
                `${item.label}: ${item.value}%`
            );

            fill.style.transition = "none";
            fill.style.height = "0%";

            void fill.offsetHeight;

            fill.style.transition = "";

            requestAnimationFrame(() => {
                fill.style.height = `${item.value}%`;
            });
        }
    }

    function showBestEntry(type, data) {
        const ui = getElements(type);

        const choices = [
            { name: "VERMELHO", value: data.red },
            { name: "AMARELO", value: data.yellow },
            { name: "AZUL", value: data.blue }
        ];

        const best = choices.reduce((previous, current) =>
            current.value > previous.value ? current : previous
        );

        ui.bestValue.textContent = `${best.name} — ${best.value}%`;
        ui.bestEntry.hidden = false;
    }

    /* ==========================================
       INICIAR UMA ANÁLISE INDEPENDENTE
    ========================================== */

    function startAnalysis(type) {
        const mode = modes[type];
        const settings = CONFIG[type];

        // Só verifica o bloqueio deste modo.
        if (mode.active || Date.now() < mode.lockedUntil) {
            updateMode(type);
            return;
        }

        const ui = getElements(type);

        // Esconde as entradas anteriores dos dois modos.
        el.standardBestEntry.hidden = true;
        el.premiumBestEntry.hidden = true;

        mode.active = true;
        mode.startedAt = Date.now();

        // O bloqueio pertence somente ao modo clicado.
        mode.lockedUntil = mode.startedAt + settings.cooldown;

        saveLocks();
        stopTimers(type);

        if (type === "STANDARD") {
            el.standardEmptyState.hidden = true;
            el.standardLiquidGrid.hidden = true;
        }

        setStatus(type, "Análise em andamento", "processing");

        setProgress(
            type,
            0,
            messages[type][0].text
        );

        updateMode(type);

        function tick() {
            if (!mode.active) {
                stopTimers(type);
                return;
            }

            const now = Date.now();
            const elapsed = now - mode.startedAt;
            const progress = Math.min(1, elapsed / settings.duration);

            let currentMessage = messages[type][0];

            for (const message of messages[type]) {
                if (progress >= message.at) {
                    currentMessage = message;
                }
            }

            setProgress(
                type,
                progress * 100,
                currentMessage.text
            );

            updateMode(type);

            if (elapsed >= settings.duration) {
                finishAnalysis(type);
            }
        }

        tick();

        mode.intervalId = setInterval(
            tick,
            CONFIG.UPDATE_INTERVAL
        );

        mode.timeoutId = setTimeout(
            tick,
            settings.duration + 50
        );
    }

    /* ==========================================
       CONCLUIR UMA ANÁLISE
    ========================================== */

    function finishAnalysis(type) {
        const mode = modes[type];

        if (!mode.active) {
            return;
        }

        stopTimers(type);

        try {
            const data = generateResults();

            results[type] = data;

            renderLiquidResults(type, data);
            showBestEntry(type, data);

            if (type === "STANDARD") {
                el.standardEmptyState.hidden = true;
                el.standardLiquidGrid.hidden = false;
            } else {
                el.premiumResult.hidden = false;
            }

            setProgress(type, 100, "Análise concluída");

            setStatus(
                type,
                "ÚLTIMAS 120 RODADAS ANALISADAS",
                "complete"
            );
        } catch (error) {
            console.error("Erro ao finalizar análise:", error);

            setStatus(type, "Erro ao gerar resultado", "idle");
        }

        mode.active = false;

        // Atualiza apenas o botão e o contador deste modo.
        updateMode(type);
        saveLocks();

        // Mantém o contador deste modo atualizado até liberar.
        mode.intervalId = setInterval(() => {
            updateMode(type);
            saveLocks();

            if (Date.now() >= mode.lockedUntil) {
                stopTimers(type);
                updateMode(type);
                saveLocks();
            }
        }, CONFIG.UPDATE_INTERVAL);
    }

    /* ==========================================
       CONFIGURAÇÃO DO IFRAME
    ========================================== */

    function initializePlatform() {
        const platformUrl = "";

        if (!platformUrl.trim()) {
            el.frame.hidden = true;
            el.framePlaceholder.hidden = false;
            return;
        }

        try {
            const url = new URL(platformUrl);

            if (!["https:", "http:"].includes(url.protocol)) {
                throw new Error("Protocolo de URL inválido.");
            }

            el.frame.src = url.href;
            el.frame.hidden = false;
            el.framePlaceholder.hidden = true;
        } catch (error) {
            console.error("URL da plataforma inválida.", error);
            el.frame.hidden = true;
            el.framePlaceholder.hidden = false;
        }
    }

    /* ==========================================
       EVENTOS E INICIALIZAÇÃO
    ========================================== */

    function initialize() {
        el.standardButton.addEventListener("click", () => {
            startAnalysis("STANDARD");
        });

        el.premiumButton.addEventListener("click", () => {
            startAnalysis("PREMIUM");
        });

        el.standardLiquidGrid.hidden = true;
        el.standardEmptyState.hidden = false;

        initializePlatform();
        restoreLocks();

        updateAllModes();

        // Atualiza cada modo sem interferir no outro.
        for (const type of ["STANDARD", "PREMIUM"]) {
            if (modes[type].lockedUntil > Date.now()) {
                modes[type].intervalId = setInterval(() => {
                    updateMode(type);
                    saveLocks();

                    if (
                        !modes[type].active &&
                        Date.now() >= modes[type].lockedUntil
                    ) {
                        stopTimers(type);
                        updateMode(type);
                        saveLocks();
                    }
                }, CONFIG.UPDATE_INTERVAL);
            }
        }

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                updateAllModes();
            }
        });

        window.addEventListener("pagehide", () => {
            for (const type of ["STANDARD", "PREMIUM"]) {
                stopTimers(type);
            }
        });

        window.addEventListener("pageshow", () => {
            updateAllModes();

            for (const type of ["STANDARD", "PREMIUM"]) {
                const mode = modes[type];

                if (mode.active) {
                    startAnalysisAfterRestore(type);
                } else if (mode.lockedUntil > Date.now()) {
                    mode.intervalId = setInterval(() => {
                        updateMode(type);
                        saveLocks();

                        if (Date.now() >= mode.lockedUntil) {
                            stopTimers(type);
                            updateMode(type);
                            saveLocks();
                        }
                    }, CONFIG.UPDATE_INTERVAL);
                }
            }
        });

        console.info(
            "Mega Sic Bac iniciado. Bloqueios independentes ativos."
        );
    }

    // Retoma o acompanhamento do tempo se a página voltar do cache.
    function startAnalysisAfterRestore(type) {
        const mode = modes[type];

        if (!mode.active || mode.intervalId !== null) {
            return;
        }

        const settings = CONFIG[type];

        function tick() {
            if (!mode.active) {
                stopTimers(type);
                return;
            }

            const elapsed = Date.now() - mode.startedAt;
            const progress = Math.min(1, elapsed / settings.duration);

            let currentMessage = messages[type][0];

            for (const message of messages[type]) {
                if (progress >= message.at) {
                    currentMessage = message;
                }
            }

            setProgress(type, progress * 100, currentMessage.text);
            updateMode(type);

            if (elapsed >= settings.duration) {
                finishAnalysis(type);
            }
        }

        tick();

        if (mode.active) {
            mode.intervalId = setInterval(tick, CONFIG.UPDATE_INTERVAL);
            mode.timeoutId = setTimeout(
                tick,
                Math.max(0, settings.duration - (Date.now() - mode.startedAt)) + 50
            );
        }
    }

    initialize();
})();

/* ==========================================
   ABRIR A PLATAFORMA PELO CAMPO DE URL
========================================== */

const platformUrlInput = document.getElementById("platformUrlInput");
const openPlatformButton = document.getElementById("openPlatformButton");
const platformFrame = document.getElementById("platformFrame");
const framePlaceholder = document.getElementById("framePlaceholder");

if (
    platformUrlInput &&
    openPlatformButton &&
    platformFrame &&
    framePlaceholder
) {
    openPlatformButton.addEventListener("click", function () {
        let url = platformUrlInput.value.trim();

        if (!url) {
            alert("Digite a URL da plataforma.");
            platformUrlInput.focus();
            return;
        }

        if (!/^https?:\/\//i.test(url)) {
            url = "https://" + url;
        }

        try {
            const parsedUrl = new URL(url);

            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                alert("Digite uma URL válida.");
                return;
            }

            platformFrame.src = parsedUrl.href;
            platformFrame.hidden = false;
            framePlaceholder.hidden = true;
        } catch {
            alert("URL inválida. Confira o endereço e tente novamente.");
        }
    });

    platformUrlInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            openPlatformButton.click();
        }
    });
}
