// js/affine.js

const canvas = document.getElementById("affineCanvas");
const ctx = canvas.getContext("2d");

// View (defaulting):
let view = {
    xMin: -2,
    xMax: 2,
    yMin: -2,
    yMax: 2,
    zoomLevel: 1
};

// State:
let animationFrame = null;
let playing = false;
let recorder = null;
let recordedChunks = [];

// Affine matrix & probabilities:
let affineMaps = [];    // Array of {a11, a12, a21, a22, b1, b2, prob}.
let anchors = [];       // Draggable b-vectors.
let stepPoints = [];
let currentPoint = { x: 0, y: 0 };

let isPanning = false;
let panStart = null;
let draggingAnchor = null;

// === MAIN EXAMPLES === //
const examples = {
    'Barnsley Fern': [
        { a11: 0, a12: 0, a21: 0, a22: 0.16, b1: 0, b2: 0, prob: 0.01 },
        { a11: 0.85, a12: 0.04, a21: -0.04, a22: 0.85, b1: 0, b2: 1.6, prob: 0.85 },
        { a11: 0.2, a12: -0.26, a21: 0.23, a22: 0.22, b1: 0, b2: 1.6, prob: 0.07 },
        { a11: -0.15, a12: 0.28, a21: 0.26, a22: 0.24, b1: 0, b2: 0.44, prob: 0.07 }
    ],
    'Sierpinski Triangle': [
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0, b2: 0, prob: 1/3 },
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 1, b2: 0, prob: 1/3 },
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0.5, b2: Math.sqrt(3)/2, prob: 1/3 }
    ],
    'Sierpinski Square': [
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0, b2: 0, prob: 0.25 },
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0.5, b2: 0, prob: 0.25 },
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0, b2: 0.5, prob: 0.25 },
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0.5, b2: 0.5, prob: 0.25 }
    ],
    'Shrinking Square': [
        { a11: 0.5, a12: 0, a21: 0, a22: 0.5, b1: 0, b2: 0, prob: 1 }
    ],
    'Spiral': [
        { a11: 0.6, a12: -0.8, a21: 0.8, a22: 0.6, b1: 0, b2: 0, prob: 1 }
    ],
    'Pentagon Star': (() => {
        const maps = [];
        const n = 5;
        const angleStep = 2 * Math.PI / 5;

        for (let i = 0; i < n; i++) {
            const angle = i * angleStep - Math.PI / 2;
            const b1 = Math.cos(angle);
            const b2 = Math.sin(angle);

            maps.push({
                a11: 0.382, a12: 0, a21: 0, a22: 0.382,
                b1, b2, prob: 1 / n
            });
        }

        return maps;
    })()
};

// === UTILITIES === //
// Pixel -> coordinate range:
function mapPixelToRange(px, py) {
    const { xMin, xMax, yMin, yMax } = view;
    return {
        x: xMin + (px / canvas.width) * (xMax - xMin),
        y: yMin + (py / canvas.height) * (yMax - yMin)
    };
}

// Coordinate range -> pixel:
function rangeToPixel(x, y) {
    const { xMin, xMax, yMin, yMax } = view;
    return {
        px: ((x - xMin) / (xMax - xMin)) * canvas.width,
        py: ((y - yMin) / (yMax - yMin)) * canvas.height
    };
}

function clearCanvas(keepAnchors = true) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (keepAnchors) {
        drawAnchors();
    }
}

function drawGrid() {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    const step = 0.5;

    for (let x = view.xMin; x <= view.xMax; x += step) {
        const px = ((x - view.xMin) / (view.xMax - view.xMin)) * canvas.width;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, canvas.height);
        ctx.stroke();
    }

    for (let y = view.yMin; y <= view.yMax; y += step) {
        const py = ((y - view.yMin) / (view.yMax - view.yMin)) * canvas.height;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(canvas.width, py);
        ctx.stroke();
    }
}

function drawPoints(points, color = '#000') {
    clearCanvas(false);
    drawGrid();
    const { xMin, xMax, yMin, yMax } = view;
    ctx.save();
    ctx.fillStyle = color;

    for (const p of points) {
        const px = ((p.x - xMin) / (xMax - xMin)) * canvas.width;
        const py = ((p.y - yMin) / (yMax - yMin)) * canvas.height;
        ctx.fillRect(px, py, 1, 1);
    }

    ctx.restore();
    drawAnchors();
}

// === ANCHORS SECTION === //
function initAnchorsFromMaps() {
    anchors = affineMaps.map((m, i) => ({
        x: m.b1,
        y: m.b2,
        mapIndex: i
    }));
}

