// js/3DFractals.js

const canvas = document.getElementById("3DCanvas");
const ctx = canvas.getContext("2d");

let points = [];
let angleX = Math.PI / 6;
let angleY = Math.PI / 6;
let scale = 200;
let offsetX = 0;
let offsetY = 0;

let dragging = false;
let dragaStart = [0, 0];

let zoomLevel = 1;

let animationFrame;
let recording = false;
let recorder;
let recordedChunks = [];

let rotationSpeed = 0.01;   // Default radians/frame (~30 deg/s)
let iterations = 20;        // Default -- able to change in html.

// Initial rendering:
resizeCanvas();
setupMouseHandlers();
bindUI();
drawMengerSponge(2);         // Default rendering.

window.addEventListener("resize", resizeCanvas);

// === PROJECTION === //
// Projecting [x,y,z] to a 2D canvas: using rotation and scaling:
function project3D([x, y, z]) {
    const sinX = Math.sin(angleX);
    const cosX = Math.cos(angleX);
    const sinY = Math.sin(angleY);
    const cosY = Math.cos(angleY);

    // Rotating about the y-axis:
    let dx = cosY * x + sinY * z;
    let dz = -sinY * x + cosY * z;

    // Rotating about the x-axis:
    let dy = cosX * y - sinY * dz;
    dz = sinX * y + cosX * dz;

    // Returning 2D coordinates:
    return [
        dx * scale * zoomLevel + canvas.width / 2 + offsetX,
        dy * scale * zoomLevel + canvas.height / 2 + offsetY
    ];
}

function clearCanvas() {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// === DRAWING FUNCTIONS === //
function drawPoints(pts, size = 2, colorFn = () => "#333") {
    for (let p of pts) {
        const [x, y] = project3D(p);
        ctx.fillStyle = colorFn(p);

        ctx.beginPath();
        ctx.arc(x, y, size, 0, 2 * Math.PI);
        ctx.fill();
    }
}

function redraw() {
    clearCanvas();
    drawPoints(points, 2, getColourScheme());
    updateZoomIndicator();
}

function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    redraw();
}

// === FIT-TO-CANVAS FUNCTIONS === //
function computeBounds(pts) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

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

function fittingPointsToCanvas(pts, marginFrac = 0.08) {
    if (!pts.length) return;
    const { minX, maxX, minY, maxY, minZ, maxZ } = computeBounds(pts);

    const rangeX = Math.max(1e-6, maxX - minX);
    const rangeY = Math.max(1e-6, maxY - minY);
    const range = Math.max(rangeX, rangeY);

    const width = canvas.width;
    const height = canvas.height;
    const usableW = width * (1 - 2 * marginFrac);
    const usableH = height * (1 - 2 * marginFrac);
    const s = Math.min(usableW / range, usableH / range);

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    scale = s;
    zoomLevel = 1;
    offsetX = -cx * scale + (width / 2);
    offsetY = -cy * scale + (height / 2);
}

// === 3D FRACTALS === //
// Menger sponge:
// The process of dividing each cube into 27 sub-cubes, and removing the centre pieces.
function generateMenger(level, center = [0, 0, 0], size = 1) {
    // Base case: returns cube centre point:
    if (level === 0) {
        return [center];
    }
    let cubes = [];
    let step = size / 3;

    for (let dx of [-1, 0, 1]) {
        for (let dy of [-1, 0, 1]) {
            for (let dz of [-1, 0, 1]) {
                // Skipping middle cubes in each axis plane, i.e. holes.
                let zeros = [dx, dy, dz].filter(v => v === 0).length;
                if (zeros >= 2) continue;

                let nx = center[0] + dx * step;
                let ny = center[1] + dy * step;
                let nz = center[2] + dz * step;

                // Recursively creating sub-cubes:
                cubes.push(...generateMenger(level - 1, [nx, ny, nz], step));
            }
        }
    }

    return cubes;
}

// Sierpinski Tetrahedron: Chaos Game with four vertices:
function generateSierpinski(iterations = 5000) {
    const vertices = [
        [1, 1, 1],
        [-1, -1, 1],
        [-1, 1, -1],
        [1, -1, -1]
    ];

    // Starting point, p
    let p = [0, 0, 0];
    let result = [];

    for (let i = 0; i < iterations; i++) {
        let v = vertices[Math.floor(Math.random() * 4) | 0];    // Chaos game here - random vertex
        
        // Moving to the halfway point:
        p = [(p[0] + v[0]) / 2, (p[1] + v[1]) / 2, (p[2] + v[2]) / 2];
        result.push([...p]);
    }

    return result;
}

// Mandelbulb (3D Mandelbrot): z -> z^n + c in 3D.
function generateMandelbulb(iterations = 15, power = 8, bailout = 2, density = 20000) {
    let result = [];

    for (let i = 0; i < density; i++) {
        // Random starting point in the cube [-1.5, 1.5]^3:
        let x = (Math.random() * 3 - 1.5);
        let y = (Math.random() * 3 - 1.5);
        let z = (Math.random() * 3 - 1.5);

        let zx = x;
        let zy = y;
        let zz = z;

        let dr = 1.0;
        let r = 0.0;
        let escaped = false;

        for (let n = 0; n < iterations; n++) {
            r = Math.sqrt(zx * zx + zy * zy + zz * zz);
            if (r > bailout) {
                escaped = true;
                break;
            }

            // Convert to spherical coordinates:
            let theta = Math.acos(zz / r);
            let phi = Math.atan2(zy, zx);
            let rn = Math.pow(r, power);

            // Scaling angles by the power:
            theta *= power;
            phi *= power;

            // Convert back to Cartesian coordinates: add the original c = (x,y,z):
            zx = rn * Math.sin(theta) * Math.cos(phi) + x;
            zy = rn * Math.sin(theta) * Math.sin(phi) + y;
            zz = rn * Math.cos(theta) + z;
        }

        if (!escaped) {
            result.push([x, y, z]);
        }
    }

    return result;
}

