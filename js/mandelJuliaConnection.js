// js/mandelJuliaConnection.js

const canvas = document.getElementById("mandelJuliaCanvas");
const ctx = canvas.getContext("2d");

// View (default):
let view = {
    xMin: -2,
    xMax: 2,
    yMin: -2,
    yMax: 2,
    zoomLevel: 1
};
let maxIter = parseInt(document.getElementById("mandelJuliaIterations").value);
let mode = "mandelbrot";
let constantK = { real: 0, imag: 0 };

// === UI ELEMENTS === //
const kValueDisplay = document.getElementById("kValueDisplay");
const kRealInput = document.getElementById("kReal");
const kImagInput = document.getElementById("kImag");
const mouseCoordsDisplay = document.getElementById("mouse-coords");

let drawGrid = false;

// Animation states:
let zoomPlaying = false;
let juliaAnimating = false;
let zoomAnimationId = null;
let juliaAnimationId = null;

// Video recording
let mediaRecorder;
let recordedChunks = [];

// Pixel -> complex coordinates:
function pixelToComplex(x, y) {
    const real = view.xMin + (x / canvas.width) * (view.xMax - view.xMin);
    const imag = view.yMin + (y / canvas.height) * (view.yMax - view.yMin);

    return { real, imag };
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
        // Returns black for points not escaping.
        return [0, 0, 0];
    }

    const hue = 360 * iter / maxIter;
    return hslToRgb(hue / 360, 1, 0.5);
}

// Updating the zoom indicator:
function updateZoomIndicator(v = view) {
    const el = document.getElementById("zoom-indicator");
    if (el) el.textContent = `Zoom: ${v.zoomLevel.toFixed(2)}x`;
}

// === DRAWING FUNCTION === //
function drawFractal() {
    maxIter = parseInt(document.getElementById("mandelJuliaIterations").value);
    const res = parseInt(document.getElementById("mandelJuliaResolution").value);
    canvas.width = res;
    canvas.height = res;

    const imgData = ctx.createImageData(res, res);
    const data = imgData.data;

    for (let x = 0; x < res; x++) {
        for (let y = 0; y < res; y++) {
            const c = pixelToComplex(x, y);
            let zx, zy, cx, cy;

            if (mode === "mandelbrot") {
                zx = 0; zy = 0;
                cx = c.real; cy = c.imag;
            } else {
                zx = c.real; zy = c.imag;
                cx = constantK.real; cy = constantK.imag;
            }

            let iter = 0;
            // while |z| <= 2:
            while (zx * zx + zy * zy <= 4 && iter < maxIter) {
                // // Formula z^2 = (x + iy)^2 = (x^2 - y^2 + 2xyi)
                const xtemp = zx * zx - zy * zy + cx;
                zy = 2 * zx * zy + cy;
                zx = xtemp;
                iter++;
            }

            const [r, g, b] = getColor(iter, maxIter);
            const i = 4 * (y * res + x);
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;      // alpha - opaque.
        }
    }

    ctx.putImageData(imgData, 0, 0);

    if (drawGrid) {
        ctx.strokeStyle = '#444';
        ctx.beginPath();

        for (let i = 0; i <= res; i += res / 10) {
            ctx.moveTo(i, 0); ctx.lineTo(i, res);
            ctx.moveTo(0, i); ctx.lineTo(res, i);
        }

        ctx.stroke();
    }
}

// Updating k display:
function updateKDisplay() {
    const a = parseFloat(kRealInput.value) || 0;
    const b = parseFloat(kImagInput.value) || 0;
    kDisplay.textContent = `k = ${a.toFixed(3)} + ${b.toFixed(3)}i`;
}

// === ZOOMING === //
function updateView(cx, cy, scaleFactor) {
    const width = (view.xMax - view.xMin) / scaleFactor;
    const height = (view.yMax - view.yMin) / scaleFactor;

    view.xMin = cx - width / 2;
    view.xMax = cx + width / 2;
    view.yMin = cy - height / 2;
    view.yMax = cy + height / 2;

    view.zoomLevel *= scaleFactor;
    updateZoomIndicator();
    drawFractal();
}

// Zoom in on click
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = pixelToComplex(x, y);

    updateView(c.real, c.imag, 2);      // 2 x zoom-in
});

// Zoom out on right click
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();     // prevents defaulting, i.e. prevents browser menu
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = pixelToComplex(x, y);

    updateView(c.real, c.imag, 0.5);        // 0.5 x, i.e. 2 x zoom-out
});

