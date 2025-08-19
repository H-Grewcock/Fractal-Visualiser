// js/julia.js

const canvas = document.getElementById("juliaCanvas");
const ctx = canvas.getContext("2d");

// State:
let animationId = null;
let isPlaying = false;
let drawGrid = false;

// Recording states:
let mediaRecorder;
let recordedChunks = [];

// View (default):
let view = {
    xMin: -1.8,
    xMax: 1.8,
    yMin: -1.8,
    yMax: 1.8,
    zoomLevel: 1
};

// Julia constants:
let juliaK = {
    re: parseFloat(document.getElementById("juliaRe")?.value ?? "-0.7"),
    im: parseFloat(document.getElementById("juliaIm")?.value ?? "0.27015"),
};
let maxIter = parseInt(document.getElementById("juliaIterations").value ?? "100", 10);

const coordDisplay = document.getElementById("mouse-coords");
const zoomIndicator = document.getElementById("zoom-indicator");

// Pixel -> complex coordinates:
function pixelToComplex(x, y, v, w, h) {
    const re = v.xMin + (x / w) * (v.xMax - v.xMin);
    const im = v.yMin + (y / h) * (v.yMax - v.yMin);

    return { re, im };
}

// === JULIA SET ESCAPE TIME === //
function juliaEscape(z) {
    let iteration = 0;
    const max = maxIter;

    // While |z| <= 2
    while (z.re * z.re + z.im * z.im <= 4 && iteration < max) {
        // Formula z^2 = (x + iy)^2 = (x^2 - y^2 + 2xyi) + c
        const re = z.re * z.re - z.im * z.im + juliaK.re;
        const im = 2 * z.re * z.im + juliaK.im;
        z.re = re;
        z.im = im;

        iteration++;
    }

    // Returning the escape iteration, or maxIter if not escaped.
    return iteration;
}

// HSL -> RGB:
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function getColor(iter, maxIter) {
    if (iter === maxIter) {
        // Returns black for points not escaping:
        return [0, 0, 0];
    }

    // hue proportional to iter / maxIter:
    const hue = 360 * iter / maxIter;
    return hslToRgb(hue / 360, 1, 0.5);
}

// Updating the zoom indicator:
function updateZoomIndicator(view) {
    const el = document.getElementById("zoom-indicator");
    if (el) el.textContent = `Zoom: ${view.zoomLevel.toFixed(2)}x`;
}

// Auto-centering function:
function CenterViewFromInputs() {
    const xC = parseFloat(document.getElementById("juliaXCenter")?.value ?? "NaN");
    const yC = parseFloat(document.getElementById("juliaYCenter")?.value ?? "NaN");

    if (!Number.isNaN(xC) && !Number.isNaN(yC)) {
        const w = view.xMax - view.xMin;
        const h = view.yMax - view.yMin;
        view.xMin = xC - w / 2;
        view.xMax = xC + w / 2;
        view.yMin = yC - h / 2;
        view.yMax = yC + h / 2;
    }
}

// === DRAWING JULIA SET FUNCTION === //
function drawJulia() {
    maxIter = parseInt(document.getElementById("juliaIterations")?.value ?? "100", 10);
    const res = parseInt(document.getElementById("juliaResolution")?.value ?? "600", 10);

    // k parameter:
    juliaK.re = parseFloat(document.getElementById("juliaRe")?.value ?? "0.7");
    juliaK.im = parseFloat(document.getElementById("juliaIm")?.value ?? "0.27015");

    CenterViewFromInputs();
    canvas.width = res;
    canvas.height = res;

    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;

    for (let px = 0; px < canvas.width; px++) {
        for (let py = 0; py < canvas.height; py++) {
            const z0 = pixelToComplex(px, py, view, canvas.width, canvas.height);
            const iter = juliaEscape({ re: z0.re, im: z0.im });
            const [r, g, b] = getColor(iter, maxIter);
            const i = (py * canvas.width + px) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;      // alpha - opaque.
        }
    }

    ctx.putImageData(imgData, 0, 0);

    if (drawGrid) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
        ctx.beginPath();
        const step = canvas.width / 10;

        for (let i = 0; i <= canvas.width; i += step) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, canvas.height);
            ctx.moveTo(0, i);
            ctx.lineTo(canvas.width, i);
        }

        ctx.stroke();
    }

    updateZoomIndicator(view);
}

