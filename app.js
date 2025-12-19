// =======================================
// app.js — Mapa de calor Valenzuela
// =======================================

console.log("📌 APP.js cargado");

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

// === AGRUPACIÓN POR CONTENEDOR ===

function groupByContainerTakeLatest(rows) {
    const map = {};
    rows.forEach(r => {

        const ts = r["timestamp"] ?? r["time"] ?? "";
        const ip = r["ip"] ?? "";
        const ghsRaw = r["ghscount"];
        const tempRaw = r["temperature_c"];
        const potRaw  = r["potencia"];

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
            temperature_c: tempRaw !== "" ? Number(tempRaw) : NaN,
            potencia: potRaw !== "" ? Number(potRaw) : NaN
        };

        if (!map[cont] || entry.timestamp_ms >= map[cont].timestamp_ms)
            map[cont] = entry;
    });

    return map;
}

// === COLORES ===

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

// === RENDER DE TARJETAS ===

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
                    <div class="temp">${temp !== null && !isNaN(temp) ? temp.toFixed(1) + "°C" : "N/D"}</div>
                    <div class="ghs">${ghs} ONL</div>
                    <div class="pot">${pot !== null && !isNaN(pot) ? pot + " kW" : ""}</div>
                `;

                filaDiv.appendChild(card);
            });

            platDiv.appendChild(filaDiv);
        });

        root.appendChild(platDiv);
    });
}

// === LOOP ===

async function update() {
    const rows = await loadCSV();
    if (!rows) return;

    const map = groupByContainerTakeLatest(rows);
    renderGrid(map);

    if (rows.length > 1) {
        const ts = rows[1].timestamp ?? rows[1].time ?? "";
        const box = document.getElementById("ultima-lectura");
        if (box) box.textContent = `Última lectura: ${ts}`;
    }
}

update();
setInterval(update, REFRESH_MS);









