// =======================================
// app.js — Mapa de calor Valenzuela
// =======================================

console.log("📌 APP.js cargado");

// === AUTENTICACIÓN ===
let VALID_USERS = {};

// Cargar credenciales desde archivo generado (inyectado por GitHub Actions)
async function loadCredentials() {
    try {
        // Cargar dinámicamente el script de credenciales
        const script = document.createElement('script');
        script.src = 'credentials.js?cache=' + Date.now();
        document.head.appendChild(script);
        
        // Esperar a que se cargue
        await new Promise(resolve => {
            script.onload = resolve;
            setTimeout(resolve, 1000); // Timeout de seguridad
        });
        
        // Las credenciales se cargan en window.SCADA_CREDENTIALS
        VALID_USERS = window.SCADA_CREDENTIALS?.users || {};
        
        if (Object.keys(VALID_USERS).length === 0) {
            console.warn("⚠️ No se encontraron credenciales. Usando credenciales por defecto.");
            VALID_USERS = { "admin": "admin123", "user": "user2026" };
        }
    } catch (err) {
        console.error("❌ Error cargando credenciales:", err);
        // Fallback si falla la carga
        VALID_USERS = { "admin": "admin123", "user": "user2026" };
    }
    
    setupAuthSystem();
}

function setupAuthSystem() {
    const loginForm = document.getElementById("login-form");
    const logoutBtn = document.getElementById("logout-btn");
    
    // Verificar si ya hay sesión activa
    if (localStorage.getItem("scada_logged_in") === "true") {
        showMainContent();
    } else {
        document.getElementById("login-modal").style.display = "flex";
    }
    
    // Evento de login
    loginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        
        if (VALID_USERS[username] && VALID_USERS[username] === password) {
            localStorage.setItem("scada_logged_in", "true");
            localStorage.setItem("scada_user", username);
            document.getElementById("login-error").textContent = "";
            showMainContent();
        } else {
            document.getElementById("login-error").textContent = "❌ Usuario o contraseña incorrectos";
            document.getElementById("password").value = "";
        }
    });
    
    // Evento de logout
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("scada_logged_in");
        localStorage.removeItem("scada_user");
        document.getElementById("login-modal").style.display = "flex";
        document.getElementById("login-form").reset();
        document.getElementById("login-error").textContent = "";
        document.getElementById("main-content").style.display = "none";
    });
}

function showMainContent() {
    document.getElementById("login-modal").style.display = "none";
    document.getElementById("main-content").style.display = "block";
}

// === CONFIGURACIÓN ===
// ⬇️ IMPORTANTE: se carga desde GitHub Pages, no RAW
const CSV_URL = "dato.csv";

const REFRESH_MS = 5000;
const TOTAL_CONTENEDORES = 110;

// === HELPERS CSV ===

function normalizeHeader(h) {
    if (!h) return h;
    h = h.replace(/^\uFEFF/, "");
    return h.replace(/"/g, "").trim().toLowerCase();
}

function splitCSVLine(line, sep) {
    const result = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (!inQuotes && ch === sep) { result.push(cur); cur=""; continue; }
        cur += ch;
    }
    result.push(cur);
    return result.map(s => s.trim());
}

// === CARGA CSV (GITHUB PAGES, cache-busting simple) ===
async function loadCSV() {
    try {
        const res = await fetch(CSV_URL + "?cache=" + Date.now());
        const text = await res.text();
        return parseCSV(text);
    } catch (err) {
        console.error("❌ ERROR CSV:", err);
        return null;
    }
}

function parseCSV(text) {
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
    if (rawLines.length < 2) return [];

    const sample = rawLines[0];
    const sep = sample.includes(";") && !sample.includes(",") ? ";" : ",";

    const rawHeaders = splitCSVLine(rawLines[0], sep);
    const headers = rawHeaders.map(normalizeHeader);

    const rows = [];
    for (let i = 1; i < rawLines.length; i++) {
        const parts = splitCSVLine(rawLines[i], sep);
        while (parts.length < headers.length) parts.push("");

        const obj = {};
        headers.forEach((h, j) => obj[h] = parts[j] ?? "");
        rows.push(obj);
    }
    return rows;
}

// === AGRUPACIÓN POR CONTENEDOR (LATEST) ===

