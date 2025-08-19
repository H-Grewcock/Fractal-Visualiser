// js/fractalCurves.js

const canvas = document.getElementById("curveCanvas");
const ctx = canvas.getContext("2d");

const width = canvas.width;
const height = canvas.height;

// === UI ELEMENTS === //
const curveTypeSelect = document.getElementById("curveType");
const depthInput = document.getElementById("curveDepth");
const speedSlider = document.getElementById("curveSpeed");
const colorInput = document.getElementById("curveColor");
const lineWidthInput = document.getElementById("input");

const drawBtn = document.getElementById("drawCurve");
const pauseBtn = document.getElementById("pauseCurve");
const resumeBtn = document.getElementById("resumeCurve");
const clearBtn = document.getElementById("clearCurve");
const resetBtn = document.getElementById("resetView");
const exportBtn = document.getElementById("exportCanvas");
const playPauseBtn = document.getElementById("togglePlayPause");
const recordBtn = document.getElementById("recordVideo");

const coordDisplay = document.getElementById("mouse-coords");

// States:
let points = [];
let animationId = null;
let paused = false;
let speed = parseInt(speedSlider.value);
let currentSegment = 0;

// View (default):
let view = {
    offsetX: 0,
    offsetY: 0,
    zoomLevel: 1
};
let isDragging = false;
let dragStart = { x: 0, y: 0 };

// Recording states:
let recorder = null;
let recorderChunks = [];

// === DRAWING FUNCTIONS === //
function drawLine(p1, p2) {
    ctx.beginPath();
    ctx.moveTo(transformX(p1.x), transformY(p1.y));
    ctx.lineTo(transformX(p2.x), transformY(p2.y));
    ctx.stroke();
}

function interpolate(p1, p2, t) {
    return {
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
    };
}

function peakPoint(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) - Math.PI / 3;

    return {
        x: p1.x + Math.cos(angle) * dist / 3,
        y: p1.y + Math.sin(angle) * dist / 3
    };
}

function transformX(x) {
    return x * view.zoomLevel + view.offsetX;
}

function transformY(y) {
    return y * view.zoomLevel + view.offsetY;
}

function inverseTransform(x, y) {
    return {
        x: (x - view.offsetX) / view.zoomLevel,
        y: (y - view.offsetY) / view.zoomLevel
    };
}

// Updating the zoom indicator:
function updateZoomIndicator(view) {
    const el = document.getElementById("zoom-indicator");
    if (el) el.textContent = `Zoom: ${view.zoomLevel.toFixed(2)}x`;
}

// === VON KOCH CURVE === //
function generateKochSegments(p1, p2, depth, segs) {
    if (depth === 0) {
        segs.push([p1, p2]);
        return;
    }

    const oneThird = interpolate(p1, p2, 1/3);
    const twoThird = interpolate(p1, p2, 2/3);
    const peak = peakPoint(oneThird, twoThird);

    generateKochSegments(p1, oneThird, depth - 1, segs);
    generateKochSegments(oneThird, peak, depth - 1, segs);
    generateKochSegments(peak, twoThird, depth - 1, segs);
    generateKochSegments(twoThird, p2, depth - 1, segs);
}

function generateKochCurve(depth) {
    let segments = [];
    const size = 400;
    const centerX = width / 2;
    const centerY = height / 2;
    const heightTriangle = size * Math.sqrt(3) / 2;

    const p1 = { x: centerX - size / 2, y: centerY + heightTriangle / 3 };
    const p2 = { x: centerX + size / 2, y: centerY + heightTriangle / 3 };
    const p3 = { x: centerX, y: centerY - 2 * heightTriangle / 3 };

    generateKochSegments(p1, p2, depth, segments);
    generateKochSegments(p2, p3, depth, segments);
    generateKochSegments(p3, p1, depth, segments);

    points = segments.map(seg => seg[0]);
    points.push(segments[segments.length - 1][1]);
}

// === DRAGON CURVE === //
function generateDragonCurve(depth) {
    let str = "FX";
    
    for (let i = 0; i < depth; i++) {
        let newStr = "";
        for (const c of str) {
            if (c === "X") newStr += "X+YF+";
            else if (c === "Y") newStr += "-FX-Y";
            else newStr += c;
        }

        str = newStr;
    }

    points = [];
    let x = width / 2;
    let y = height / 2 + 100;
    let angle = 0;
    const step = 5
    points.push({ x, y });

    for (const c of str) {
        if (c === "F") {
            x += step * Math.cos(angle);
            y += step * Math.sin(angle);
            points.push({ x, y });
        } else if (c === "+") {
            angle += Math.PI / 2;
        } else if (c === "-") {
            angle -= Math.PI / 2;
        }
    }
}

