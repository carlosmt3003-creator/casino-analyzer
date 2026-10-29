
"use strict";

(() => {
    /* ==========================================
       MEGA SIC BAC — CONTROLE CORRIGIDO
       Bloqueio compartilhado entre as duas IAs.
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

        STORAGE_KEY: "megaSicBac.sharedLock.v2",
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
       ESTADO GLOBAL
       ========================================== */

    let activeAnalysis = null;
    let sharedLockUntil = 0;
    let lockOwner = null;
    let intervalId = null;
    let timeoutId = null;

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

    /* ==========================================
       ELEMENTOS POR MODALIDADE
       ========================================== */

    function getElements(type) {
        const premium = type === "PREMIUM";

        return {
            card: premium ? el.premiumCard : el.standardCard,
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
       ARMAZENAMENTO DO BLOQUEIO COMPARTILHADO
       ========================================== */

    function saveLock() {
        try {
            localStorage.setItem(
                CONFIG.STORAGE_KEY,
                JSON.stringify({
                    until: sharedLockUntil,
                    owner: lockOwner
                })
            );
        } catch (error) {
            console.warn("Não foi possível salvar o bloqueio.", error);
        }
    }

    function restoreLock() {
        try {
            const saved = JSON.parse(
                localStorage.getItem(CONFIG.STORAGE_KEY) || "null"
            );

            if (
                saved &&
                Number.isFinite(saved.until) &&
                saved.until > Date.now()
            ) {
                sharedLockUntil = saved.until;
                lockOwner =
                    saved.owner === "STANDARD" ||
                    saved.owner === "PREMIUM"
                        ? saved.owner
                        : null;
            } else {
                sharedLockUntil = 0;
                lockOwner = null;
                localStorage.removeItem(CONFIG.STORAGE_KEY);
            }
        } catch (error) {
            sharedLockUntil = 0;
            lockOwner = null;

            console.warn("Não foi possível restaurar o bloqueio.", error);
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

    function stopTimers() {
        if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
        }

        if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    }

    /* ==========================================
       BLOQUEIO DOS DOIS BOTÕES
       ========================================== */

    
function updateSharedLock() {
    const now = Date.now();
    const remaining = Math.max(0, sharedLockUntil - now);
    const locked = activeAnalysis !== null || remaining > 0;

    el.standardButton.disabled = locked;
    el.premiumButton.disabled = locked;

    if (activeAnalysis !== null) {
        const activeUI = getElements(activeAnalysis);
        const otherType =
            activeAnalysis === "STANDARD" ? "PREMIUM" : "STANDARD";
        const otherUI = getElements(otherType);

        activeUI.timer.textContent = formatTime(
            Math.max(
                0,
                CONFIG[activeAnalysis].duration -
                (now - analysisStartedAt)
            )
        );

        otherUI.timer.textContent = formatTime(remaining);
        otherUI.progressLabel.textContent =
            "Bloqueada enquanto a outra IA analisa";

        return;
    }

    if (remaining > 0) {
        ["STANDARD", "PREMIUM"].forEach((type) => {
            const ui = getElements(type);

            ui.timer.textContent = formatTime(remaining);
            ui.progressLabel.textContent =
                "Próxima análise disponível em";
        });

        return;
    }

    // BLOQUEIO ENCERRADO: libera novamente as duas IAs.
    sharedLockUntil = 0;
    lockOwner = null;

    try {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
    } catch (error) {
        console.warn("Não foi possível limpar o bloqueio.", error);
    }

    ["STANDARD", "PREMIUM"].forEach((type) => {
        const ui = getElements(type);

        ui.button.disabled = false;
        ui.timer.textContent =
            formatTime(CONFIG[type].duration);

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
    });
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
        const prefix =
            type === "STANDARD" ? "standard" : "premium";

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

        ui.bestValue.textContent =
            `${best.name} — ${best.value}%`;

        ui.bestEntry.hidden = false;
    }

    /* ==========================================
       INICIAR UMA ANÁLISE
       ========================================== */

    let analysisStartedAt = 0;


    function startAnalysis(type) {
        /*
         * VERIFICAÇÃO CENTRAL:
         * bloqueia qualquer clique se já existir uma análise
         * ativa ou se o cooldown compartilhado não terminou.
         */
        if (
            activeAnalysis !== null ||
            Date.now() < sharedLockUntil
        ) {
            updateSharedLock();
            return;
        }

        const settings = CONFIG[type];

        activeAnalysis = type;
        analysisStartedAt = Date.now();

        /*
         * O bloqueio é definido no início e aplicado às duas IAs.
         */
        sharedLockUntil =
            analysisStartedAt + settings.cooldown;

        lockOwner = type;

        saveLock();
        stopTimers();

        ;

const ui = getElements(type);

// Esconde as entradas anteriores ao iniciar uma nova análise.
el.standardBestEntry.hidden = true;
el.premiumBestEntry.hidden = true;

ui.button.disabled = true;



        if (type === "STANDARD") {
            el.standardEmptyState.hidden = true;
            el.standardLiquidGrid.hidden = true;
        }

        setStatus(
            type,
            "Análise em andamento",
            "processing"
        );

        setProgress(
            type,
            0,
            messages[type][0].text
        );

        updateSharedLock();

        /*
         * Uma única rotina controla o progresso, o contador
         * e o momento exato da conclusão.
         */
        function tick() {
            if (activeAnalysis !== type) {
                return;
            }

            const now = Date.now();
            const elapsed = now - analysisStartedAt;

            const progress = Math.min(
                1,
                elapsed / settings.duration
            );

            const percentage = progress * 100;

            let currentMessage = messages[type][0];

            for (const message of messages[type]) {
                if (progress >= message.at) {
                    currentMessage = message;
                }
            }

            setProgress(
                type,
                percentage,
                currentMessage.text
            );

            updateSharedLock();

            if (elapsed >= settings.duration) {
                finishAnalysis(type);
            }
        }

        tick();

        intervalId = setInterval(
            tick,
            CONFIG.UPDATE_INTERVAL
        );

        timeoutId = setTimeout(
            tick,
            settings.duration + 50
        );
    }

    /* ==========================================
       CONCLUIR A ANÁLISE
       ========================================== */

    
function finishAnalysis(type) {
    if (activeAnalysis !== type) {
        return;
    }

    stopTimers();

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
            "ULTIMAS 120 RODADAS ANALISADA",
            "complete"
        );
    } catch (error) {
        console.error("Erro ao finalizar análise:", error);

        setStatus(type, "Erro ao gerar resultado", "idle");
    }

    // Encerra a análise, mas mantém o bloqueio compartilhado.
    activeAnalysis = null;

    // Atualiza imediatamente os dois botões e contadores.
    updateSharedLock();

    // IMPORTANTE: mantém o contador funcionando até liberar.
    intervalId = setInterval(() => {
        if (activeAnalysis === null) {
            updateSharedLock();

            if (Date.now() >= sharedLockUntil) {
                clearInterval(intervalId);
                intervalId = null;
            }
        }
    }, 200);
}


    /* ==========================================
       CONFIGURAÇÃO DO IFRAME
       ========================================== */

    function initializePlatform() {
        /*
         * Coloque a URL real da plataforma abaixo, se desejar.
         * A plataforma precisa permitir incorporação por iframe.
         */
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
        restoreLock();

        updateSharedLock();

        /*
         * Atualiza os dois contadores mesmo se a aba ficar
         * em segundo plano e voltar depois.
         */
        intervalId = setInterval(() => {
            if (activeAnalysis === null) {
                updateSharedLock();
            }
        }, CONFIG.UPDATE_INTERVAL);

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                updateSharedLock();
            }
        });

        window.addEventListener("pagehide", () => {
            stopTimers();
        });

        window.addEventListener("pageshow", () => {
            restoreLock();
            updateSharedLock();
        });

        console.info(
            "Mega Sic Bac iniciado. Bloqueio compartilhado ativo."
        );
    }

    initialize();
})();

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
