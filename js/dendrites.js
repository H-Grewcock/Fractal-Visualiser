// js/dendrites.js

const canvas = document.getElementById("dendriteCanvas");
const ctx = canvas.getContext("2d");

// View (default):
let defaultView = {
    xMin: -1,
    xMax: 1,
    yMin: -1,
    yMax: 1,
    zoomLevel: 1
};
let view = { ... defaultView };

// States:
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let isPlaying = false;
let animationFrameId;

// Recording states:
let recorder;
let recorderChunks = [];

let hue = 0;
let movingParticles = [];
let maxParticles = 150;

resizeCanvas(canvas);
attachEventListeners();
redrawCanvas();

// === CANVAS UTILITIES === //
function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function drawGrid(spacing = 50, color = "rgba(0,0,0,0.05)") {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;

    for (let x = 0; x < canvas.width; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }

    ctx.restore();
}

function redrawCanvas() {
    clearCanvas();
    drawGrid();

    const branches = generateCurrentDendrite();
    drawDendrite(ctx, branches, "#333", 1);
}

function resetView() {
    view = { ...defaultView };
    updateZoomIndicator();
    redrawCanvas();
}

// === ZOOM + PAN FUNCTIONS === //
function zoomView(factor, centerX, centerY) {
    const width = view.xMax - view.xMin;
    const height = view.yMax - view.yMin;
    const zoomFactor = 1 / factor;
    const cx = view.xMin + (centerX / canvas.width) * width;
    const cy = view.yMin + (centerY / canvas.height) * height;

    view.xMin = cx - (width * zoomFactor) / 2;
    view.xMax = cx + (width * zoomFactor) / 2;
    view.yMin = cy - (height * zoomFactor) / 2;
    view.yMax = cy + (height * zoomFactor) / 2;
    view.zoomLevel *= factor;

    updateZoomIndicator();
    redrawCanvas();
}

function updateZoomIndicator() {
    const el = document.querySelector("#zoom-indicator");
    if (el) el.textContent = `Zoom: ${view.zoomLevel.toFixed(2)}x`;
}

function updateMouseCoordinates(x, y) {
    const coordDisplay = document.getElementById("mouse-coords");
    if (!coordDisplay) return;
    
    const canvasX = view.xMin + (x / canvas.width) * (view.xMax - view.xMin);
    const canvasY = view.yMin + (y / canvas.height) * (view.yMax - view.yMin);
    coordDisplay.textContent = `X: ${canvasX.toFixed(2)}, Y: ${canvasY.toFixed(2)}`;
}

// === UI === //
function attachEventListeners() {
    // Drag to pan
    canvas.addEventListener("mousedown", (e) => {
        isDragging = true;
        dragStart.x = e.offsetX;
        dragStart.y = e.offsetY;
    });

    canvas.addEventListener("mousemove", (e) => {
        if (isDragging) {
            const dx = (e.offsetX - dragStart.x) * (view.xMax - view.xMin) / canvas.width;
            const dy = (e.offsetY - dragStart.y) * (view.yMax - view.yMin) / canvas.height;
            view.xMin -= dx; view.xMax -= dx;
            view.yMin -= dy; view.yMax -= dy;
            dragStart.x = e.offsetX;
            dragStart.y = e.offsetY;

            redrawCanvas();
        }
        updateMouseCoordinates(e.offsetX, e.offsetY);
    });

    canvas.addEventListener("mouseup", () => { isDragging = false; });
    
    // Scroll zoom
    canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        zoomView(zoomFactor, e.offsetX, e.offsetY);
    });

    // Click zoom
    canvas.addEventListener("click", (e) => {
        if (!isDragging) {
            const zoomFactor = e.shiftKey ? 0.9 : 1.1;
            zoomView(zoomFactor, e.offsetX, e.offsetY);
        }
    });

    // Buttons:
    document.getElementById("resetDendrite").addEventListener("click", resetView);
    document.getElementById("exportCanvas").addEventListener("click", () => exportCanvasImage(canvas));
    document.getElementById("startDendrite").addEventListener("click", togglePlayPause);
    document.getElementById("stepDendrite").addEventListener("click", () => {
        const branches = generateCurrentDendrite();
        stepwiseDendriteAnimator(ctx, branches, "#4e6350", getNumber("spotSize", 2), 10);
    });
    document.getElementById("stopDendrite").addEventListener("click", stopAnimation);
}

// === EXPORTING === //
function exportCanvasImage(canvas, filename = "dendrite.png") {
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

// === ANIMATION === //
function togglePlayPause() {
    isPlaying = !isPlaying;
    if (isPlaying) {
        initParticles(); // start fresh
        animate();
    } else {
        cancelAnimationFrame(animationFrameId);
    }
}

function stopAnimation() {
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);
    movingParticles = [];  // clear walkers
}

function animate() {
    if (!isPlaying) return;
    
    clearCanvas();
    drawGrid();

    const branches = generateCurrentDendrite();

    // Animate particles + arrows if enabled
    updateParticles(branches);
    drawParticles();

    // Draw dendrite with color cycling
    drawDendrite(ctx, branches, getNextColor(), getNumber("spotSize", 2));

    animationFrameId = requestAnimationFrame(animate);
}