function groupByContainerTakeLatest(rows) {
    const map = {};
    rows.forEach(r => {

        const ts = r["timestamp"] ?? r["time"] ?? "";
        const ip = r["ip"] ?? "";
        const ghsRaw = r["ghscount"];
        const ghsModRaw = r["ghsmod"];
        const tempRaw = r["temperature_c"];
        const potRaw  = r["potencia"];
        const hashRaw = r["hashrate_ph"];

        let cont = null;
        if (ip.includes(".")) {
            const maybe = Number(ip.split(".")[2]);
            if (!Number.isNaN(maybe)) cont = maybe;
        }
        if (!cont) return;

        const entry = {
            contenedor: cont,
            timestamp_ms: Date.parse(ts) || 0,
            ghsCount: ghsRaw !== "" ? Number(ghsRaw) : NaN,
            ghsMod: ghsModRaw !== "" ? Number(ghsModRaw) : NaN,
            temperature_c: tempRaw !== "" ? Number(tempRaw) : NaN,
            potencia: potRaw !== "" ? Number(potRaw) : NaN,
            hashrate_ph: hashRaw !== "" ? Number(hashRaw) : NaN
        };

        if (!map[cont] || entry.timestamp_ms >= map[cont].timestamp_ms)
            map[cont] = entry;
    });

    return map;
}

// === COLORES TEMPERATURA ===

function tempToColor(t) {
    if (t === null || isNaN(t)) return "#666";
    if (t < 1) return "#ffffff";
    if (t < 30) return "#77b7f0";
    if (t < 31) return "#a6cff7";
    if (t < 33) return "#4a90e2";
    if (t < 35) return "#9bdc6a";
    if (t < 36) return "#7ed321";
    if (t < 38) return "#f8e71c";
    if (t < 40) return "#F69529";
    return "#f44336";
}

// === LAYOUT ===

const LAYOUT_PLATAFORMAS = {
    1: [[7,8,9,10,11,12],[1,2,3,4,5,6]],
    2: [[19,20,21,22,23,24,"ghost","ghost","ghost","ghost","ghost","ghost"],
        [13,14,15,16,17,18,25,26,27,28,29,30]],
    3: [[43,44,45,46,47,48,49,50,51,52,53,54],
        [31,32,33,34,35,36,37,38,39,40,41,42]],
    4: [[67,68,69,70,71,72,73,74,75,76,77,78],
        [55,56,57,58,59,60,61,62,63,64,65,66]],
    5: [[87,88,89,90,91,92,93,94],
        [79,80,81,82,83,84,85,86]],
    6: [[103,104,105,106,107,108,109,110],
        [95,96,97,98,99,100,101,102]]
};

// === RENDER MAPA ===

function renderGrid(map) {

    const root = document.getElementById("plataformas");
    root.innerHTML = "";

    const ORDER = [1,2,3,4,5,6];

    ORDER.forEach(numPlat => {

        const filas = LAYOUT_PLATAFORMAS[numPlat];
        const platDiv = document.createElement("div");
        platDiv.className = "plataforma";

        const title = document.createElement("h2");
        title.textContent = `Plataforma ${numPlat}`;
        platDiv.appendChild(title);

        filas.forEach(fila => {
            const filaDiv = document.createElement("div");
            filaDiv.className = "fila";

            fila.forEach(cont => {

                if (cont === "ghost") {
                    const ghost = document.createElement("div");
                    ghost.className = "card ghost-card";
                    filaDiv.appendChild(ghost);
                    return;
                }

                const d = map[cont];
                const temp = d ? d.temperature_c : null;
                const ghs  = d ? d.ghsCount : 0;
                const mod  = d ? d.ghsMod : 0;
                const pot  = d ? d.potencia  : null;

                const card = document.createElement("div");
                card.className = "card";
                const bg = tempToColor(temp);
                card.style.background = bg;

                if (bg === "#f8e71c") card.classList.add("dark-text");

                card.style.cursor = "pointer";
                card.onclick = () => window.open(`http://10.160.${cont}.251/`, "_blank");

                card.innerHTML = `
                    <div class="c-label">C ${cont}</div>
                    <div class="temp field-temp">${temp !== null && !isNaN(temp) ? temp.toFixed(1) + "°C" : "N/D"}</div>
                    <div class="ghs field-ghs">${ghs} ONL</div>
                    <div class="mod field-mod">MOD: ${mod}</div>
                    <div class="pot field-pot">${pot !== null && !isNaN(pot) ? pot + " kW" : ""}</div>
`               ;


                filaDiv.appendChild(card);
            });

            platDiv.appendChild(filaDiv);
        });

        root.appendChild(platDiv);
    });
}
// ================================
// FILTROS
// ================================

