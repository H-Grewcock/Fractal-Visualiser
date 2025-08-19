// js/polyhedra.js

let canvas, ctx;

let points = [];
let angleX = Math.PI / 6;
let angleY = Math.PI / 6;
let scale = 200;
let offsetX = 0;
let offsetY = 0;
let zoomLevel = 1;
let animationLevel = 1;
let animationFrame = null;

// Recording states:
let recording = false;
let recorder;
let recordedChunks = [];

let rotationSpeed = 0.01;
let iterations = 20;
let lambda = 0.5;
let lastExampleChoice = 'poly_tetra_vertices';

// === INITIAL RENDERING === //
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('polyCanvas');
    if (!canvas) {
        console.error('Canvas element not found.');
        return;
    }
    ctx = canvas.getContext('2d');

    resizeCanvas();
    setupMouseHandlers();
    bindUI();

    // Default fractal (polyhedral IFS):
    drawPolyIFS('tetra', 'vertices', lambda, iterations * 300, { noRepeat: false, noOppFace: false });
    window.addEventListener('resize', resizeCanvas);
});

function project3D([x, y, z]) {
    const sinX = Math.sin(angleX);
    const cosX = Math.cos(angleX);
    const sinY = Math.sin(angleY);
    const cosY = Math.cos(angleY);

    let dx = cosY * x + sinY * z;
    let dz = -sinY * x + cosY * z;

    let dy = cosX * y - sinX * dz;
    dz = sinX * y + cosX * dz;

    return [
        dx * scale * zoomLevel + canvas.width / 2 + offsetX,
        dy * scale * zoomLevel + canvas.height / 2 + offsetY
    ];
}

function clearCanvas() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPoints(pts, size = 2, colorFn = () => "#333") {
    for (let p of pts) {
        const [x, y] = project3D(p);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        ctx.fillStyle = colorFn(p);

        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function redraw() {
    if (!canvas || !ctx) return;

    clearCanvas();
    const colorFn = getColourScheme();
    drawPoints(points, 2, colorFn);
    updateZoomIndicator();
}

function resizeCanvas() {
    if (!canvas) return;

    let w = canvas.clientWidth || canvas.width || 600;
    let h = canvas.clientHeight || canvas.height || 600;
    canvas.width = w;
    canvas.height = h;

    redraw();
}

// === FITTING DRAWINGS TO CANVAS === //
function computeBounds(pts) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const [x, y, z] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
    }

    return { minX, maxX, minY, maxY, minZ, maxZ };
}

function fittingPointsToCanvas(pts, marginFraction = 0.08) {
    if (!pts.length) return;
    const { minX, maxX, minY, maxY } = computeBounds(pts);

    const rangeX = Math.max(1e-6, maxX - minX);
    const rangeY = Math.max(1e-6, maxY - minY);
    const range = Math.max(rangeX, rangeY);

    const width = canvas.width;
    const height = canvas.height;
    const usableW = width * (1 - 2 * marginFraction);
    const usableH = height * (1 - 2 * marginFraction);
    const s = Math.min(usableW / range, usableH / range);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    scale = s;
    zoomLevel = 1;

    offsetX = -cx * scale;
    offsetY = -cy * scale;
}

