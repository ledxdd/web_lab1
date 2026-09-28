"use strict";

const STORAGE_KEY = "results";
const X_MIN = -3;
const X_MAX = 3;
const Y_VALUES = new Set([-3, -2, -1, 0, 1, 2, 3, 4, 5]);
const R_VALUES = new Set([1, 2, 3, 4, 5]);

const form = document.getElementById("point-form");
const xInput = document.getElementById("x-value");
const rInput = document.getElementById("r-value");
const rButtons = Array.from(document.querySelectorAll("button[data-r]"));
const clearHistoryButton = document.getElementById("clear-history");
const message = document.getElementById("form-message");
const tableBody = document.querySelector("#results-table tbody");
const canvas = document.getElementById("area-canvas");
const context = canvas.getContext("2d");

let history = loadHistory();
let lastPoint = history.length > 0 ? history[history.length - 1] : null;
let lastAcceptedX = "";
let currentTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function isPartialNumber(value) {
    return /^-?(?:\d*(?:[.,]\d*)?)?$/.test(value);
}

function parseX(value) {
    const normalized = value.trim().replace(",", ".");

    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
        return null;
    }

    const negative = normalized.startsWith("-");
    const unsigned = negative ? normalized.slice(1) : normalized;
    let [integerPart, fractionPart = ""] = unsigned.split(".");

    if (integerPart === "") {
        integerPart = "0";
    }

    const scale = 10n ** BigInt(fractionPart.length);
    const digits = `${integerPart}${fractionPart}`;
    let numerator = BigInt(digits);

    if (negative) {
        numerator = -numerator;
    }

    if (numerator < BigInt(X_MIN) * scale || numerator > BigInt(X_MAX) * scale) {
        return null;
    }

    return {
        text: `${negative ? "-" : ""}${integerPart}${fractionPart === "" ? "" : `.${fractionPart}`}`,
        numerator,
        scale
    };
}

function isHit(x, y, radius) {
    const exactX = typeof x === "string" || typeof x === "number" ? parseX(String(x)) : x;
    const numerator = exactX.numerator;
    const scale = exactX.scale;
    const exactY = BigInt(y);
    const exactRadius = BigInt(radius);
    const scaledRadius = exactRadius * scale;

    const rectangle = numerator >= 0n
        && numerator <= scaledRadius
        && exactY >= 0n
        && exactY <= exactRadius;
    const triangle = numerator >= -scaledRadius
        && numerator <= 0n
        && exactY >= 0n
        && exactY * scale <= numerator + scaledRadius;
    const quarterCircle = numerator >= 0n
        && exactY <= 0n
        && 4n * (numerator * numerator + exactY * exactY * scale * scale)
            <= exactRadius * exactRadius * scale * scale;

    return rectangle || triangle || quarterCircle;
}

function setMessage(text, kind = "") {
    message.textContent = text;

    if (kind) {
        message.dataset.kind = kind;
    } else {
        delete message.dataset.kind;
    }
}

function selectRadius(radius) {
    rInput.value = String(radius);

    rButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(Number(button.dataset.r) === radius));
    });
}

function isStoredEntryValid(entry) {
    return entry !== null
        && typeof entry === "object"
        && (typeof entry.x === "string" || Number.isFinite(entry.x))
        && parseX(String(entry.x)) !== null
        && Number.isFinite(entry.y)
        && Number.isFinite(entry.r)
        && Number.isFinite(entry.timestamp)
        && typeof entry.hit === "boolean"
        && Y_VALUES.has(entry.y)
        && R_VALUES.has(entry.r);
}

function loadHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

        return Array.isArray(parsed) ? parsed.filter(isStoredEntryValid) : [];
    } catch {
        return [];
    }
}

function saveHistory() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(history));

        return true;
    } catch {
        setMessage("Не удалось сохранить историю в LocalStorage.", "error");

        return false;
    }
}

function formatNumber(value) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 8 }).format(value);
}

function formatX(value) {
    return typeof value === "string" ? value.replace(".", ",") : formatNumber(value);
}

function formatTimestamp(timestamp) {
    return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(new Date(timestamp));
}

function appendCell(row, text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text;

    if (className) {
        cell.className = className;
    }

    row.append(cell);
}

function renderHistory() {
    tableBody.replaceChildren();

    if (history.length === 0) {
        const row = document.createElement("tr");
        row.className = "empty-row";
        const cell = document.createElement("td");
        cell.colSpan = 5;
        cell.textContent = "Проверок пока нет";
        row.append(cell);
        tableBody.append(row);
        clearHistoryButton.disabled = true;
        return;
    }

    history.slice().reverse().forEach((entry) => {
        const row = document.createElement("tr");
        appendCell(row, formatX(entry.x));
        appendCell(row, formatNumber(entry.y));
        appendCell(row, formatNumber(entry.r));
        appendCell(row, entry.hit ? "Попадание" : "Промах", entry.hit ? "result-hit" : "result-miss");
        appendCell(row, formatTimestamp(entry.timestamp));
        tableBody.append(row);
    });

    clearHistoryButton.disabled = false;
}

function drawLine(x1, y1, x2, y2) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
}

