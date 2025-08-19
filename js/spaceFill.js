// js/spaceFill.js

const canvas = document.getElementById("spaceFillCanvas");
const ctx = canvas.getContext("2d");

// View (default):
let view = {
    offsetX: 0,
    offsetY: 0,
    zoomLevel: 1
};

let width = canvas.width;
let height = canvas.height;

// States:
let curve = "peano";
let depth = 3;
let speed = 30;     // 30 Frames/s
let lineColour = "#333";
let lineWidth = 1;

let drawingPoints = [];     // Empty list to store [x,y] in canvas px.
let drawIndex = 0;          // Current segment endpoint

let isAnimating = false;
let animationId = null;
let paused = false;

let isDragging = false;
let dragStart = { x: 0, y: 0 };

// === UI === //
const curveTypeSelect = document.getElementById("curveTypeSelect");
const depthInput = document.getElementById("depthInput");
const colorInput = document.getElementById("colorInput");
const lineWidthInput = document.getElementById("lineWidthInput");
const speedSlider = document.getElementById("speedSlider");
const speedDisplay = document.getElementById("speedDisplay");

const drawBtn = document.getElementById("drawBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");
const recordBtn = document.getElementById("recordBtn");
const resetBtn = document.getElementById("resetView");

const mouseCoords = document.getElementById("mouse-coords");

function resizeCanvas() {
    width = canvas.width;
    height = canvas.height;
    // Checking if currently animating; if not, draw in full.
    if (!isAnimating) drawFull();
}

function updateZoomIndicator(view, selector = "#zoom-indicator") {
    const el = document.querySelector(selector);
    if (el) el.textContent = `Zoom: ${view.zoomLevel.toFixed(2)}x`;
}

// === CURVE FUNCTIONS === //
function generateCurvePoints(curve, depth) {
    switch (curve) {
        case 'peano':            return generatePeano(depth);
        case 'hilbert':          return generateHilbert(depth);
        case 'hilbertRecursive': return generateHilbertRecursive(depth);
        case 'zorder':           return generateZOrder(depth);
        case 'lebesgue':         return generateLebesgue(depth);         // Similar to z-order.
        case 'gray':             return generateGray(depth);
        case 'moore':            return generateMoore(depth);
        case 'sierpinski':       return generateSierpinski(depth);
        case 'gosper':           return generateGosper(depth);
        default:                 return [];
    }
}

// Applying current pan & zoom to a pixel-space point.
// We render the points p = (x, y) using the following formula:
// screen = (x * zoom + offsetX, y * zoom + offsetY).
function transformPoint([x, y]) {
    return [
        x * view.zoomLevel + view.offsetX,
        y * view.zoomLevel + view.offsetY
    ];
}

// Peano curve: subdividing into 3x3 cells; visiting the 9 subsquares in "snake" ordering to keep the path continuous.
// 3^n x 3^n, which fills the area as n grows.
function generatePeano(depth) {
    let points = [];

    function peano(x, y, size, level) {
        if (level === 0) {
            // Top-left corner in [0,1].
            points.push([x, y]);
            return;
        }

        const step = size / 3;

        // Peano order (snake-like)
        const order = [
            // Row 1: left -> right
            [0, 0], [0, 1], [0, 2],
            // Row 2: right -> left
            [1, 2], [1, 1], [1, 0],
            // Row 3: left -> right
            [2, 0], [2, 1], [2, 2]
        ];

        for (const [i, j] of order) {
            peano(x + i * step, y + j * step, step, level - 1);
        }
    }

    // Starting from unit square [0,1], size = 1.
    peano(0, 0, 1, depth);
    // Map [0,1] to canvas pixels, and apply current view.
    return points.map(([x, y]) => transformPoint([x * width, y * height]));
}