// === Vector Math === //
function add3(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale3(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
}
function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function len3(v) {
    return Math.sqrt(dot3(v, v));
}

function normalise(v) {
    const L = len3(v) || 1;
    return [v[0] / L, v[1] / L, v[2] / L];
}

// === POLYHEDRA DATA === //
const solids = {
    tetra: {
        vertices: [
            [1, 1, 1],
            [1, -1, -1],
            [-1, 1, -1],
            [-1, -1, 1]
        ].map(normalise),
        faces: [
            [0,1,2],
            [0,3,1],
            [0,2,3],
            [1,3,2]
        ]
    },
    cube: {
        vertices: [
            [-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],
            [-1,-1, 1],[1,-1, 1],[1,1, 1],[-1,1, 1]
        ].map(v=>scale3(normalise(v), Math.sqrt(3))),
        faces: [
            [0,1,2,3],[4,5,6,7],[0,1,5,4],
            [2,3,7,6],[1,2,6,5],[0,3,7,4]
        ]
    },
    octa: {
        vertices: [
            [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]
        ],
        faces: [
            [0,2,4],[2,1,4],[1,3,4],[3,0,4],
            [2,0,5],[1,2,5],[3,1,5],[0,3,5]
        ]
    },
    icosa: {
        vertices: (function(){
            const phi = (1 + Math.sqrt(5))/2;
            const vs = [
                [-1,  phi, 0],[ 1,  phi, 0],[-1, -phi, 0],[ 1, -phi, 0],
                [0, -1,  phi],[0,  1,  phi],[0, -1, -phi],[0,  1, -phi],
                [ phi, 0, -1],[ phi, 0,  1],[-phi, 0, -1],[-phi, 0,  1]
            ];

            return vs.map(normalise).map(v=>scale3(v,1.1));
        })(),
        faces: [
            [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
            [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
            [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
            [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]
        ]
    }
};

function centroid(indices, verts) {
    let c=[0,0,0];
    indices.forEach(i=>{
        c=add3(c, verts[i]);
    });

    return scale3(c, 1/indices.length);
}

function faceCenters(solid) {
    if (!solid.faces || solid.faces.length === 0) {
        return [];
    }

    return solid.faces.map(f => normalise(centroid(f, solid.vertices)));
}

function edgeMidpoints(solid){
    const seen = new Set();
    const mids = [];
    if (!solid.faces || solid.faces.length===0) return mids;

    for (const f of solid.faces){
        for (let i=0;i<f.length;i++){
        const a=f[i], b=f[(i+1)%f.length];
        const key = a<b ? `${a}-${b}` : `${b}-${a}`;

        if (seen.has(key)) continue;
        seen.add(key);
        const mid = scale3(add3(solid.vertices[a], solid.vertices[b]), 0.5);
        mids.push(normalise(mid));
        }
    }

    return mids;
}

function rotAxisAngle(v, axis, theta){
    const [x,y,z]=v, [u,vv,w]=axis;
    const c=Math.cos(theta), s=Math.sin(theta), t=1-c;
    const m00=t*u*u + c,     m01=t*u*vv - s*w,  m02=t*u*w + s*vv;
    const m10=t*u*vv + s*w,  m11=t*vv*vv + c,   m12=t*vv*w - s*u;
    const m20=t*u*w - s*vv,  m21=t*vv*w + s*u,  m22=t*w*w + c;

    return [
        m00*x + m01*y + m02*z,
        m10*x + m11*y + m12*z,
        m20*x + m21*y + m22*z
    ];
}

// === CHAOS GAME === //
function generateChaosGame(targets, lambda = 0.5, iters = 50000, constraints = { noRepeat: false, noOppFace: false }) {
    if (!targets || !targets.length) return [];

    let pts = [];
    let p = [0, 0, 0];
    let lastIndex = -1;
    const oppThresh = -0.2;

    for (let i = 0; i < iters; i++) {
      let idx;

      for (let guard = 0; guard < 20; guard++) {
          idx = (Math.random() * targets.length) | 0;
          if (constraints.noRepeat && idx === lastIndex) continue;
          if (constraints.noOppFace && dot3(normalise(p), targets[idx]) < oppThresh) continue;
          break;
      }

      const t = targets[idx];
      p = add3(scale3(p, 1 - lambda), scale3(t, lambda));
      pts.push(p.slice());
      lastIndex = idx;
    }
    
    return pts;
}

// === POLYHEDRAL IFS === //
function generatePolyIFS(opts) {
    const { solid: solidKey = 'tetra', target = 'vertices', lambda = 0.5, iterations = 50000, constraints = { noRepeat: false, noOppFace: false }} = opts || {};
    const solid = solids[solidKey];
    if (!solid) return [];

    let targets;
    if (target === 'vertices') targets = solid.vertices;
    else if (target === 'faces') targets = faceCenters(solid);
    else targets = edgeMidpoints(solid);

    return generateChaosGame(targets, lambda, iterations, constraints);
}

// === SYMMETRY ORBITS === //
function generateSymmetryOrbit(opts) {
    const { solid: solidKey='tetra', steps = 30000, stepAngleMode = 'discrete' } = opts || {};
    const solid = solids[solidKey];
    if (!solid) return;

    const verts = solid.vertices;
    const faces = solid.faces||[];
    const edges = edgeMidpoints(solid);

    const axes = [
        ...verts.map(normalise),
        ...faceCenters(solid).map(normalise),
        ...edges.map(normalise)
    ];
    if (!axes.length) return [];

    const angleSets = {
        tetra: [Math.PI, 2*Math.PI/3],
        cube:  [Math.PI, Math.PI/2, 2*Math.PI/3],
        octa:  [Math.PI, Math.PI/2, 2*Math.PI/3],
        icosa: [Math.PI, 2*Math.PI/3, 2*Math.PI/5]
    };
    const discreteAngles = angleSets[solidKey] || [Math.PI];

    let pts = [];
    let p = [0.17, 0.11, 0.09];     // seed.

    for (let i = 0; i < steps; i++) {
        const axis = axes[Math.floor(Math.random()*axes.length) | 0];
        const theta = (stepAngleMode==='discrete')
        ? discreteAngles[Math.floor(Math.random()*discreteAngles.length) | 0]
        : (Math.random()*0.2 + 0.05);
        p = rotAxisAngle(p, axis, theta);
        p = normalise(p);

        pts.push(p.slice());
    }
    
    return pts;
}

// === DRAWING FUNCTIONS === //
function drawPolyIFS(solid = 'tetra', target = 'vertices', lambda = 0.5, it = 60000, constraints={ noRepeat: false, noOppFace: false }) {
    points = generatePolyIFS({ solid, target, lambda, iterations: it, constraints });
    fittingPointsToCanvas(points);
    redraw();
}

function drawSymmetryOrbit(solid='tetra', steps = 40000, mode = 'discrete') {
    points = generateSymmetryOrbit({ solid, steps, stepAngleMode: mode });
    fittingPointsToCanvas(points);
    redraw();
}

// === VIEWING CONTROLS === //
function resetView() {
    offsetX = offsetY = 0;
    zoomLevel = 1;
    angleX = Math.PI / 6;
    angleY = Math.PI / 6;

    redraw();
}

function zoomAt(x, y, factor) {
    let prevZoom = zoomLevel;
    zoomLevel *= factor;
    offsetX = (offsetX - x) * (zoomLevel / prevZoom) + x;
    offsetY = (offsetY - y) * (zoomLevel / prevZoom) + y;

    redraw();
}


function updateZoomIndicator() {
    const el = document.querySelector('#zoomLevel');
    if (el) el.value = zoomLevel.toFixed(2);
    const zdisp = document.querySelector('#zoom-indicator');
    if (zdisp) zdisp.textContent = `Zoom: ${zoomLevel.toFixed(2)}x`;
}


// === DRAG TO ROTATE & PAN === //
function enableDragToRotate(canvas, redrawFn) {
    let isDragging = false;
    let lastX;
    let lastY;

    canvas.addEventListener("mousedown", e => {
        if (e.button === 0) {
            // left click = rotate
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        }
    });

    canvas.addEventListener("mouseup", () => isDragging = false);
    canvas.addEventListener("mouseleave", () => isDragging = false);

    canvas.addEventListener("mousemove", e => {
        if (!isDragging) return;

        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const sensitivity = 0.01;

        angleX += dx * sensitivity;
        angleY += dy * sensitivity;

        lastX = e.clientX;
        lastY = e.clientY;

        redrawFn();
    });
}

function enableDragToPan(canvas, redraw) {
    let isPanning = false;
    let startX;
    let startY;

    canvas.addEventListener("mousedown", e => {
        if (e.button === 1) {
            // middle click = pan
            e.preventDefault();

            isPanning = true;
            startX = e.clientX - offsetX;
            startY = e.clientY - offsetY;
        }
    });

    canvas.addEventListener("mouseup", () => isPanning = false);
    canvas.addEventListener("mouseleave", () => isPanning = false);

    canvas.addEventListener("mousemove", e => {
        if (!isPanning) return;
        offsetX = e.clientX - startX;
        offsetY = e.clientY - startY;

        redraw();
    });
}

// === MOUSE === //
function setupMouseHandlers() {
    if (!canvas) return;

    enableDragToRotate(canvas, redraw);
    enableDragToPan(canvas, redraw);

    canvas.addEventListener('mousemove', e => {
        const coords = document.querySelector('#mouse-coords');
        if (coords) coords.textContent = `X: ${e.clientX}, Y: ${e.clientY}`;
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();     // prevents defaulting

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        zoomAt(x, y, e.deltaY < 0 ? 1.1 : 0.9);
    }, { passive: false });
}


// === ANIMATION === //
function toggleAnimation() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    } else {
        animate();
    }
}

// Rotating continuously around the y-axis.
function animate() {
    angleY += rotationSpeed;
    redraw();
    animationFrame = requestAnimationFrame(animate);
}

// === RECORDING === //
function startRecording() {
    if (!canvas) return;

    let stream = canvas.captureStream(30);
    recorder = new MediaRecorder(stream);
    recordedChunks = [];
    recorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.push(e.data);
    };
    recorder.onstop = exportVideo;
    recorder.start();
    recording = true;

    document.getElementById('startRecordingBtn').disabled = true;
    document.getElementById('stopRecordingBtn').disabled = false;
}

function stopRecording() {
    if (recorder && recording) {
        recorder.stop();
        recording = false;
        document.getElementById('startRecordingBtn').disabled = false;
        document.getElementById('stopRecordingBtn').disabled = true;
    }
}

function exportVideo() {
    let blob = new Blob(recordedChunks, { type: 'video/webm' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = '3DFractalRecording.webm';
    a.click();
    URL.revokeObjectURL(url);
}

// === EXPORT IMAGE === //
function exportCanvas() {
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = '3DFractal.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// === UI BINDINGS === //
function bindUI() {
    document.getElementById('renderBtn').addEventListener('click', () => {
        const choiceEl = document.getElementById('fractalExample');
        const choice = choiceEl ? choiceEl.value : lastExampleChoice;

        lastExampleChoice = choice;
        switch (choice) {
            // Polyhedra IFS:
            case 'poly_tetra_vertices':
                drawPolyIFS('tetra', 'vertices', lambda, iterations * 300, {noRepeat:false, noOppFace:false});
                break;
            case 'poly_octa_faces':
                drawPolyIFS('octa', 'faces', lambda, iterations * 300, {noRepeat:true, noOppFace:false});
                break;
            case 'poly_cube_edges':
                drawPolyIFS('cube', 'edges', lambda, iterations * 350, {noRepeat:true, noOppFace:true});
                break;
            case 'poly_icosa_vertices_nr':
                drawPolyIFS('icosa', 'vertices', lambda, iterations * 350, {noRepeat:true, noOppFace:false});
                break;
            
            // Symmetry orbits:
            case 'orbit_tetra':
                drawSymmetryOrbit('tetra', iterations * 800, 'discrete');
                break;
            case 'orbit_icosa':
                drawSymmetryOrbit('icosa', iterations * 900, 'discrete');
                break;
            
            // Generic chaos game on cube vertices (used as an example):
            case 'chaos_cube_vertices':
                (function () {
                    const targets = solids.cube.vertices;
                    points = generateChaosGame(targets, lambda, iterations * 400, { noRepeat: false, noOppFace: false });
                    fittingPointsToCanvas(points);
                    redraw();
                })();
                break;
        }
    });
    document.getElementById('iterationsBtn').addEventListener('click', () => {
        const el = document.getElementById('iterationsInput');
        const val = parseInt(el?.value ?? '0', 10);
        if (!isNaN(val) && val > 0) {
            iterations = val;
        }
    });

    document.getElementById('resetViewBtn').addEventListener('click', resetView);
    document.getElementById('exportImageBtn').addEventListener('click', exportCanvas);
    document.getElementById('toggleAnimationBtn').addEventListener('click', toggleAnimation);

    document.getElementById('startRecordingBtn').addEventListener('click', startRecording);
    document.getElementById('stopRecordingBtn').addEventListener('click', stopRecording);

    document.getElementById('rotationSpeed').addEventListener('input', e => {
        const degPerSec = parseFloat(e.target.value)
        rotationSpeed = (degPerSec * Math.PI / 180) / 60; // deg/s -> radians/frame
    });

    document.getElementById('zoomLevel').addEventListener('input', e => {
        zoomLevel = parseFloat(e.target.value);
        redraw();
    });

    // Lambda (jump fraction)
    document.getElementById('lambdaInput')?.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v > 0 && v < 1) {
            lambda = v;

            // If current example is Poly IFS preset, automatically re-renders:
            if (String(lastExampleChoice).startsWith('poly_')) {
                document.getElementById('renderBtn')?.click();
            }
        }
    });
}

// === COLOUR SCHEMES === //
function getColourScheme() {
    const scheme = document.getElementById('colorScheme').value;

    switch (scheme) {
        case 'fire':
            return p => {
                let t = (p[1] + 1.5) / 3;   // normalising y ∈ [-1.5,1.5] -> [0,1]
                let r = 255;
                let g = Math.floor(128 + 127 * t);
                let b = Math.floor(50 * (1 - t));
                return `rgb(${r},${g},${b})`;
            };
        case 'ice':
            return p => {
                let t = (p[2] + 1.5) / 3;
                let r = Math.floor(50 * (1 - t));
                let g = Math.floor(150 + 100 * t);
                let b = 255;
                return `rgb(${r},${g},${b})`;
            };
        case 'neon':
            return p => {
                let t = (p[0] + 1.5) / 3;
                let r = Math.floor(255 * t);
                let g = Math.floor(255 * (1 - t));
                let b = 255;
                return `rgb(${r},${g},${b})`;
            };
        default:
            // Defaults to black:
            return () => '#000';
    }
}