const loader = document.getElementById("loader");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");
const resultLabel = document.getElementById("resultLabel");
const result = document.getElementById("result");
const countdown = document.getElementById("countdown");

const platformFrame = document.getElementById("platformFrame");
const frameOverlay = document.getElementById("frameOverlay");

const ENTRADAS = ["🟡🟢", "🔵🟢", "🔵", "🟡"];

const TEMPO_ESPERA = 60;       // 1 minuto
const TEMPO_ANALISE = 3000;    // 3 segundos
const TEMPO_ENTRADA = 7000;    // 7 segundos

let bloqueadoAte = 0;
let analiseEmAndamento = false;
let resultadoTimer = null;
let analiseTimer = null;

// Atualiza o contador no cabeçalho
function atualizarContador() {
    const restante = Math.max(
        0,
        Math.ceil((bloqueadoAte - Date.now()) / 1000)
    );

    const minutos = String(Math.floor(restante / 60)).padStart(2, "0");
    const segundos = String(restante % 60).padStart(2, "0");

    countdown.textContent = restante > 0
        ? `${minutos}:${segundos}`
        : "PRONTO";

    if (restante === 0 && !analiseEmAndamento) {
        loader.classList.remove("disabled");

        if (!result.textContent) {
            statusText.textContent = "Sistema pronto";
            statusDot.className = "status-dot";
        }
    }
}

setInterval(atualizarContador, 250);

// Inicia uma análise ao clicar no símbolo giratório
function analisarEntrada() {
    if (analiseEmAndamento || Date.now() < bloqueadoAte) {
        return;
    }

    analiseEmAndamento = true;
    bloqueadoAte = Date.now() + TEMPO_ESPERA * 1000;

    clearTimeout(resultadoTimer);
    clearTimeout(analiseTimer);

    loader.classList.add("spinning", "disabled");
    statusDot.className = "status-dot busy";
    statusText.textContent = "Analisando plataforma...";
    resultLabel.textContent = "ANÁLISE EM ANDAMENTO";
    result.textContent = "";

    // Simula o tempo de processamento
    analiseTimer = setTimeout(() => {
        const indice = Math.floor(Math.random() * ENTRADAS.length);
        const entradaSorteada = ENTRADAS[indice];

        result.textContent = entradaSorteada;
        resultLabel.textContent = "ENTRADA ANALISADA";
        statusText.textContent = "Análise concluída";
        statusDot.className = "status-dot";

        loader.classList.remove("spinning");
        analiseEmAndamento = false;

        // Mantém a entrada visível por 7 segundos
        resultadoTimer = setTimeout(() => {
            result.textContent = "";
            resultLabel.textContent = "AGUARDANDO PRÓXIMA ANÁLISE";

            if (Date.now() >= bloqueadoAte) {
                statusText.textContent = "Sistema pronto";
                loader.classList.remove("disabled");
            } else {
                statusText.textContent = "Aguardando intervalo";
            }
        }, TEMPO_ENTRADA);

        atualizarContador();
    }, TEMPO_ANALISE);

    atualizarContador();
}

// O ícone funciona sem um botão tradicional
loader.addEventListener("click", analisarEntrada);

// Permite ativar pelo teclado
loader.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        analisarEntrada();
    }
});

// Remove a mensagem de carregamento quando o iframe carregar
platformFrame.addEventListener("load", () => {
    frameOverlay.classList.add("hidden");
});

// Mensagem inicial
atualizarContador();

const urlForm = document.getElementById("urlForm");
const platformUrl = document.getElementById("platformUrl");
const openPlatform = document.getElementById("openPlatform");
const urlError = document.getElementById("urlError");
const platform = document.querySelector(".platform");

urlForm.addEventListener("submit", function (event) {
    event.preventDefault();

    let url;

    try {
        url = new URL(platformUrl.value.trim());

        if (url.protocol !== "https:" && url.protocol !== "http:") {
            throw new Error("URL inválida");
        }
    } catch {
        urlError.textContent = "Digite uma URL válida, começando com https://";
        urlError.style.display = "block";
        return;
    }

    urlError.style.display = "none";
    openPlatform.disabled = true;
    openPlatform.textContent = "Abrindo plataforma...";

    // Abre a plataforma no iframe
    platformFrame.src = url.href;

    // Exibe o iframe e oculta a tela de URL
    platform.classList.add("connected");
    frameOverlay.classList.remove("hidden");

    // Evita manter a tela de configuração visível
    urlForm.reset();
});