// Hilbert curve: 2^n x 2^n grid.
// Using rot(s, x, y, rx, ry) function below -- involves rotations and reflections at each scale s.
// Maintains continuity.
// Swaps x, y to rotate by 90°. Reflects across centre in needed.
function generateHilbert(n) {
    function rot(n, x, y, rx, ry) {
        if (ry === 0) {
            if (rx === 1) {
                x = n - 1 - x;
                y = n - 1 - y;
            }

            [x, y] = [y, x];
        }

        return [x, y];
    }

    const N = Math.pow(2, n);   // Grid dimensions
    const points = [];

    // Computing (x, y) for each distance, d, i.e. iterating d from 0 to N^2 - 1
    for (let d = 0; d < N * N; d++) {
        let t = d;
        let x = 0;
        let y = 0;

        for (let s = 1; s < N; s *= 2) {
            const rx = 1 & (t >> 1);    // x-rotation
            const ry = 1 & (t ^ rx);    // y-rotation
            [x, y] = rot(s, x, y, rx, ry);
            x += s * rx;
            y += s * ry;
            t = Math.floor(t / 4);
        }

        // Normalising points
        points.push(transformPoint([
            (x / (N - 1)) * width,
            (y / (N - 1)) * height
        ]));
    }

    return points;
}

// Recursive Peano-Hilbert curve:
function generateHilbertRecursive(n) {
    const pts = [];
    function hilb(x0, y0, xi, xj, yi, yj, n) {
        // Removing centre of the current cell:
        if (n <= 0) {
            const X = x0 + (xi + yi) / 2;
            const Y = y0 + (xj + yj) / 2;
            pts.push(transformPoint([X, Y]));
        } else {
            // 4 recursive calls -- each with rotated and/or reflected frames.
            hilb(x0,                 y0,                 yi/2,  yj/2,  xi/2,  xj/2,  n-1);
            hilb(x0 + xi/2,          y0 + xj/2,          xi/2,  xj/2,  yi/2,  yj/2,  n-1);
            hilb(x0 + xi/2 + yi/2,   y0 + xj/2 + yj/2,   xi/2,  xj/2,  yi/2,  yj/2,  n-1);
            hilb(x0 + xi/2 + yi,     y0 + xj/2 + yj,    -yi/2, -yj/2, -xi/2, -xj/2, n-1);
        }
    }
    // Full canvas as the base frame.
    hilb(0, 0, width, 0, 0, height, n);
    return pts;
}

// Z-Order curve: 2^n x 2^n grif
// Generated z-shaped traversal at each scale.
function generateZOrder(n) {
    const size = Math.pow(2, n);
    const points = [];

    for (let i = 0; i < size * size; i++) {
        let x = 0, y = 0;

        // x is collecting bits from positions (2 * bit  + 1).
        // y is collecting bits from positions (2 * bit).
        for (let bit = 0; bit < n; bit++) {
            x |= ((i >> (2 * bit + 1)) & 1) << bit;
            y |= ((i >> (2 * bit)) & 1) << bit;
        }

        points.push(transformPoint([
            (x / (size - 1)) * width,
            (y / (size - 1)) * height
        ]));
    }

    return points;
}

// Similar to Z-Order curve:
function generateLebesgue(n) {
    return generateZOrder(n);
}

// Similar to Z-Order but follows gray code: g = i ^ (i >> 1).
function generateGray(n) {
    const size = Math.pow(2, n);
    const pts = [];
    for (let i = 0; i < size * size; i++) {
        const g = i ^ (i >>> 1); // This is the gray code.
        let x = 0, y = 0;

        for (let bit = 0; bit < n; bit++) {
            x |= ((g >> (2 * bit + 1)) & 1) << bit;
            y |= ((g >> (2 * bit    )) & 1) << bit;
        }

        pts.push(transformPoint([(x / (size - 1)) * width, (y / (size - 1)) * height]));
    }

    return pts;
}