function drawGraph(point = null) {
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radiusPixels = 150;
    const halfRadiusPixels = radiusPixels / 2;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "#3498ed";
    context.strokeStyle = "#1976c8";
    context.lineWidth = 2;

    context.beginPath();
    context.rect(centerX, centerY - radiusPixels, radiusPixels, radiusPixels);
    context.fill();
    context.stroke();

    context.beginPath();
    context.moveTo(centerX - radiusPixels, centerY);
    context.lineTo(centerX, centerY - radiusPixels);
    context.lineTo(centerX, centerY);
    context.closePath();
    context.fill();
    context.stroke();

    context.beginPath();
    context.moveTo(centerX, centerY);
    context.arc(centerX, centerY, halfRadiusPixels, 0, Math.PI / 2);
    context.closePath();
    context.fill();
    context.stroke();

    context.strokeStyle = "#172033";
    context.fillStyle = "#172033";
    context.lineWidth = 2;
    drawLine(34, centerY, width - 28, centerY);
    drawLine(centerX, height - 34, centerX, 28);

    context.beginPath();
    context.moveTo(width - 28, centerY);
    context.lineTo(width - 39, centerY - 6);
    context.moveTo(width - 28, centerY);
    context.lineTo(width - 39, centerY + 6);
    context.moveTo(centerX, 28);
    context.lineTo(centerX - 6, 39);
    context.moveTo(centerX, 28);
    context.lineTo(centerX + 6, 39);
    context.stroke();

    const ticks = [-radiusPixels, -halfRadiusPixels, halfRadiusPixels, radiusPixels];
    ticks.forEach((offset) => {
        drawLine(centerX + offset, centerY - 5, centerX + offset, centerY + 5);
        drawLine(centerX - 5, centerY + offset, centerX + 5, centerY + offset);
    });

    context.font = "17px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillText("−R", centerX - radiusPixels, centerY + 10);
    context.fillText("−R/2", centerX - halfRadiusPixels, centerY + 10);
    context.fillText("R/2", centerX + halfRadiusPixels, centerY + 10);
    context.fillText("R", centerX + radiusPixels, centerY + 10);

    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("R", centerX + 10, centerY - radiusPixels);
    context.fillText("R/2", centerX + 10, centerY - halfRadiusPixels);
    context.fillText("−R/2", centerX + 10, centerY + halfRadiusPixels);
    context.fillText("−R", centerX + 10, centerY + radiusPixels);
    context.font = "italic 21px Georgia, serif";
    context.fillText("x", width - 24, centerY - 17);
    context.fillText("y", centerX + 12, 21);

    if (point && R_VALUES.has(point.r)) {
        const scale = radiusPixels / point.r;
        const numericX = Number(String(point.x).replace(",", "."));
        const pointX = centerX + numericX * scale;
        const pointY = centerY - point.y * scale;
        context.beginPath();
        context.arc(pointX, pointY, 6, 0, Math.PI * 2);
        context.fillStyle = point.hit ? "#159447" : "#d33b34";
        context.fill();
        context.strokeStyle = "#fff";
        context.lineWidth = 2;
        context.stroke();
    }
}

xInput.addEventListener("input", () => {
    if (isPartialNumber(xInput.value)) {
        lastAcceptedX = xInput.value;
    } else {
        xInput.value = lastAcceptedX;
    }

    xInput.removeAttribute("aria-invalid");
    setMessage("");
});

rButtons.forEach((button) => {
    button.addEventListener("click", () => {
        selectRadius(Number(button.dataset.r));
        setMessage("");
    });
});

form.addEventListener("submit", (event) => {
    event.preventDefault();

    const x = parseX(xInput.value);
    const checkedY = form.querySelector('input[name="y"]:checked');
    const y = checkedY ? Number(checkedY.value) : null;
    const radius = rInput.value === "" ? null : Number(rInput.value);

    xInput.setAttribute("aria-invalid", String(x === null));

    if (x === null) {
        setMessage("Введите число X в диапазоне от −3 до 3.", "error");
        xInput.focus();

        return;
    }
    if (!Y_VALUES.has(y)) {
        setMessage("Выберите одно из допустимых значений Y.", "error");

        return;
    }
    if (!R_VALUES.has(radius)) {
        setMessage("Выберите положительное значение R.", "error");

        return;
    }

    const entry = {
        x: x.text,
        y,
        r: radius,
        hit: isHit(x, y, radius),
        timestamp: Date.now()
    };

    history.push(entry);
    lastPoint = entry;
    const saved = saveHistory();
    renderHistory();
    drawGraph(lastPoint);

    if (saved) {
        setMessage(entry.hit ? "Точка попала в заданную область." : "Точка не попала в заданную область.", "success");
    }
});

clearHistoryButton.addEventListener("click", () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
        history = [];
        lastPoint = null;

        renderHistory();
        drawGraph();
        setMessage("История проверок очищена.", "success");
    } catch {
        setMessage("Не удалось очистить историю в LocalStorage.", "error");
    }
});

window.setInterval(() => {
    const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (detectedTimeZone !== currentTimeZone) {
        currentTimeZone = detectedTimeZone;
        renderHistory();
    }
}, 30000);

if (lastPoint) {
    selectRadius(lastPoint.r);
}

renderHistory();
drawGraph(lastPoint);