function drawAnchors() {
    ctx.fillStyle = "red";
    anchors.forEach(a => {
        const { px, py } = rangeToPixel(a.x, a.y);
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, 2 * Math.PI);
        ctx.fill();
    });
}

// === AFFINE MAPS === //
function applyAffine(p, matrix) {
    return {
        x: matrix.a11 * p.x + matrix.a12 * p.y + matrix.b1,
        y: matrix.a21 * p.x + matrix.a22 * p.y + matrix.b2
    };
}

// Using chaos game:
function chooseMap(maps) {
    const r = Math.random();
    let acc = 0;

    for (const m of maps) {
        acc += m.prob;
        if (r <= acc) return m;
    }

    return maps[maps.length - 1];
}

function generateAffineFractal(maps, n = 5000, x0 = 0, y0 = 0) {
    let points = [];
    let p = { x: x0, y: y0 };

    for (let i = 0; i < n; i++) {
        const map = chooseMap(maps);
        p = applyAffine(p, map);
        points.push({ ...p });
    }

    return points;
}

function updateFractal() {
    const points = generateAffineFractal(affineMaps, 10000);
    drawPoints(points);
    updateZoomIndicator();
}

// === ANIMATION === //
function stepOnce() {
    const map = chooseMap(affineMaps);
    currentPoint = applyAffine(currentPoint, map);
    stepPoints.push({ ...currentPoint });
    drawPoints(stepPoints);
}

function toggleAnimation() {
    playing = !playing;
    if (playing) animate();
    else cancelAnimationFrame(animationFrame);
}

function animate() {
    stepOnce();
    animationFrame = requestAnimationFrame(animate);
}

// === VIEW CONTROLS === //
function updateZoomIndicator(selector = '#zoom-indicator') {
    const el = document.querySelector(selector);
    if (el) el.textContent = `Zoom: ${view.zoomLevel.toFixed(2)}x`;
}

function resetView() {
    view = { xMin: -2, xMax: 2, yMin: -2, yMax: 2, zoomLevel: 1 };
    stepPoints = [];
    currentPoint = { x: 0, y: 0 };

    updateFractal();
}

function zoomView(mouseX, mouseY, delta) {
    const factor = delta > 0 ? 1.1 : 0.9;
    const zoom = view.zoomLevel * factor;

    const x = view.xMin + (mouseX / canvas.width) * (view.xMax - view.xMin);
    const y = view.yMin + (mouseY / canvas.height) * (view.yMax - view.yMin);
    const width = (view.xMax - view.xMin) * factor;
    const height = (view.yMax - view.yMin) * factor;

    view.xMin = x - width * (mouseX / canvas.width);
    view.xMax = view.xMin + width;
    view.yMin = y - height * (mouseY / canvas.height);
    view.yMax = view.yMin + height;
    view.zoomLevel = zoom;

    updateFractal();
}

function zoomView(mouseX, mouseY, delta) {
    const factor = delta > 0 ? 1.1 : 0.9;
    const zoom = view.zoomLevel * factor;

    const x = view.xMin + (mouseX / canvas.width) * (view.xMax - view.xMin);
    const y = view.yMin + (mouseY / canvas.height) * (view.yMax - view.yMin);
    const width = (view.xMax - view.xMin) * factor;
    const height = (view.yMax - view.yMin) * factor;

    view.xMin = x - width * (mouseX / canvas.width);
    view.xMax = view.xMin + width;
    view.yMin = y - height * (mouseY / canvas.height);
    view.yMax = view.yMin + height;
    view.zoomLevel = zoom;

    updateFractal();
}

function exportCanvas() {
    const link = document.createElement('a');
    link.download = 'affine_fractal.png';
    link.href = canvas.toDataURL();
    link.click();
}

// === RECORDING === //
function startRecording() {
    recorder = new MediaRecorder(canvas.captureStream());
    recordedChunks = [];

    recorder.ondataavailable = e => recordedChunks.push(e.data);
    recorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'fractal-video.webm';
        a.click();
    };

    recorder.start();
}

function stopRecording() {
    if (recorder) recorder.stop();
}

// === LOADING EXAMPLES === //
function selectExample(name) {
    if (examples[name]) {
        affineMaps = JSON.parse(JSON.stringify(examples[name]));
        initAnchorsFromMaps();
        normaliseProbs();
        renderAllEditors();
        resetView();
    }
}