// Closed loop version of Hilbert -- joins up the end points.
// It is generated by placing four Hilberts around a square with the rotations.
function generateMoore(n) {
    const pts = [];

    // Recursive Hilbert helper (bitwise method reused from generateHilbert)
    function hilbertIndexToXY(d, n) {
        function rot(n, x, y, rx, ry) {
            if (ry === 0) {
                if (rx === 1) { x = n - 1 - x; y = n - 1 - y; }
                [x, y] = [y, x];
            }
            return [x, y];
        }

        let N = Math.pow(2, n);
        let x = 0, y = 0, t = d;

        for (let s = 1; s < N; s <<= 1) {
            const rx = 1 & (t >> 1);
            const ry = 1 & (t ^ rx);
            [x, y] = rot(s, x, y, rx, ry);
            x += s * rx; y += s * ry;
            t >>= 2;
        }

        return [x, y];
    }

    const N = Math.pow(2, n);
    // Hilbert path that loops -- generating Hilbert curve of depth n-1, then stitching four together.
    if (n < 1) return pts;

    const segmentLength = Math.pow(2, n - 1);
    const total = 4 * segmentLength * segmentLength;

    for (let i = 0; i < total; i++) {
        // Mapping i into 4 rotated Hilberts:
        const quadrant = Math.floor(i / (segmentLength * segmentLength));
        const index = i % (segmentLength * segmentLength);
        let [x, y] = hilbertIndexToXY(index, n - 1);

        if (quadrant === 0) { [x, y] = [y, x]; }
        else if (quadrant === 1) { x += segmentLength; }
        else if (quadrant === 2) { x += segmentLength; y += segmentLength; }
        else if (quadrant === 3) { [x, y] = [2 * segmentLength - 1 - y, 2 * segmentLength - 1 - x]; }

        pts.push(transformPoint([(x / (N - 1)) * width, (y / (N - 1)) * height]));
    }

    return pts;
}

// Sierpinski Curve: recursively generated.
// Traversal of right isosceles triafngles.
// Recurse into 2 triangles iwth rotated orientation.
function generateSierpinski(n) {
    const pts = [];
    function sierp(x, y, dx, dy, n, orient) {
        if (n === 0) {
            pts.push(transformPoint([x, y]));
        } else {
            // Subdividing triangles:
            sierp(x, y, dx/2, dy/2, n-1, 1-orient);

            if (orient === 0) {
                sierp(x+dx/2, y, dx/2, dy/2, n-1, orient);
            } else {
                sierp(x, y+dy/2, dx/2, dy/2, n-1, orient);
            }

            sierp(x+dx/2, y+dy/2, dx/2, dy/2, n-1, 1-orient);
        }
    }

    sierp(0, 0, width, height, n, 0);
    return pts;
}

// Gosper curve: hexagonal lattice fractal.
// Recursively generated -- replaced with 7 smaller segments rotated ±60°.
function generateGosper(n) {
    const pts = [];

    const angle60 = Math.PI / 3;
    const step = Math.min(width, height) / Math.pow(Math.sqrt(7), n);

    function gosper(x, y, angle, n) {
        if (n === 0) {
            pts.push(transformPoint([x, y]));

            return [x + step * Math.cos(angle), y + step * Math.sin(angle), angle];
        } else {
            let [nx, ny, a] = [x, y, angle];
            const seq = [0, -1, -1, 0, 1, 1, 0];    // rotating sequence.
            
            for (let rot of seq) {
                [nx, ny, a] = gosper(nx, ny, a + rot*angle60, n-1);
            }

            return [nx, ny, a];
        }
    }

    gosper(width / 4, height / 2, 0, n);
    return pts;
}


