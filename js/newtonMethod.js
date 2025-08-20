// js/newtonMethod.js

const canvas = document.getElementById("newtonCanvas");
const ctx = canvas.getContext("2d");

// States:
let animationId = null;
let isPlaying = false;
let drawGrid = false;

// Recording states:
let mediaRecorder;
let recordedChunks = [];

// === UI ELEMENTS === //
const coordDisplay = document.getElementById("mouse-coords");

const iterationsInput = document.getElementById("newtonIterations");
const resolutionInput = document.getElementById("newtonResolution");
const kRealInput = document.getElementById("kReal");
const kImagInput = document.getElementById("kImag");

const drawBtn = document.getElementById("drawNewton");
const clearBtn = document.getElementById("clearNewton");
const exportBtn = document.getElementById("exportNewton");
const resetViewBtn = document.getElementById("resetViewNewton") || document.getElementById("resetView");
const toggleGridBtn = document.getElementById("toggleGridNewton") || document.getElementById("toggleGrid");
const toggleAnimBtn = document.getElementById("toggleAnimationNewton") || document.getElementById("toggleAnimation");
const startRecBtn = document.getElementById("startRecordingNewton") || document.getElementById("startRecording");
const stopRecBtn = document.getElementById("stopRecordingNewton") || document.getElementById("stopRecording");

// View (default):
let view = {
    xMin: -2,
    xMax: 2,
    yMin: -2,
    yMax: 2,
    zoomLevel: 1
};

let maxIter = parseInt(iterationsInput?.value || "50", 10);
let res = parseInt(resolutionInput?.value || "800", 10);

// Constants:
let kVals = {
    re: parseFloat(kRealInput?.value || "-0.5"),
    im: parseFloat(kImagInput?.value || "0.5")
};

// === COMPLEX ARITHMETIC === //
function cAdd(a, b) {
    return {
        r: a.r + b.r,
        i: a.i + b.i
    };
}
function cSub(a, b) {
    return {
        r: a.r - b.r,
        i: a.i - b.i
    };
}

function cMul(a, b) {
    return {
        r: a.r * b.r - a.i * b.i,
        i: a.r * b.i + a.i * b.r
    };
}

function cDiv(a, b) {
    const denominator = b.r * b.r + b.i * b.i;
    if (denominator === 0) return { r: Infinity, i: Infinity };

    return {
        r: (a.r * b.r + a.i * b.i) / denominator,
        i: (a.i * b.r - a.r * b.i) / denominator
    };
}

function cAbs(a) {
    return Math.hypot(a.r, a.i);
}

function cScale(a, s) {
    return {
        r: a.r * s,
        i: a.i * s
    };
}

function cSqr(a) {
    return cMul(a, a);
}
function cCube(a) {
    return cMul(cMul(a, a), a);
}

// Formula: f(z) = z**3 + (k-1)*z - k
function f(z, k) {
    const kMinus1 = {
        r: k.r - 1,
        i: k.i
    };
    return cSub(cAdd(cCube(z), cMul(kMinus1, z)), k);
}

// f'(z) = 3*z**2 + (k-1):
function derivF(z, k) {
    const threeZ2 = cScale(cSqr(z), 3);
    const kMinus1 = {
        r: k.r - 1,
        i: k.i
    };
    return cAdd(threeZ2, kMinus1);
}

// Pixel -> complex coordinates:
function pixelToComplex(x, y, view, canvasWidth, canvasHeight) {
    const real = view.xMin + (x / canvasWidth) * (view.xMax - view.xMin);
    const imag = view.yMin + (y / canvasHeight) * (view.yMax - view.yMin);

    return { r: real, i: imag };
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

const hues = [0, 120, 240];      // red, green and blue -- up to 3 roots.

// Updating the zoom indicator:
function updateZoomIndicator(v = view) {
    const el = document.getElementById("zoom-indicator");
    if (el) el.textContent = `Zoom: ${v.zoomLevel.toFixed(2)}x`;
}

// === NEWTON ITERATION & IDENTIFYING ROOTS === //
function classifyRoot(z, roots, tol = 1e-6) {
    for (let i = 0; i < roots.length; i++) {
        if (cAbs(cSub(z, roots[i])) < tol) {
            return i;
        }
    }
    roots.push(z);

    return roots.length - 1;
}

function newtonConverge(z0, k, maxIter, tol, roots) {
    let z = {
        r: z0.r,
        i: z0.i
    };
    for (let iter = 0; iter < maxIter; iter++) {
        const fz = f(z, k);
        const dfz = derivF(z, k);
        const dfzAbs = cAbs(dfz);

        // Entire we don't divide by 0
        if (!isFinite(dfzAbs) || dfzAbs === 0) {
            break;
        }

        const step = cDiv(fz, dfz);
        z = cSub(z, step);

        if (cAbs(fz) < tol) {
            const idx = classifyRoot(z, roots);
            return { hit: true, idx, iter };
        }
    }

    return { hit: false, idx: -1, iter: maxIter };
}

// === DRAWING FUNCTION === //
function drawNewton() {
    res = parseInt(resolutionInput?.value || String(res), 10);
    maxIter = parseInt(iterationsInput?.value || String(maxIter), 10);
    kVals.re = parseFloat(kRealInput?.value || String(kVals.re));
    kVals.im = parseFloat(kImagInput?.value || String(kVals.im));
    const k = { r: kVals.re, i: kVals.im };

    canvas.width = res;
    canvas.height = res;

    const imgData = ctx.createImageData(res, res);
    const data = imgData.data;

    const tol = 1e-6;
    const roots = [];       // empty list to find roots.

    for (let x = 0; x < res; x++) {
        for (let y = 0; y < res; y++) {
            const z0 = pixelToComplex(x, y, view, res, res);
            const r = newtonConverge(z0, k, maxIter, tol, roots);

            let R = 0, G = 0, B = 0;
            if (r.hit) {
                const basehue = hues[r.idx % hues.length];
                const t = r.iter / maxIter;    // in [0,1].
                const hue = basehue / 360;
                const saturation = 1;
                const light = 0.6 - 0.4 * t;   // in [0.2, 0.6].
                [R, G, B] = hslToRgb(hue, saturation, Math.max(0.15, light));
            } else {
                // Default black.
                [R, G, B] = [0, 0, 0];
            }

            const i = 4 * (y * res + x);
            data[i] = R;
            data[i + 1] = G;
            data[i + 2] = B;
            data[i + 3] = 255;      // alpha - opaque.
        }
    }

    ctx.putImageData(imgData, 0, 0);

    if (drawGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        for (let i = 0; i <= res; i += res / 10) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i, res);
            ctx.moveTo(0, i);
            ctx.lineTo(res, i);
        }

        ctx.stroke();
    }

    updateZoomIndicator();
}