// Scrolling to zoom:
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const scaleFactor = 1.1;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const c = pixelToComplex(mouseX, mouseY);

    // Zoom in or out
    const zoom = e.deltaY < 0 ? scaleFactor : 1 / scaleFactor;

    // Update view range centered at mouse point
    const width = (view.xMax - view.xMin) / zoom;
    const height = (view.yMax - view.yMin) / zoom;

    view.xMin = c.real - width / 2;
    view.xMax = c.real + width / 2;
    view.yMin = c.imag - height / 2;
    view.yMax = c.imag + height / 2;

    // Zooming in and out:
    view.zoomLevel *= zoom;
    updateZoomIndicator(view);

    drawFractal();
});

// Mouse tracking:
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = pixelToComplex(x, y);

    mouseCoordsDisplay.textContent = `X: ${c.real.toFixed(5)}, Y: ${c.imag.toFixed(5)}`;
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

    canvas.addEventListener("mouseup", () => isDragging = false);
    canvas.addEventListener("mouseleave", () => isDragging = false);

    canvas.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        // Pixel -> complex using the current scale:
        const { res, cx, cy } = getParams();
        const deltaRe = - (currentX - startX) * (view.xMax - view.xMin) / res;
        const deltaIm = - (currentY - startY) * (view.yMax - view.yMin) / res;

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
        // shifting by dx and dy
        const dx = newCx - (view.xMin + view.xMax) / 2;
        const dy = newCy - (view.yMin + view.yMax) / 2;
        view.xMin += dx;
        view.xMax += dx;
        view.yMin += dy;
        view.yMax += dy;

        // Redrawing:
        drawFractal();
    },
    drawFractal
);

// === BUTTONS === //
document.getElementById("mandelbrotBtn").addEventListener("click", () => {
    mode = "mandelbrot";
    drawFractal();
});

document.getElementById("juliaBtn").addEventListener("click", () => {
    constantK.real = parseFloat(kRealInput.value);
    constantK.imag = parseFloat(kImagInput.value);
    mode = "julia";

    drawFractal();
});

document.getElementById("resetZoomBtn").addEventListener("click", () => {
    view = {
        xMin: -2,
        xMax: 2,
        yMin: -2,
        yMax: 2,
        zoomLevel: 1
    };

    updateZoomIndicator();
    drawFractal();
});

document.getElementById("exportBtn").addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `fractal_${mode}.png`;
    link.href = canvas.toDataURL();
    link.click();
});

// === ANIMATION FUNCTIONS === //
function animateZoom() {
    if (!zoomPlaying) return;

    updateView((view.xMin + view.xMax) / 2, (view.yMin + view.yMax) / 2, 1.05);
    zoomAnimationId = requestAnimationFrame(animateZoom);
}

function animateJulia() {
    constantK.real = Math.sin(Date.now() * 0.01) * 0.7885;   
    constantK.imag = Math.cos(Date.now() * 0.001) * 0.7885;
    
    if (mode === "julia") drawFractal();
    juliaAnimationId = requestAnimationFrame(animateJulia);
}

document.getElementById("stopRecording")?.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
});

// === ANIMATION BUTTONS === //
document.getElementById("toggleZoomAnimation")?.addEventListener("click", () => {
    zoomPlaying = !zoomPlaying;
    if (zoomPlaying) animateZoom();
    else cancelAnimationFrame(zoomAnimationId);
});

document.getElementById("toggleJuliaAnimation")?.addEventListener("click", () => {
    juliaAnimating = !juliaAnimating;
    if (juliaAnimating) animateJulia();
    else cancelAnimationFrame(juliaAnimationId);
});

// === RECORDING BUTTONS === //
document.getElementById("startRecording")?.addEventListener("click", () => {
    recordedChunks = [];
    const stream = canvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fractal_animation.webm";
        a.click();
    };

    mediaRecorder.start();
});

document.getElementById("stopRecording")?.addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
});

// === K INPUT EVENTS === //
function handleKInput() {
    constantK.real = parseFloat(kRealInput.value) || 0;
    constantK.imag = parseFloat(kImagInput.value) || 0;
    updateKDisplay();

    if (mode === "julia") drawFractal();
}

// === INITIAL DRAW === //
drawFractal();
updateKDisplay();
updateZoomIndicator();