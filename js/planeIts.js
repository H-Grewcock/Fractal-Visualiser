// js/planeIts.js

// === UTILITIES === //
// Parsing a range string "min,max" into an object {min, max}:
function parseRange(rangeStr) {
    if (typeof rangeStr !== "string") return { min: -3, max: 3 };
    const parts = rangeStr.split(",").map(v => Number(v.trim()));
    const [min, max] = parts.length === 2 && parts.every(n => Number.isFinite(n))
        ? parts
        : [-3, 3];
    return { min, max };
}

function mapToCanvas(x, y, xRange, yRange, width, height) {
    const xDen = (xRange.max - xRange.min) || 1e-9;
    const yDen = (yRange.max - yRange.min) || 1e-9;
    const xNorm = (x - xRange.min) / xDen;
    const yNorm = (y - yRange.min) / yDen;
    return {
        cx: xNorm * width,
        cy: (1 - yNorm) * height    // Flip y-axis s.t. up is positive.
    };
}

function compileFunction(fxStr, gyStr) {
    const scopeKeys = [
        "abs","acos","acosh","asin","asinh","atan","atan2","atanh","cbrt","ceil",
        "cos","cosh","exp","expm1","floor","fround","hypot","log","log1p","log10",
        "log2","max","min","pow","random","round","sign","sin","sinh","sqrt","tan","tanh","trunc"
    ];
    const scope = Object.fromEntries(scopeKeys.map(k => [k, Math[k]]));

    try {
        const f = new Function("x","y","scope", `const { ${scopeKeys.join(",")} } = scope; return (${fxStr});`);
        const g = new Function("x","y","scope", `const { ${scopeKeys.join(",")} } = scope; return (${gyStr});`);
        return {
            f: (x, y) => f(x, y, scope),
            g: (x, y) => g(x, y, scope),
        };
    } catch (e) {
        throw new Error("Invalid function input.");
    }
}

// HSL -> RGB (h in [0,360], s,l in [0,1])
function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360; // normalize
    h /= 360;
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
}

function updateStatus(zoomLevel, linesMode, selector = "#zoom-indicator") {
    const el = document.querySelector(selector);
    if (el) el.textContent = `Zoom: ${zoomLevel.toFixed(2)}x • Lines: ${linesMode ? "On" : "Off"}`;
}

function clearCanvas(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
}

// === GENERATING ORBITS === //
function generatePlanePath(f, g, x0, y0, steps) {
    const pts = new Array(steps + 1);
    let x = x0, y = y0;
    pts[0] = [x, y];
    for (let i = 1; i <= steps; i++) {
        const nextX = f(x, y);
        const nextY = g(x, y);
        x = Number.isFinite(nextX) ? nextX : 0;
        y = Number.isFinite(nextY) ? nextY : 0;
        pts[i] = [x, y];
    }
    return pts;
}

function generateAllPlanePaths(f, g, xRange, yRange, gridSpacing, iterations) {
    const paths = [];
    const xStep = (xRange.max - xRange.min) / gridSpacing;
    const yStep = (yRange.max - yRange.min) / gridSpacing;
    for (let i = 0; i <= gridSpacing; i++) {
        for (let j = 0; j <= gridSpacing; j++) {
            const x0 = xRange.min + i * xStep;
            const y0 = yRange.min + j * yStep;
            paths.push(generatePlanePath(f, g, x0, y0, iterations));
        }
    }
    return paths;
}