// === VIEWING === //
function updateView(zx, zy, scaleFactor) {
    const width = (view.xMax - view.xMin) / scaleFactor;
    const height = (view.yMax - view.yMin) / scaleFactor;

    view.xMin = zx - width / 2;
    view.xMax = zx + width / 2;
    view.yMin = zy - height / 2;
    view.yMax = zy + height / 2;

    // Zooming in and out:
    view.zoomLevel *= scaleFactor;
}

// Zoom in with left-click:
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const z = pixelToComplex(x, y, view, canvas.width, canvas.height);
    updateView(z.re, z.im, 2);      // 2 x zoom-in

    drawJulia();
});

// Zoom out with right-click:
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();     // Prevents defaulting

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const z = pixelToComplex(x, y, view, canvas.width, canvas.height);
    updateView(z.re, z.im, 0.5);    // 0.5 x, i.e. 2 x zoom-out

    drawJulia();
});

// Mouse tracking:
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const z = pixelToComplex(x, y, view, canvas.width, canvas.height);

    coordDisplay.textContent = `X: ${z.re.toFixed(5)}, Y: ${z.im.toFixed(5)}`;
});

// === DRAGGING TO PAN === //
function enableDragToPan(canvas, getParams, updateInputs, redraw) {
    let isDragging = false;
    let startX, startY;

    canvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
    });

    canvas.addEventListener("mouseup", () => (isDragging = false));
    canvas.addEventListener("mouseleave", () => (isDragging = false));

    canvas.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        const dx = currentX - startX;
        const dy = currentY - startY;

        // Pixel -> complex using the current scale:
        const { res, zx, zy } = getParams();
        const deltaRe = -dx * (view.xMax - view.xMin) / res;
        const deltaIm = -dy * (view.yMax - view.yMin) / res;

        updateInputs(zx + deltaRe, zy + deltaIm);
        startX = currentX;
        startY = currentY;
    });
}

enableDragToPan(
    canvas,
    () => ({
        res: canvas.width,
        // zx and zy -- halfway points:
        zx: (view.xMin + view.xMax) / 2,
        zy: (view.yMin + view.yMax) / 2
    }),
    (newZx, newZy) => {
        // shifting by dx and dy.
        const dx = newZx - (view.xMin + view.xMax) / 2;
        const dy = newZy - (view.yMin + view.yMax) / 2;
        view.xMin += dx;
        view.xMax += dx;
        view.yMin += dy;
        view.yMax += dy;

        // Redrawing:
        drawJulia();
    },
    drawJulia
);

// === BUTTONS === //
document.getElementById("drawJulia")?.addEventListener("click", drawJulia);
document.getElementById("clearJulia")?.addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});
document.getElementById("exportJulia")?.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = "julia.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
});
document.getElementById("resetView")?.addEventListener("click", () => {
    view = {
        xMin: -1.8,
        xMax: 1.8,
        yMin: -1.8,
        yMax: 1.8,
        zoomLevel: 1,
    };
    drawJulia();
});

document.getElementById("toggleGrid")?.addEventListener("click", () => {
    drawGrid = !drawGrid;
    drawJulia();
});

document.getElementById("togglePlayJulia")?.addEventListener("click", () => {
    if (isPlaying) {
        cancelAnimationFrame(animationId);
        isPlaying = false;
    } else {
        isPlaying = true;
        animateZoom();
    }
});

function animateZoom() {
    if (!isPlaying) return;
    const cx = (view.xMin + view.xMax) / 2;
    const cy = (view.yMin + view.yMax) / 2;
    updateView(cx, cy, 1.05);
    drawJulia();
    animationId = requestAnimationFrame(animateZoom);
}

// === RECORDING === //
document.getElementById("startRecordingJulia")?.addEventListener("click", () => {
    recordedChunks = [];
    const stream = canvas.captureStream(30);
    try {
        mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    } catch {
        // Fallback without mimeType if needed
        mediaRecorder = new MediaRecorder(stream);
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };
    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "julia_animation.webm";
        a.click();
        URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
});

document.getElementById("stopRecordingJulia")?.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
});

// === INITIAL RENDERING === //
drawJulia();
updateZoomIndicator(view);