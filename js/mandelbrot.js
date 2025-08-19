// js/mandelbrot.js

const canvas = document.getElementById("mandelbrotCanvas");
const ctx = canvas.getContext("2d");

// States:
let animationId = null;
let isPlaying = false;
let drawGrid = false;

// Recording states:
let mediaRecorder;
let recordedChunks = [];

// View (default):
let view = {
    xMin: -2.5,
    xMax: 1,
    yMin: -1.5,
    yMax: 1.5,
    zoomLevel: 1
};
let maxIter = parseInt(document.getElementById("mandelIterations").value);

const coordDisplay = document.getElementById("mouse-coords");

// Pixel -> complex coordinates:
function pixelToComplex(x, y, view, canvasWidth, canvasHeight) {
    const real = view.xMin + (x / canvasWidth) * (view.xMax - view.xMin);
    const imag = view.yMin + (y / canvasHeight) * (view.yMax - view.yMin);

    return { real, imag };
}

// === MANDELBROT ESCAPE TIME === //
function mandelbrotEscape(cx, cy, maxIter) {
    // Starting from z = 0:
    let x = 0;
    let y = 0;
    let iter = 0;

    // While |z| <= 2
    while (x * x + y * y <= 4 && iter < maxIter) {
        // Formula z^2 = (x + iy)^2 = (x^2 - y^2 + 2xyi)
        let xtemp = x * x - y * y + cx;
        y = 2 * x * y + cy;
        x = xtemp;
        iter++;
    }

    // Returning the escape iteration, or maxIter if not escaped.
    return iter;
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

    // hue is proportional to iter / maxIter:
    const hue = 360 * iter / maxIter;
    return hslToRgb(hue / 360, 1, 0.5);
}

// Updating the zoom indicator:
function updateZoomIndicator(view) {
    const el = document.getElementById("zoom-indicator");
    if (el) el.textContent = `Zoom: ${view.zoomLevel.toFixed(2)}x`;
}

// === DRAWING MANDELBROT FUNCTION === //
function drawMandelbrot() {
    maxIter = parseInt(document.getElementById("mandelIterations").value);
    const res = parseInt(document.getElementById("mandelResolution").value);

    canvas.width = res;
    canvas.height = res;

    const imgData = ctx.createImageData(res, res);
    const data = imgData.data;

    for (let x = 0; x < res; x++) {
        for (let y = 0; y < res; y++) {
            const c = pixelToComplex(x, y, view, res, res);
            const iter = mandelbrotEscape(c.real, c.imag, maxIter);
            const [r, g, b] = getColor(iter, maxIter);
            const i = 4 * (y * res + x);
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;      // alpha - opaque.
        }
    }

    ctx.putImageData(imgData, 0, 0);

    // Generating 10x10 grid:
    if (drawGrid) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        for (let i = 0; i <= res; i += res / 10) {
            ctx.moveTo(i, 0); ctx.lineTo(i, res);
            ctx.moveTo(0, i); ctx.lineTo(res, i);
        }
        ctx.stroke();
    }

    updateZoomIndicator(view);
}

// Updating view for zooming: around the centre (cx,cy):
function updateView(cx, cy, scaleFactor) {
    const width = (view.xMax - view.xMin) / scaleFactor;
    const height = (view.yMax - view.yMin) / scaleFactor;
    
    view.xMin = cx - width / 2;
    view.xMax = cx + width / 2;
    view.yMin = cy - height / 2;
    view.yMax = cy + height / 2;

    // Zooming in and out:
    view.zoomLevel *= scaleFactor;
}

// Zoom in on left-click:
canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = pixelToComplex(x, y, view, canvas.width, canvas.height);
    updateView(c.real, c.imag, 2);      // 2 x zoom-in

    drawMandelbrot();
});

// Zoom out on right-click:
canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();                 // Prevents defaulting, i.e. prevents browser menu.

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = pixelToComplex(x, y, view, canvas.width, canvas.height);
    updateView(c.real, c.imag, 0.5);    // 0.5 x, i.e. 2 x zoom-out

    drawMandelbrot();
});

// Mouse tracking:
canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const c = pixelToComplex(x, y, view, canvas.width, canvas.height);

    coordDisplay.textContent = `X: ${c.real.toFixed(5)}, Y: ${c.imag.toFixed(5)}`;
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
        drawMandelbrot();
    },
    drawMandelbrot
);

// === BUTTON CONTROLS === //
document.getElementById("drawMandelbrot").addEventListener("click", drawMandelbrot);
document.getElementById("clearMandelbrot").addEventListener("click", () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
});

document.getElementById("exportMandelbrot").addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = 'mandelbrot.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});

document.getElementById("resetView").addEventListener("click", () => {
    view = {
        xMin: -2.5,
        xMax: 1,
        yMin: -1.5,
        yMax: 1.5,
        zoomLevel: 1
    };
    updateZoomIndicator(view);
    drawMandelbrot();
});

document.getElementById("toggleGrid").addEventListener("click", () => {
    drawGrid = !drawGrid;
    drawMandelbrot();
});

document.getElementById("toggleAnimation").addEventListener("click", () => {
    if (isPlaying) {
        cancelAnimationFrame(animationId);
        isPlaying = false;
    } else {
        isPlaying = true;
        animateZoom();
    }
});

// === ZOOM ANIMATION === //
function animateZoom() {
    if (!isPlaying) return;

    updateView((view.xMin + view.xMax) / 2, (view.yMin + view.yMax) / 2, 1.05);
    drawMandelbrot();
    animationId = requestAnimationFrame(animateZoom);
}

// === RECORDING === //
document.getElementById("startRecording").addEventListener("click", () => {
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
        a.download = "mandelbrot_animation.webm";
        a.click();
    };

    mediaRecorder.start();
});

document.getElementById("stopRecording").addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
});

// === INITIAL RENDERING === //
drawMandelbrot();
updateZoomIndicator(view);