function progressiveDrawingPlanePaths(ctx, paths, xRange, yRange, width, height, dotSize, stepIndex, stepsPerFrame, linesMode) {
    const maxStep = Math.min(stepIndex + stepsPerFrame, paths[0].length - 1);

    for (let s = stepIndex; s < maxStep; s++) {
        const hue = (s / (paths[0].length - 1)) * 360;
        // pass s,l as decimals (0..1)
        const [r, g, b] = hslToRgb(hue, 1, 0.5);
        const color = `rgb(${r},${g},${b})`;

        if (linesMode && s > 0) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, dotSize);
            for (const path of paths) {
                const [x1, y1] = path[s - 1];
                const [x2, y2] = path[s];
                if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue;
                const p1 = mapToCanvas(x1, y1, xRange, yRange, width, height);
                const p2 = mapToCanvas(x2, y2, xRange, yRange, width, height);
                ctx.moveTo(p1.cx, p1.cy);
                ctx.lineTo(p2.cx, p2.cy);
            }
            ctx.stroke();
        }

        ctx.fillStyle = color;
        for (const path of paths) {
            const [x, y] = path[s];
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const { cx, cy } = mapToCanvas(x, y, xRange, yRange, width, height);
            ctx.beginPath();
            ctx.arc(cx, cy, dotSize, 0, 2 * Math.PI);
            ctx.fill();
        }
    }

    return maxStep;
}