function normaliseProbs() {
    const sum = affineMaps.reduce((s, m) => s + (+m.prob || 0), 0);
    
    if (sum > 0) {
        affineMaps.forEach(m => m.prob = (+m.prob || 0) / sum);
    } else {
        const p = 1 / Math.max(1, affineMaps.length);
        affineMaps.forEach(m => m.prob = p);
    }
}

function ensureMapsLength(n) {
    n = Math.max(1, Math.min(10, Math.floor(n)));

    if (!Array.isArray(affineMaps)) {
        affineMaps = [];
    }
    while (affineMaps.length < n) {
        affineMaps.push({
            a11: 0.5, a12: 0,
            a21: 0, a22: 0.5,
            b1: 0, b2: 0,
            prob: 1 / (affineMaps.length + 1)
        });
    }

    while (affineMaps.length > n) {
        affineMaps.pop();
    }
    normaliseProbs();
    initAnchorsFromMaps();
}

function buildLabeledNumber(labelText, step, value, onInput) {
    const wrapper = document.createElement('label');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.gap = '4px';
    wrapper.style.fontSize = '13px';
    const label = document.createElement('span');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.step = step;
    input.value = value;

    input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        if (Number.isFinite(v)) onInput(v, input);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    return { wrapper, input };
}

// === RENDERING THE MATRIX, VECTOR & PROBABILITIES === //
// Rendering the matrix inputs:
function renderMatrixInputs() {
    const wrap = document.getElementById('matrixAInputsContainer');
    if (!wrap) return;
    wrap.replaceChildren();

    affineMaps.forEach((m, i) => {
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'repeat(4, minmax(80px,1fr))';
        row.style.gap = '6px';

        const a11 = buildLabeledNumber(`A${i+1}.a11`, '0.001', m.a11, v => { affineMaps[i].a11 = v; updateFractal(); });
        const a12 = buildLabeledNumber(`A${i+1}.a12`, '0.001', m.a12, v => { affineMaps[i].a12 = v; updateFractal(); });
        const a21 = buildLabeledNumber(`A${i+1}.a21`, '0.001', m.a21, v => { affineMaps[i].a21 = v; updateFractal(); });
        const a22 = buildLabeledNumber(`A${i+1}.a22`, '0.001', m.a22, v => { affineMaps[i].a22 = v; updateFractal(); });

        row.append(a11.wrapper, a12.wrapper, a21.wrapper, a22.wrapper);
        wrap.appendChild(row);
    });
}

function renderVectorInputs() {
    const wrap = document.getElementById('vectorBInputsContainer');
    if (!wrap) return;
    wrap.replaceChildren();

    affineMaps.forEach((m, i) => {
        const row = document.createElement('div');
        row.style.display = 'grid';
        row.style.gridTemplateColumns = 'repeat(2, minmax(80px,1fr))';
        row.style.gap = '6px';

        const b1 = buildLabeledNumber(`b${i+1}.b1`, '0.001', m.b1, v => {
            affineMaps[i].b1 = v; anchors[i].x = v; updateFractal();
        });
        const b2 = buildLabeledNumber(`b${i+1}.b2`, '0.001', m.b2, v => {
            affineMaps[i].b2 = v; anchors[i].y = v; updateFractal();
        });

        row.append(b1.wrapper, b2.wrapper);
        wrap.appendChild(row);
    });    
}

function renderProbInputs() {
    const wrap = document.getElementById('probabilitiesContainer');
    if (!wrap) return;
    wrap.replaceChildren;

    let sum = 0;
    affineMaps.forEach((m, i) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.margin = '6px 0';

        const p = buildLabeledNumber(`p${i+1}`, '0.001', m.prob, v => {
            affineMaps[i].prob = Math.max(0, v);
            renderProbInputs();     // Refreshing the sum display
            updateFractal();
        });

        row.appendChild(p.wrapper);
        wrap.appendChild(row);
        sum += (+m.prob || 0);
    });

    const summary = document.createElement('div');
    summary.style.marginTop = '6px';
    summary.style.fontSize = '12px';

    const sumText = document.createElement('span');
    sumText.innerHTML = `Sum: <strong>${sum.toFixed(4)}</strong>`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Normalize';
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', () => {
        normaliseProbs();
        renderProbInputs();
        updateFractal();
    });

    summary.append(sumText, btn);
    wrap.appendChild(summary);
}

function renderAllEditors() {
    const mc = document.getElementById('mapCount');
    if (mc) {
        mc.value = affineMaps.length;
    }

    renderMatrixInputs();
    renderVectorInputs();
    renderProbInputs();
}