// 3D Julia Set: constant c added.
// Remember to add in ability to change constant c!
function generateJulia3D(iterations = 15, power = 8, bailout = 2, density = 20000, c = [0.355, 0.355, 0.355]) {
    let result = [];

    for (let i = 0; i < density; i++) {
        // Random starting point in the cube [-1.5, 1.5]^3:
        let zx = (Math.random() * 3 - 1.5);
        let zy = (Math.random() * 3 - 1.5);
        let zz = (Math.random() * 3 - 1.5);

        let escaped = false;
        for (let n = 0; n < iterations; n++) {
            let r = Math.sqrt(zx * zx + zy * zy + zz * zz);
            if (r > bailout) {
                escaped = true;
                break;
            }

            let theta = Math.acos(zz / r);
            let phi = Math.atan2(zy, zx);
            let rn = Math.pow(r, power);

            theta *= power;
            phi *= power;

            zx = rn * Math.sin(theta) * Math.cos(phi) + c[0];
            zy = rn * Math.sin(theta) * Math.sin(phi) + c[1];
            zz = rn * Math.cos(theta) + c[2];
        }

        if (!escaped) {
            result.push([zx, zy, zz]);
        }
    }

    return result;
}

// === DRAWING FUNCTIONS === //
function drawMengerSponge(level = 2) {
    const L = Math.max(0, Math.min(4, Math.floor(level)));
    points = generateMenger(L);
    fittingPointsToCanvas(points);
    redraw();
}

function drawSierpinskiTetrahedron() {
    points = generateSierpinski(iterations * 400);  // scaled
    fittingPointsToCanvas(points);
    redraw();
}

function drawMandelbrot3D() {
    points = generateMandelbulb(iterations, 8, 2, 30000);
    fittingPointsToCanvas(points);
    redraw();
}

function drawJulia3D() {
    points = generateJulia3D(iterations, 8, 2, 30000, [0.3, -0.2, 0.4]);
    fittingPointsToCanvas(points);
    redraw();
}

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
function enableDragToRotate(canvas, redraw) {
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

        redraw();
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
    enableDragToRotate(canvas, redraw);
    enableDragToPan(canvas, redraw);

    canvas.addEventListener('mousemove', e => {
        const coords = document.querySelector('#mouse-coords');
        if (coords) coords.textContent = `X: ${e.clientX}, Y: ${e.clientY}`;
    });

    canvas.addEventListener('wheel', e => {
        e.preventDefault();     // prevents defaulting
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9);
    });
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
    let stream = canvas.captureStream(30);  // Captured at 30 FPS
    recorder = new MediaRecorder(stream);
    recordedChunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
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
    const link = document.createElement('a');
    link.download = '3DFractal.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// === UI BINDINGS === //
function bindUI() {
    document.getElementById('renderBtn').addEventListener('click', () => {
        const choice = document.getElementById('fractalExample').value;
        switch (choice) {
            case 'mengerSponge': drawMengerSponge(2); break;
            case 'sierpinskiTetrahedron': drawSierpinskiTetrahedron(); break;
            case 'mandelbrot3D': drawMandelbrot3D(); break;
            case 'julia3D': drawJulia3D(); break;
        }
    });
    document.getElementById('iterationsBtn').addEventListener('click', () => {
        const val = parseInt(document.getElementById('iterationsInput').value);
        if (!isNaN(val) & val > 0) {
            iterations = val;
        }
    });

    document.getElementById('resetViewBtn').addEventListener('click', resetView);
    document.getElementById('exportImageBtn').addEventListener('click', exportCanvas);
    document.getElementById('toggleAnimationBtn').addEventListener('click', toggleAnimation);

    document.getElementById('startRecordingBtn').addEventListener('click', startRecording);
    document.getElementById('stopRecordingBtn').addEventListener('click', stopRecording);

    document.getElementById('rotationSpeed').addEventListener('input', e => {
        rotationSpeed = (parseFloat(e.target.value) * Math.PI / 180) / 60; // deg/s → rad/frame
    });

    document.getElementById('zoomLevel').addEventListener('input', e => {
        zoomLevel = parseFloat(e.target.value);
        redraw();
    });
}

// === COLOUR SCHEMES === //
function getColourScheme() {
    const scheme = document.getElementById('colorScheme').value;

    switch (scheme) {
        case 'fire':
            // Red -> yellow depending on the height, y
            return p => {
                let t = (p[1] + 1.5) / 3;   // normalising y ∈ [-1.5,1.5] -> [0,1]
                let r = 255;
                let g = Math.floor(128 + 127 * t);
                let b = Math.floor(50 * (1 - t));
                return `rgb(${r},${g},${b})`;
            };
        case 'ice':
            return p => {
                // Blue -> cyan depending on depth, z
                let t = (p[2] + 1.5) / 3;
                let r = Math.floor(50 * (1 - t));
                let g = Math.floor(150 + 100 * t);
                let b = 255;
                return `rgb(${r},${g},${b})`;
            };
        case 'neon':
            // Green -> magenta depending on x
            return p => {
                let t = (p[0] + 1.5) / 3;
                let r = Math.floor(255 * t);
                let g = Math.floor(255 * (1 - t));
                let b = 255;
                return `rgb(${r},${g},${b})`;
            };
        default:
            // Classic black
            return () => '#000';
    }
}