function updateView(cx, cy, scaleFactor) {
    const width = (view.xMax - view.xMin) / scaleFactor;
    const height = (view.yMax - view.yMin) / scaleFactor;

    view.xMin = cx - width / 2;
    view.xMax = cx + width / 2;
    view.yMin = cy - height / 2;
    view.yMax = cy + height / 2;

    view.zoomLevel *= scaleFactor;
}

// === MOUSE EVENTS === //
if (canvas) {
    // Zooming in with left click:
    canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = pixelToComplex(x, y, view, canvas.width, canvas.height);

        updateView(c.r, c.i, 2);
        drawNewton();
    });

    // Zooming out with right click:
    canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();     // Prevents defaulting, i.e. prevents browser menu

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = pixelToComplex(x, y, view, canvas.width, canvas.height);

        updateView(c.r, c.i, 0.5);
        drawNewton();
    });

    // Mouse tracking:
    canvas.addEventListener("mousemove", (e) => {
        if (!coordDisplay) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = pixelToComplex(x, y, view, canvas.width, canvas.height);

        coordDisplay.textContent = `X: ${c.r.toFixed(5)}, Y: ${c.i.toFixed(5)}`;
    });
}

// === DRAGGING TO PAN === //
function enableDragToPan(canvas, getParams, updateInputs, redraw) {
    let isDragging = false;
    let startX;
    let startY;

    canvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
    });

    canvas.addEventListener("mouseup", () => isDragging = false);
    canvas.addEventListener("mouseleave", () => isDragging = false);

    canvas.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        const dx = currentX - startX;
        const dy = currentY - startY;

        // Pixel -> complex using the current scale:
        const { res, cx, cy } = getParams();
        const deltaRe = -dx * (view.xMax - view.xMin) / res;
        const deltaIm = -dy * (view.yMax - view.yMin) / res;

        updateInputs(cx + deltaRe, cy + deltaIm);
        startX = currentX;
        startY = currentY;
    });
}

enableDragToPan(
    canvas,
    () => ({
        res: canvas.width,
        // cx and cy -- halfway points:
        cx: (view.xMin + view.xMax) / 2,
        cy: (view.yMin + view.yMax) / 2
    }),
    (newCx, newCy) => {
        // shifting by dx and dy.
        const dx = newCx - (view.xMin + view.xMax) / 2;
        const dy = newCy - (view.yMin + view.yMax) / 2;
        view.xMin += dx;
        view.xMax += dx;
        view.yMin += dy;
        view.yMax += dy;
        
        // Redrawing:
        drawNewton();
    },
    drawNewton
);

// === BUTTONS === //
if (drawBtn) {
    drawBtn.addEventListener("click", drawNewton);
}
if (clearBtn) {
    clearBtn.addEventListener("click", () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
}

if (exportBtn) {
    exportBtn.addEventListener("click", () => {
        const link = document.createElement("a");
        link.download ='newton.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

if (resetViewBtn) {
    resetViewBtn.addEventListener("click", () => {
        view = {
            xMin: -2,
            xMax: 2,
            yMin: -2,
            yMax: 2,
            zoomLevel: 1
        };

        updateZoomIndicator();
        drawNewton();
    });
}

if (toggleGridBtn) {
    toggleGridBtn.addEventListener("click", () => {
        drawGrid = !drawGrid;
        drawNewton();
    });
}

// === ZOOM ANIMATION === //
function animateZoom() {
    if (!isPlaying) return;

    const cx = (view.xMin + view.xMax) / 2;
    const cy = (view.yMin + view.yMax) / 2;
    updateView(cx, cy, 1.05);
    drawNewton();
    animationId = requestAnimationFrame(animateZoom);
}

if (toggleAnimBtn) {
    toggleAnimBtn.addEventListener("click", () => {
        if (isPlaying) {
            cancelAnimationFrame(animationId);
            isPlaying = false;
        } else {
            isPlaying = true;
            animateZoom();
        }
    });
}

// === RECORDING === //
if (startRecBtn) {
    startRecBtn.addEventListener("click", () => {
        recordedChunks = [];
        const stream = canvas.captureStream(30);
        mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };

        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "newton_animation.webm";
            a.click();
        }

        mediaRecorder.start();
    });
}

if (stopRecBtn) {
    stopRecBtn.addEventListener("click", () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
    });
}

// === INITIAL RENDERING === //
drawNewton();
updateZoomIndicator();

window.nView = view;
window.nUpdateZoomIndicator = updateZoomIndicator;