// === DRAWING FUNCTIONS === //
function drawGrid() {
    const spacing = 50 * view.zoomLevel;
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;

    // Vertical lines
    for (let x = view.offsetX % spacing; x < width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Horizontal lines
    for (let y = view.offsetY % spacing; y < height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
}

// Continuously rendering the next segment.
function drawNextPoint() {
    if (paused || drawIndex >= drawingPoints.length - 1) {
        if (drawIndex >= drawingPoints.length - 1) stopAnimation();
        return;
    }

    const [x1, y1] = drawingPoints[drawIndex];
    const [x2, y2] = drawingPoints[drawIndex + 1];

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    drawIndex++;
    // Using setTimeout() for timings for animation:
    animationId = setTimeout(() => requestAnimationFrame(drawNextPoint), 1000 / speed);
}

function drawFull() {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    drawingPoints = generateCurvePoints(curve, depth);
    drawIndex = 0;

    ctx.beginPath();
    for (let i = 0; i < drawingPoints.length - 1; i++) {
        const [x1, y1] = drawingPoints[i];
        const [x2, y2] = drawingPoints[i + 1];
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
    }
    ctx.stroke();

    updateZoomIndicator(view);
}

function startAnimation() {
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    drawingPoints = generateCurvePoints(curve, depth);
    drawIndex = 0;
    isAnimating = true;

    drawNextPoint();
}

function stopAnimation() {
    isAnimating = false;
    cancelAnimationFrame(animationId);
    clearTimeout(animationId);
}

// Resetting the canvas and redrawing:
function resetView() {
    view = { offsetX: 0, offsetY: 0, zoomLevel: 1 };
    drawFull();
}

// === EVENT LISTENERS === //
drawBtn.addEventListener("click", () => {
    cancelAnimationFrame(animationId);
    paused = false;
    drawIndex = 0;

    speed = parseInt(speedSlider.value);
    depth = parseInt(depthInput.value);
    curve = curveTypeSelect.value;
    lineColor = colorInput.value;
    lineWidth = parseInt(lineWidthInput.value);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;

    startAnimation();
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;
});

pauseBtn.addEventListener("click", () => {
    paused = true;
    pauseBtn.disabled = true;
    resumeBtn.disabled = false;
});

resumeBtn.addEventListener("click", () => {
    if (!paused) return;
    paused = false;
    pauseBtn.disabled = false;
    resumeBtn.disabled = true;

    drawNextPoint();
});

clearBtn.addEventListener("click", () => {
    paused = true;
    cancelAnimationFrame(animationId);
    ctx.clearRect(0, 0, width, height);
    drawGrid();
    pauseBtn.disabled = true;
    resumeBtn.disabled = true;
});

exportBtn.addEventListener("click", () => {
    const link = document.createElement('a');
    link.download = `${curve}-curve.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
});

recordBtn.addEventListener("click", () => {
    const stream = canvas.captureStream(30);
    const recordedChunks = [];
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${curve}-animation.webm`;
        a.click();
        URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    drawBtn.click();

    setTimeout(() => {
        mediaRecorder.stop();
    }, 10000); // 10 seconds
});

resetBtn.addEventListener("click", resetView);

// Updating the speed display:
speedSlider.addEventListener("input", () => {
    speed = parseInt(speedSlider.value);
    speedDisplay.textContent = `${speed} FPS`;
});

// === ZOOMING & PANNING === //
canvas.addEventListener("mousedown", (e) => {
    isDragging = true;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
});

canvas.addEventListener("mousemove", (e) => {
    const x = (e.clientX - view.offsetX) / view.zoomLevel;
    const y = (e.clientY - view.offsetY) / view.zoomLevel;
    if (mouseCoords) {
        mouseCoords.textContent = `X: ${x.toFixed(1)}, Y: ${y.toFixed(1)}`;
    }

    if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        view.offsetX += dx;
        view.offsetY += dy;
        dragStart = { x: e.clientX, y: e.clientY };

        drawFull();
    }
});

canvas.addEventListener("mouseup", () => isDragging = false);
canvas.addEventListener("mouseleave", () => isDragging = false);

// Scrolling to zoom:
canvas.addEventListener("wheel", (e) => {
    e.preventDefault();         // prevent defaulting
    const scaleFactor = 1.1;
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    // Offset adjusted using the following formula:
    // screen = mouse + (world- mouse) * zoom.
    // Hence, newOffset = mouse - (world * newZoom) -- used on line 566.
    const zoom = e.deltaY < 0 ? scaleFactor : 1 / scaleFactor;
    const wx = (mouseX - view.offsetX) / view.zoomLevel;
    const wy = (mouseY - view.offsetY) / view.zoomLevel;

    view.zoomLevel *= zoom;

    view.offsetX = mouseX - wx * view.zoomLevel;
    view.offsetY = mouseY - wy * view.zoomLevel;

    updateZoomIndicator(view);
    drawFull();
});

// === INITIAL RENDERING === //
window.addEventListener("resize", resizeCanvas);
resizeCanvas();