// Syncing vector inputs while dragging the anchors:
canvas.addEventListener('mousemove', () => {
    if (!draggingAnchor) return;

    const wrap = document.getElementById('vectorBInputsContainer');
    if (!wrap) return;

    const inputs = wrap.querySelectorAll('input');
    inputs.forEach(inp => {
        const label = inp.previousElementSibling?.textContent || '';
        const match = /b(\d+)\.b([12])/.exec(label);
        if (!match) return;
        const idx = parseInt(match[1], 10) - 1;
        const which = match[2] === '1' ? 'b1' : 'b2';
        inp.value = affineMaps[idx][which];
    });
});

const _orig_updateFractal = updateFractal;
updateFractal = function () {
    const nInput = document.getElementById('numPoints');
    const n = nInput ? Math.max(100, Math.floor(+nInput.value || 10000)) : 10000;
    const points = generateAffineFractal(affineMaps, n);
    drawPoints(points);
    updateZoomIndicator();
};

// === NOW FOR THE EVENT LISTENERS === //
canvas.addEventListener("mousedown", e => {
    const pos = mapPixelToRange(e.offsetX, e.offsetY);
    for (const a of anchors) {
        if (Math.hypot(pos.x - a.x, pos.y - a.y) < 0.1) {
            draggingAnchor = a;
            return;
        }
    }
    if (e.button === 0) {
        // left click = pan
        isPanning = true;
        panStart = pos;
    }
});
canvas.addEventListener("mousemove", e => {
    const pos = mapPixelToRange(e.offsetX, e.offsetY);
    const coords = document.querySelector('#mouse-coords');
    if (coords) coords.textContent = `x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}`;

    if (draggingAnchor) {
        draggingAnchor.x = pos.x;
        draggingAnchor.y = pos.y;
        const m = affineMaps[draggingAnchor.mapIndex];
        m.b1 = pos.x;
        m.b2 = pos.y;

        initAnchorsFromMaps();
        updateFractal();
    } else if (isPanning && panStart) {
        const dx = pos.x - panStart.x;
        const dy = pos.y - panStart.y;
        view.xMin -= dx; view.xMax -= dx;
        view.yMin -= dy; view.yMax -= dy;
        panStart = pos;

        updateFractal();
    }
});

canvas.addEventListener("mouseup", () => {
    draggingAnchor = null;
    isPanning = false;
    panStart = null;
});

canvas.addEventListener("mouseleave", () => {
    draggingAnchor = null;
    isPanning = false;
    panStart = null;
});

// Zooming in on left-click:
canvas.addEventListener("click", e => {
    if (e.button === 0) {
        zoomView(e.offsetX, e.offsetY, -1);
    }
});
// Zooming out on right-click:
canvas.addEventListener("contextmenu", e => {
    e.preventDefault();     // prevents defaulting
    zoomView(e.offsetX, e.offsetY, +1);
});

// === BUTTONS === //
document.querySelector('#resetAffine')?.addEventListener('click', resetView);
document.querySelector('#clearCanvas')?.addEventListener('click', () => clearCanvas(true));
document.querySelector('#exportAffine')?.addEventListener('click', exportCanvas);
document.querySelector('#toggleAnimation')?.addEventListener('click', () => {
    toggleAnimation();
    const btn = document.getElementById('toggleAnimation');
    if (btn) btn.textContent = playing ? 'Pause Animation' : 'Play/Pause Animation';
});
document.querySelector('#stepOnce')?.addEventListener('click', stepOnce);
document.querySelector('#recordVideo')?.addEventListener('click', startRecording);

const exampleSelect = document.querySelector('#exampleSelector');
if (exampleSelect) {
    exampleSelect.addEventListener('change', e => selectExample(e.target.value));
}

document.getElementById('generateAffine')?.addEventListener('click', () => updateFractal());

document.getElementById('drawGrid')?.addEventListener('click', () => {
    clearCanvas(false);
    drawGrid();
    drawAnchors();
});

document.getElementById('mapCount')?.addEventListener('input', (e) => {
    const desired = parseInt(e.target.value, 10);
    if (!Number.isFinite(desired)) return;
    ensureMapsLength(desired);
    renderAllEditors();

    updateFractal();
});

// === INITIAL RENDERING === //
window.addEventListener('resize', () => {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    updateFractal();
});

// Initial canvas sizing
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

// Default example + first render of editors
selectExample("Sierpinski Triangle"); // default
ensureMapsLength(affineMaps.length || 3);
renderAllEditors();
updateFractal();