// === DENDRITE GENERATION === //
function generateDendrite(startX, startY, angle, length, depth, options = {}) {
    const {
        branchFactor = 2,
        angleSpread = Math.PI / 4,
        lengthDecay = 0.7,
        jitter = 0.1,
        stickProb = parseFloat(document.getElementById("stickProb").value) || 0.1
    } = options;

    const branches = [];
    function recurse(x, y, angle, length, depth) {
        if (depth === 0 || length < 1 || Math.random() < stickProb) return;
        
        const dx = Math.cos(angle) * length;
        const dy = Math.sin(angle) * length;
        const x2 = x + dx, y2 = y + dy;
        branches.push({ x1: x, y1: y, x2, y2 });

        for (let i = 0; i < branchFactor; i++) {
            const randomAngleOffset = (Math.random() - 0.5) * angleSpread + jitter * (Math.random() - 0.5);
            const newAngle = angle + randomAngleOffset;
            const newLength = length * (lengthDecay + (Math.random() - 0.5) * 0.1);
            
            recurse(x2, y2, newAngle, newLength, depth - 1);
        }
    }

    recurse(startX, startY, angle, length, depth);
    return branches;
}

function generateFromCenter() {
    const depth = getNumber("depth", 6);
    const length = Math.min(canvas.width, canvas.height) / 5;

    return generateDendrite(canvas.width / 2, canvas.height / 2, -Math.PI / 2, length, depth);
}

function generateFromSquareEdges() {
    const depth = getNumber("depth", 6);
    const size = Math.min(canvas.width, canvas.height) * 0.6;
    const marginX = (canvas.width - size) / 2;
    const marginY = (canvas.height - size) / 2;
    const branches = [];

    for (let i = 0; i <= 5; i++) {
        const y = marginY + (i / 5) * size;
        branches.push(...generateDendrite(marginX, y, 0, size / 5, depth));
        branches.push(...generateDendrite(marginX + size, y, Math.PI, size / 5, depth));
    }

    return branches;
}

function generateFromBottom() {
    const depth = getNumber("depth", 6);
    const branches = [];
    const count = 10, spacing = canvas.width / (count + 1), baseY = canvas.height;
    
    for (let i = 1; i <= count; i++) {
        const x = i * spacing;
        branches.push(...generateDendrite(x, baseY, -Math.PI / 2, canvas.height / 5, depth));
    }

    return branches;
}

function generateCurrentDendrite() {
    const startMode = document.getElementById("startingPoint").value;
    if (startMode === "center") return generateFromCenter();
    if (startMode === "edges") return generateFromSquareEdges();
    if (startMode === "bottom") return generateFromBottom();

    return generateFromCenter();
}


// === DRAWING DENDRITE FUNCTIONS  === //
function drawDendrite(ctx, branches, color = "#5a5a5a", lineWidth = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    for (const b of branches) {
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
    }

    ctx.stroke();
    ctx.restore();
}
function stepwiseDendriteAnimator(ctx, branches, color = "#5a5a5a", lineWidth = 1, delay = 10) {
    let i = 0;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    function drawNext() {
        if (i >= branches.length) {
            ctx.restore();
            return;
        }

        const { x1, y1, x2, y2 } = branches[i++];
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        setTimeout(() => requestAnimationFrame(drawNext), delay);
    }

    drawNext();
}

// === UTILITIES === //
function getNumber(id, fallback = 1) {
    const val = parseFloat(document.getElementById(id).value);
    return isNaN(val) ? fallback : val;
}

function resizeCanvas(canvas) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}

// === NEW HELPERS === //
function initParticles() {
    movingParticles = [];
    for (let i = 0; i < maxParticles; i++) {
        movingParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            stuck: false
        });
    }
}

function updateParticles(branches) {
    const stickProb = getNumber("stickProb", 0.1);
    const spotSize = getNumber("spotSize", 2);
    const showArrows = document.getElementById("showArrows").checked;

    for (const p of movingParticles) {
        if (p.stuck) continue;

        // random walk
        p.x += (Math.random() - 0.5) * 2;
        p.y += (Math.random() - 0.5) * 2;

        // check for sticking
        for (const b of branches) {
            const dx = p.x - b.x2, dy = p.y - b.y2;
            if (dx*dx + dy*dy < spotSize*spotSize) {
                if (Math.random() < stickProb) {
                    p.stuck = true;
                    branches.push({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
                    if (showArrows) {
                        ctx.beginPath();
                        ctx.moveTo(b.x2, b.y2);
                        ctx.lineTo(p.x, p.y);
                        ctx.strokeStyle = "rgba(200,0,0,0.4)";
                        ctx.stroke();
                    }
                }
            }
        }
    }
}

function drawParticles() {
    const showMoving = document.getElementById("showMovingPoints").checked;
    if (!showMoving) return;

    ctx.fillStyle = "rgba(0,0,0,0.6)";
    for (const p of movingParticles) {
        if (!p.stuck) ctx.fillRect(p.x, p.y, 2, 2);
    }
}

function getNextColor() {
    const rate = parseFloat(document.getElementById("colorChangeRate").value) || 0.1;
    hue = (hue + rate) % 360;
    return `hsl(${hue}, 70%, 50%)`;
}