function applyFieldFilters() {
    const checks = document.querySelectorAll('#filters input[type="checkbox"]');

    checks.forEach(chk => {
        const field = chk.dataset.field;
        const visible = chk.checked;

        document.querySelectorAll(`.field-${field}`).forEach(el => {
            el.style.display = visible ? "" : "none";
        });
    });
}

function setupFilterListeners() {
    const checks = document.querySelectorAll('#filters input[type="checkbox"]');
    
    checks.forEach(chk => {
        chk.addEventListener("change", applyFieldFilters);
    });
}

// ================================
// POTENCIA TOTAL (kW → MW)
// ================================

function updatePotenciaTotal(map) {
    let totalKW = 0;

    for (let i = 1; i <= TOTAL_CONTENEDORES; i++) {
        const d = map[i];
        if (!d) continue;

        const pot = d.potencia;
        if (pot !== null && !isNaN(pot)) {
            totalKW += pot;
        }
    }

    const totalMW = totalKW / 1000;

    const card = document.getElementById("total-potencia");
    if (!card) return;

    const value = card.querySelector(".pot-value");
    if (value) value.textContent = totalMW.toFixed(1) + " MW";

    card.classList.remove("potencia-azul","potencia-verde","potencia-rojo");

    if (totalMW < 98) card.classList.add("potencia-azul");
    else if (totalMW <= 102) card.classList.add("potencia-verde");
    else card.classList.add("potencia-rojo");
}

// ================================
// TOTAL DE MÁQUINAS ONLINE (Σ ghsCount)
// ================================

function updateMaquinasOnline(map) {
    let totalOnline = 0;

    for (let i = 1; i <= TOTAL_CONTENEDORES; i++) {
        const d = map[i];
        if (!d) continue;

        const ghs = d.ghsCount;
        if (ghs !== null && !isNaN(ghs)) {
            totalOnline += ghs;
        }
    }

    const card = document.getElementById("total-online");
    if (!card) return;

    const value = card.querySelector(".pot-value");
    if (value) value.textContent = totalOnline.toLocaleString("es-ES");
}
// ================================
// TOTAL DE MINERS MODULADOS (Σ ghsMod)
// ================================

function updateMinersModulados(map) {
    let totalMod = 0;

    for (let i = 1; i <= TOTAL_CONTENEDORES; i++) {
        const d = map[i];
        if (!d) continue;

        const mod = d.ghsMod;
        if (mod !== null && !isNaN(mod)) {
            totalMod += mod;
        }
    }

    const card = document.getElementById("total-modulados");
    if (!card) return;

    const value = card.querySelector(".pot-value");
    if (value) {
        value.textContent = totalMod.toLocaleString("es-ES");
    }
}

// ================================
// HASHRATE TOTAL (Σ hashrate_ph)
// ================================

function updateHashrateTotal(map) {
    let totalHashrate = 0;

    for (let i = 1; i <= TOTAL_CONTENEDORES; i++) {
        const d = map[i];
        if (!d) continue;

        const hash = d.hashrate_ph;
        if (hash !== null && !isNaN(hash)) {
            totalHashrate += hash;
        }
    }

    // Convertir de Terahash (TH) a Exahash (EH): 1 EH = 1,000,000 TH
    const totalEH = totalHashrate / 1000000;

    const card = document.getElementById("total-hashrate");
    if (!card) return;

    const value = card.querySelector(".pot-value");
    if (value) value.textContent = totalEH.toFixed(2) + " EH/s";
}


// === LOOP PRINCIPAL ===

async function update() {
    const rows = await loadCSV();
    if (!rows) return;

    const map = groupByContainerTakeLatest(rows);

    updatePotenciaTotal(map);
    updateMaquinasOnline(map);
    updateMinersModulados(map);
    updateHashrateTotal(map);
    renderGrid(map);
    applyFieldFilters();

    if (rows.length > 1) {
        const ts = rows[1].timestamp ?? rows[1].time ?? "";
        const box = document.getElementById("ultima-lectura");
        if (box) box.textContent = `Última lectura: ${ts}`;
    }
}

// Inicializar autenticación (cargar credenciales primero)
loadCredentials();

// Actualizar solo si está logueado
if (localStorage.getItem("scada_logged_in") === "true") {
    update();
    setupFilterListeners();
    setInterval(update, REFRESH_MS);
}