function drawGrid(ctx, xRange, yRange, width, height) {
    ctx.save();
    ctx.strokeStyle = "#444";
    ctx.lineWidth = 0.5;
    const stepX = (xRange.max - xRange.min) / 10;
    const stepY = (yRange.max - yRange.min) / 10;

    for (let gx = xRange.min; gx <= xRange.max + 1e-9; gx += stepX) {
        const { cx } = mapToCanvas(gx, 0, xRange, yRange, width, height);
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
        ctx.stroke();
    }

    for (let gy = yRange.min; gy <= yRange.max + 1e-9; gy += stepY) {
        const { cy } = mapToCanvas(0, gy, xRange, yRange, width, height);
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#bbb";
    ctx.lineWidth = 1.5;
    const { cy: axY } = mapToCanvas(0, 0, xRange, yRange, width, height);
    ctx.beginPath(); ctx.moveTo(0, axY); ctx.lineTo(width, axY); ctx.stroke();
    const { cx: axX } = mapToCanvas(0, 0, xRange, yRange, width, height);
    ctx.beginPath(); ctx.moveTo(axX, 0); ctx.lineTo(axX, height); ctx.stroke();

    ctx.restore();
}

// === INITIALISING VISUALISER FUNCTION === //
function initPlaneVisualiser(controls) {
    const canvas = document.getElementById("planeCanvas");
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // States:
    let xRange = parseRange(controls.xRange.value);
    let yRange = parseRange(controls.yRange.value);
    let zoomLevel = 1;
    let dragging = false;
    let dragStartPoint = null;

    let animationFrameId = null;
    let playing = false;
    let paths = null;
    let stepIndex = 0;
    const stepsPerFrame = 2;
    let linesMode = false;
    if (controls.linesCheckbox) controls.linesCheckbox.checked = linesMode;


    // Recording states:
    let recorder = null;
    let recordedChunks = [];

    function worldDeltaPerPixel() {
        const dx = (xRange.max - xRange.min) / width;
        const dy = (yRange.max - yRange.min) / height;
        return { dx, dy };
    }

    function canvasToWorld(cx, cy) {
        const x = xRange.min + (cx / width) * (xRange.max - xRange.min);
        const y = yRange.max - (cy / height) * (yRange.max - yRange.min);
        return { x, y };
    }

    function drawAll(resetStep = true) {
        const gridSpacing = Math.max(1, Number(controls.gridSpacing.value) || 10);
        const iterations = Math.max(1, Number(controls.iterations.value) || 100);
        const dotSize = Math.max(1, Number(controls.dotSize.value) || 1);

        let f, g;
        try {
            ({ f, g } = compileFunction(controls.fx.value, controls.gy.value));
        } catch (err) {
            console.error(err);
            return;
        }

        clearCanvas(ctx, width, height);
        drawGrid(ctx, xRange, yRange, width, height);

        paths = generateAllPlanePaths(f, g, xRange, yRange, gridSpacing, iterations);
        if (resetStep) stepIndex = 0;

        stepIndex = progressiveDrawingPlanePaths(
            ctx, paths, xRange, yRange, width, height, dotSize, stepIndex, Math.max(stepsPerFrame, 2), linesMode
        );
    }

    function animate() {
        if (!playing || !paths) return;
        const dotSize = Math.max(1, Number(controls.dotSize.value) || 1);
        stepIndex = progressiveDrawingPlanePaths(
            ctx, paths, xRange, yRange, width, height, dotSize, stepIndex, stepsPerFrame, linesMode
        );

        const maxSteps = paths[0]?.length - 1 || 0;
        if (stepIndex >= maxSteps) {
            playing = false;
            animationFrameId = null;
            return;
        }
        animationFrameId = requestAnimationFrame(animate);
    }

    // === EVENTS: DRAGGING & MOUSE COORDINATES === //
    function getMouseCoords(e) {
        const rect = canvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener("mousemove", (e) => {
        const m = getMouseCoords(e);
        const w = canvasToWorld(m.x, m.y);
        const label = document.getElementById("mouse-coords");
        if (label) label.textContent = `(${w.x.toFixed(2)}, ${w.y.toFixed(2)})`;

        if (dragging && dragStartPoint) {
            const { dx, dy } = worldDeltaPerPixel();
            const px = m.x - dragStartPoint.x;
            const py = m.y - dragStartPoint.y;
            const panX = -px * dx;
            const panY =  py * dy;

            xRange = { min: xRange.min + panX, max: xRange.max + panX };
            yRange = { min: yRange.min + panY, max: yRange.max + panY };

            controls.xRange.value = `${xRange.min.toFixed(2)}, ${xRange.max.toFixed(2)}`;
            controls.yRange.value = `${yRange.min.toFixed(2)}, ${yRange.max.toFixed(2)}`;

            dragStartPoint = m;
            drawAll(false);
        }
    });

    canvas.addEventListener("mousedown", (e) => {
        dragging = true;
        dragStartPoint = getMouseCoords(e);
    });

    canvas.addEventListener("mouseup", () => {
        dragging = false;
        dragStartPoint = null;
    });

    canvas.addEventListener("mouseleave", () => {
        dragging = false;
        dragStartPoint = null;
    });

    // Zooming:
    canvas.addEventListener("click", (e) => {
        const m = getMouseCoords(e);
        const center = canvasToWorld(m.x, m.y);
        const factor = e.shiftKey ? 1 / 1.1 : 1.1;
        zoomAtPoint(center.x, center.y, factor);
    });

    function zoomAtPoint(cx, cy, factor) {
        zoomLevel *= factor;
        const newXMin = cx - (cx - xRange.min) / factor;
        const newXMax = cx + (xRange.max - cx) / factor;
        const newYMin = cy - (cy - yRange.min) / factor;
        const newYMax = cy + (yRange.max - cy) / factor;

        xRange = { min: newXMin, max: newXMax };
        yRange = { min: newYMin, max: newYMax };

        controls.xRange.value = `${xRange.min.toFixed(2)}, ${xRange.max.toFixed(2)}`;
        controls.yRange.value = `${yRange.min.toFixed(2)}, ${yRange.max.toFixed(2)}`;

        updateStatus(zoomLevel, linesMode);
        drawAll(true);
    }

    // === CONTROLS === //
    controls.resetButton.addEventListener("click", () => { drawAll(true); });

    controls.clearButton.addEventListener("click", () => {
        clearCanvas(ctx, width, height);
        drawGrid(ctx, xRange, yRange, width, height);
        paths = null;
        stepIndex = 0;
        playing = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
    });

    controls.exportButton.addEventListener("click", () => {
        const a = document.createElement("a");
        a.download = "plane_iterations.png";
        a.href = canvas.toDataURL("image/png");
        a.click();
    });

    controls.playPauseButton.addEventListener("click", () => {
        if (!paths) drawAll(false);
        playing = !playing;
        if (playing && !animationFrameId) {
            animationFrameId = requestAnimationFrame(animate);
        }
    });

    // === RECORDING === //
    controls.recordButton.addEventListener("click", () => {
        if (recorder && recorder.state === "recording") return;
        const stream = canvas.captureStream(30);
        recordedChunks = [];
        recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
        recorder.ondataavailable = (e) => { if (e.data.size) recordedChunks.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "plane_iterations.webm";
            a.click();
            URL.revokeObjectURL(url);
        };
        recorder.start();
    });

    controls.stopRecordButton.addEventListener("click", () => {
        if (recorder && recorder.state === "recording") recorder.stop();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "l" || e.key === "L") {
            linesMode = !linesMode;
            updateStatus(zoomLevel, linesMode);

            if (paths) {
                const dotSize = Math.max(1, Number(controls.dotSize.value) || 1);
                clearCanvas(ctx, width, height);
                drawGrid(ctx, xRange, yRange, width, height);

                let s = 0;
                const chunk = Math.max(stepsPerFrame, 64);
                while (s < stepIndex) {
                    s = progressiveDrawingPlanePaths(
                        ctx, paths, xRange, yRange, width, height, dotSize, s, chunk, linesMode
                    );
                }
            }
        }
    });

    if (controls.linesCheckbox) {
        controls.linesCheckbox.addEventListener("change", () => {
            linesMode = controls.linesCheckbox.checked;
            updateStatus(zoomLevel, linesMode);

            if (paths) {
                const dotSize = Math.max(1, Number(controls.dotSize.value) || 1);
                clearCanvas(ctx, width, height);
                drawGrid(ctx, xRange, yRange, width, height);

                let s = 0;
                const chunk = Math.max(stepsPerFrame, 64);
                while (s < stepIndex) {
                    s = progressiveDrawingPlanePaths(ctx, paths, xRange, yRange, width, height, dotSize, s, chunk, linesMode)
                }
            }
        });
    }

    // === SELECTING EXAMPLES === //
    const examples = [
        { name: "Linear Spiral",  f: "x + 0.1*y",       g: "y - 0.1*x", xRange: { min: -5, max: 5 }, yRange: { min: -5, max: 5 }, iterations: 800 },
        { name: "Quadratic Map",  f: "x*x - y*y",       g: "2*x*y",     xRange: { min: -2, max: 2 },  yRange: { min: -2, max: 2 },  iterations: 1000 },
        { name: "Sine Swap",      f: "sin(2*y)",        g: "sin(2*x)",  xRange: { min: -3, max: 3 },  yRange: { min: -3, max: 3 },  iterations: 1000 },
        { name: "Henon-ish",      f: "1 - 1.4*x*x + y", g: "0.3*x",     xRange: { min: -1.5, max: 1.5 }, yRange: { min: -1, max: 1 }, iterations: 1500 }
    ];

    const exampleSelect = document.getElementById("exampleSelect");
    if (exampleSelect && exampleSelect.children.length <= 1) {
        examples.forEach((ex, idx) => {
            const opt = document.createElement("option");
            opt.value = String(idx);
            opt.textContent = ex.name;
            exampleSelect.appendChild(opt);
        });
    }

    if (exampleSelect) {
        exampleSelect.addEventListener("change", () => {
            const ex = examples[Number(exampleSelect.value)];
            if (!ex) return;
            controls.fx.value = ex.f;
            controls.gy.value = ex.g;
            controls.xRange.value = `${ex.xRange.min}, ${ex.xRange.max}`;
            controls.yRange.value = `${ex.yRange.min}, ${ex.yRange.max}`;
            controls.iterations.value = ex.iterations;

            xRange = { ...ex.xRange };
            yRange = { ...ex.yRange };
            zoomLevel = 1;
            updateStatus(zoomLevel, linesMode);
            drawAll(true);
        });
    }

    // Initial rendering:
    updateStatus(zoomLevel, linesMode);
    drawAll(true);
}

window.initPlaneVisualiser = initPlaneVisualiser;