// === HILBERT CURVE === //
function drawHilbert(order, canvasWidth = 800) {
    let tempPoints = [];

    function hilbert(x, y, xi, xj, yi, yj, n) {
        if (n <= 0) {
            const px = x + (xi + yi) / 2;
            const py = y + (xj + yj) / 2;

            tempPoints.push({ x: px, y: py });
        } else {
            hilbert(x, y, yi / 2, yj / 2, xi / 2, xj / 2, n - 1);
            hilbert(x + xi / 2, y + xj / 2, xi / 2, xj / 2, yi / 2, yj / 2, n - 1);
            hilbert(x + xi / 2 + yi / 2, y + xj / 2 + yj / 2, xi / 2, xj / 2, yi / 2, yj / 2, n - 1);
            hilbert(x + xi / 2 + yi, y + xj / 2 + yj, -yi / 2, -yj / 2, -xi / 2, -xj / 2, n - 1);
        }
    }

    hilbert(0, 0, 1, 0, 0, 1, order);
    const scale = canvasWidth * 0.9;
    points = tempPoints.map(p => ({ x: p.x * scale, y: p.y * scale }));
    currentSegment = 0;

    animate();
}

// === ANIMATE === //
function animate() {
    if (paused) return;

    if (currentSegment < points.length - 1) {
        drawLine(points[currentSegment], points[currentSegment + 1]);
        currentSegment++;
        setTimeout(() => animationId = requestAnimationFrame(animate), speed);
    } else {
        animationId = null;
        pauseBtn.disabled = true;
        resumeBtn.disabled = true;
        playPauseBtn.textContent = "Play";
    }
}

// === GRID === //
function drawGrid() {
    const spacing = 50;
    ctx.save();
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 0.5;
    for (let x = -view.offsetX % (spacing * view.zoomLevel); x < width; x += spacing * view.zoomLevel) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = -view.offsetY % (spacing * view.zoomLevel); y < height; y += spacing * view.zoomLevel) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    ctx.restore();
}

// === DRAWING CURVES === //
function drawCurve() {
    if (animationId) cancelAnimationFrame(animationId);
    paused = false;
    currentSegment = 0;
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    ctx.strokeStyle = colorInput.value;
    ctx.lineWidth = 2;
    speed = parseInt(speedSlider.value);
    const depth = parseInt(depthInput.value);
    switch (curveTypeSelect.value) {
        case "koch": generateKochCurve(depth); animate(); break;
        case "dragon": generateDragonCurve(depth); animate(); break;
        case "hilbert": drawHilbert(depth, width); break;
    }
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
    playPauseBtn.textContent = "Pause";
}

// === EVENT LISTENERS === //
canvas.addEventListener("mousedown", e => {
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
});

canvas.addEventListener("mousemove", e => {
    const { x, y } = inverseTransform(e.offsetX, e.offsetY);
    coordDisplay.textContent = `x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`;
    if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        view.offsetX += dx;
        view.offsetY += dy;
        dragStart = { x: e.clientX, y: e.clientY };
        redraw();
    }
});

canvas.addEventListener("mouseup", () => isDragging = false);
canvas.addEventListener("mouseleave", () => isDragging = false);

canvas.addEventListener("click", e => {
    const zoomFactor = 1.2;
    if (e.shiftKey) {
        const { x, y } = inverseTransform(e.offsetX, e.offsetY);
        view.zoomLevel *= zoomFactor;
        view.offsetX = e.offsetX - x * view.zoomLevel;
        view.offsetY = e.offsetY - y * view.zoomLevel;
    } else if (e.altKey) {
        const { x, y } = inverseTransform(e.offsetX, e.offsetY);
        view.zoomLevel /= zoomFactor;
        view.offsetX = e.offsetX - x * view.zoomLevel;
        view.offsetY = e.offsetY - y * view.zoomLevel;
    }
    updateZoomIndicator();
    redraw();
});

function redraw() {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    for (let i = 0; i < currentSegment - 1; i++) {
        drawLine(points[i], points[i + 1]);
    }
}

// === BUTTONS === //
drawBtn.addEventListener("click", drawCurve);
pauseBtn.addEventListener("click", () => { paused = true; pauseBtn.disabled = true; resumeBtn.disabled = false; playPauseBtn.textContent = "Play"; });
resumeBtn.addEventListener("click", () => { if (!paused) return; paused = false; pauseBtn.disabled = false; resumeBtn.disabled = true; playPauseBtn.textContent = "Pause"; animate(); });
clearBtn.addEventListener("click", () => { paused = true; if (animationId) cancelAnimationFrame(animationId); ctx.clearRect(0, 0, width, height); drawGrid(); pauseBtn.disabled = true; resumeBtn.disabled = true; playPauseBtn.textContent = "Play"; });
resetBtn.addEventListener("click", () => { view.offsetX = 0; view.offsetY = 0; view.zoomLevel = 1; updateZoomIndicator(); redraw(); });
exportBtn.addEventListener("click", () => { const link = document.createElement("a"); link.download = "fractal-curve.png"; link.href = canvas.toDataURL(); link.click(); });
playPauseBtn.addEventListener("click", () => { if (paused) resumeBtn.click(); else pauseBtn.click(); });

// === RECORDER === //
recordBtn.addEventListener("click", () => {
    if (recorder && recorder.state === "recording") {
        recorder.stop();
        recordBtn.textContent = "Start Recording";
        return;
    }
    recorderChunks = [];
    const stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => recorderChunks.push(e.data);
    recorder.onstop = () => {
        const blob = new Blob(recorderChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fractal_animation.webm";
        a.click();
    };
    recorder.start();
    recordBtn.textContent = "Stop & Download";
});