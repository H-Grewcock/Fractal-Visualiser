// js/lSystem.js

document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("lSystemCanvas");
    const ctx = canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    // === UI ELEMENTS === //
    const exampleSelector = document.getElementById("lSystemExampleSelector");
    const iterationsInput = document.getElementById("lSystemIterations");

    const generateBtn = document.getElementById("generateLSystem");
    const resetBtn = document.getElementById("resetLSystem");
    const exportBtn = document.getElementById("exportLSystem");
    const clearBtn = document.getElementById("clearLSystem");
    const playPauseBtn = document.getElementById("togglePlayPause");
    const recordBtn = document.getElementById("recordVideo");
    
    const zoomIndicator = document.getElementById("zoom-indicator");
    const mouseCoords = document.getElementById("mouse-coords");
    
    const gridToggleBtn = document.getElementById("gridToggleBtn");
    const lineWidthInput = document.getElementById("lineWidthInput");

    // States:
    let currentSystem = null;
    let instructions = "";
    let stepIndex = 0;
    let animationRequest = null;
    let isPlaying = true;

    // View (default):
    let view = {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        zoomLevel: 1
    };

    let showGrid = true;
    let lineWidth = 1;
    const gridSize = 50;

    // Recording states:
    let mediaRecorder;
    let recordedChunks = [];

    // L-SYSTEM EXAMPLES === //
    const lSystems = {
        koch: {
            axiom: "F--F--F",
            rules: { F: "F+F--F+F" },
            angle: 60,
            startX: width / 6,
            startY: height * 0.75,
            startAngle: 0,
            step: 5
        },
        dragon: {
            axiom: "FX",
            rules: { X: "X+YF+", Y: "-FX-Y" },
            angle: 90,
            startX: width / 2,
            startY: height / 2,
            startAngle: 0,
            step: 5
        },
        sierpinski: {
            axiom: "F-G-G",
            rules: { F: "F-G+F+G-F", G: "GG" },
            angle: 120,
            startX: width * 0.1,
            startY: height * 0.9,
            startAngle: 0,
            step: 5
        },
        plant: {
            axiom: "X",
            rules: { X: "F+[[X]-X]-F[-FX]+X", F: "FF" },
            angle: 25,
            startX: width / 2,
            startY: height,
            startAngle: -90,
            step: 5
        },
        triangle: {
            axiom: "F-G-G",
            rules: { F: "F-G+F+G-F", G: "GG" },
            angle: 120,
            startX: width * 0.1,
            startY: height * 0.9,
            startAngle: 0,
            step: 5
        }
    };

    // === L-SYSTEM GENERATION === //
    function generateLSystemString(axiom, rules, iterations) {
        let result = axiom;

        for (let i = 0; i < iterations; i++) {
            let next = "";

            for (let char of result) {
                next += rules[char] || char;
            }

            result = next;
        }

        return result;
    }

    // === VIEWING === //
    // Default reset:
    function resetTransform() {
        view.scale = 1;
        view.offsetX = 0;
        view.offsetY = 0;
        view.zoomLevel = 1;

        updateZoomIndicator(view);
    }

    function clearCanvas() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.restore();
    }

    function drawGrid() {
        if (!showGrid) return;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        for (let x = 0; x < width; x += gridSize) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
        }

        for (let y = 0; y < height; y += gridSize) {
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
        }

        ctx.stroke();
        ctx.restore();
    }

    // === FITTING THE L-SYSTEM EXAMPLES TO THE CANVAS FOR NUMBER OF ITERATIONS === //
    function fitToCanvas(instr, angleDeg, step) {
        let angle = currentSystem.startAngle * Math.PI / 180;
        let pos = { x: 0, y: 0 };
        const stack = [];

        let minX = 0;
        let maxX = 0;
        let minY = 0;
        let maxY = 0;

        for (let cmd of instr) {
            switch (cmd) {
                case "F": case "G":
                    pos.x += Math.cos(angle) * step;
                    pos.y += Math.sin(angle) * step;
                    minX = Math.min(minX, pos.x);
                    maxX = Math.max(maxX, pos.x);
                    minY = Math.min(minY, pos.y);
                    maxY = Math.max(maxY, pos.y);
                    break;
                case "+":
                    angle += angleDeg * Math.PI / 180;
                    break;
                case "-":
                    angle -= angleDeg * Math.PI / 180;
                    break;
                case "[":
                    stack.push({ x: pos.x, y: pos.y, angle });
                    break;
                case "]":
                    const state = stack.pop();
                    pos.x = state.x; pos.y = state.y; angle = state.angle;
                    break;
            }
        }

        const dx = maxX - minX;
        const dy = maxY - minY;
        const scale = Math.min(width / dx, height / dy) * 0.9;

        return {
            scale,
            offsetX: (width - (minX + maxX) * scale) / 2,
            offsetY: (height - (minY + maxY) * scale) / 2
        };
    }

    // Rendering the L-Systems:
    function renderLSystem() {
        if (!instructions || !currentSystem) return;

        clearCanvas();
        drawGrid();

        const fit = fitToCanvas(instructions, currentSystem.angle, currentSystem.step);

        ctx.save();
        ctx.setTransform(view.scale * fit.scale, 0, 0, view.scale * fit.scale,
            view.offsetX + fit.offsetX * view.scale,
            view.offsetY + fit.offsetY * view.scale
        );
        
        ctx.lineWidth = lineWidth / (view.scale * fit.scale);

        let angle = currentSystem.startAngle * Math.PI / 180;
        const stack = [];
        let pos = { x: 0, y: 0 };

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);

        for (let cmd of instructions) {
            switch (cmd) {
                case "F": case "G":
                    pos.x += Math.cos(angle) * currentSystem.step;
                    pos.y += Math.sin(angle) * currentSystem.step;
                    ctx.lineTo(pos.x, pos.y);
                    break;
                case "+":
                    angle += currentSystem.angle * Math.PI / 180;
                    break;
                case "-":
                    angle -= currentSystem.angle * Math.PI / 180;
                    break;
                case "[":
                    stack.push({ x: pos.x, y: pos.y, angle });
                    break;
                case "]":
                    const state = stack.pop();
                    pos.x = state.x; pos.y = state.y; angle = state.angle;
                    ctx.moveTo(pos.x, pos.y);
                    break;
            }
        }

        ctx.stroke();
        ctx.restore();
    }

    // === ANIMATED DRAW (on generate) === //
    function drawLSystemAnimated(instr, angleDeg, step, startX, startY, startAngle) {
        cancelAnimationFrame(animationRequest);
        clearCanvas();
        drawGrid();

        const fit = fitToCanvas(instr, angleDeg, step);

        ctx.save();
        ctx.setTransform(view.scale * fit.scale, 0, 0, view.scale * fit.scale,
            view.offsetX + fit.offsetX * view.scale,
            view.offsetY + fit.offsetY * view.scale);

        ctx.lineWidth = lineWidth / (view.scale * fit.scale);

        let angle = startAngle * Math.PI / 180;
        const stack = [];
        let pos = { x: 0, y: 0 };

        ctx.beginPath();
        ctx.moveTo(0, 0);

        function stepDraw() {
            if (!isPlaying) {
                animationRequest = requestAnimationFrame(stepDraw);
                return;
            }

            const cmd = instr[stepIndex];
            if (!cmd) {
                ctx.stroke();
                ctx.restore();
                return;
            }

            switch (cmd) {
                case "F": case "G":
                    pos.x += Math.cos(angle) * step;
                    pos.y += Math.sin(angle) * step;
                    ctx.lineTo(pos.x, pos.y);
                    break;
                case "+":
                    angle += angleDeg * Math.PI / 180;
                    break;
                case "-":
                    angle -= angleDeg * Math.PI / 180;
                    break;
                case "[":
                    stack.push({ x: pos.x, y: pos.y, angle });
                    break;
                case "]":
                    const state = stack.pop();
                    pos.x = state.x; pos.y = state.y; angle = state.angle;
                    ctx.moveTo(pos.x, pos.y);
                    break;
            }

            stepIndex++;
            if (stepIndex % 50 === 0) ctx.stroke();
            animationRequest = requestAnimationFrame(stepDraw);
        }

        stepIndex = 0;
        animationRequest = requestAnimationFrame(stepDraw);
    }

    // === EVENT HANDLERS === //
    function handleGenerate() {
        const type = exampleSelector.value;
        const iterations = parseInt(iterationsInput.value, 10);
        if (!type || !lSystems[type]) return;

        currentSystem = lSystems[type];
        instructions = generateLSystemString(currentSystem.axiom, currentSystem.rules, iterations);
        resetTransform();
        drawLSystemAnimated(
            instructions,
            currentSystem.angle,
            currentSystem.step,
            currentSystem.startX,
            currentSystem.startY,
            currentSystem.startAngle
        );
    }

    function handleReset() {
        cancelAnimationFrame(animationRequest);
        clearCanvas();
        exampleSelector.value = "";
        iterationsInput.value = 4;
        resetTransform();
        currentSystem = null;
        stepIndex = 0;
    }

    function handleClear() {
        cancelAnimationFrame(animationRequest);
        clearCanvas();
        drawGrid();
        stepIndex = 0;
    }

    function handlePlayPause() {
        isPlaying = !isPlaying;
        playPauseBtn.textContent = isPlaying ? "Pause" : "Play";
    }

    function handleExport() {
        const link = document.createElement("a");
        link.download = "l-system-fractal.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
    }

    function handleRecord() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            recordBtn.textContent = "Record Video";
            return;
        }
        recordedChunks = [];
        const stream = canvas.captureStream(60);
        mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: "video/webm" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "l-system-animation.webm";
            link.click();
        };
        mediaRecorder.start();
        recordBtn.textContent = "Stop Recording";
    }

    // === ZOOM & PAN === //
    function canvasToWorld(x, y) {
        return {
            x: (x - view.offsetX) / view.scale,
            y: (y - view.offsetY) / view.scale
        };
    }

    function updateView(cx, cy, scaleFactor) {
        view.scale *= scaleFactor;
        view.offsetX = width / 2 - cx * view.scale;
        view.offsetY = height / 2 - cy * view.scale;
        view.zoomLevel *= scaleFactor;
        updateZoomIndicator(view);
        renderLSystem();
    }

    canvas.addEventListener("click", (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const world = canvasToWorld(x, y);
        updateView(world.x, world.y, 2);
    });

    canvas.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const world = canvasToWorld(x, y);
        updateView(world.x, world.y, 0.5);
    });

    function enableDragToPan() {
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

            view.offsetX += dx;
            view.offsetY += dy;
            startX = currentX;
            startY = currentY;

            renderLSystem();
        });
    }
    enableDragToPan();

    // === UI LISTENERS === //
    generateBtn.addEventListener("click", handleGenerate);
    resetBtn.addEventListener("click", handleReset);
    clearBtn.addEventListener("click", handleClear);
    playPauseBtn.addEventListener("click", handlePlayPause);
    exportBtn.addEventListener("click", handleExport);
    recordBtn.addEventListener("click", handleRecord);

    gridToggle.addEventListener("change", () => {
        showGrid = gridToggle.checked;
        renderLSystem();
    });

    lineWidthInput.addEventListener("input", () => {
        lineWidth = parseFloat(lineWidthInput.value) || 1;
        renderLSystem();
    });

    // === PLACEHOLDER === //
    function updateZoomIndicator(view) {
        if (zoomIndicator) zoomIndicator.textContent = `Zoom: ${view.zoomLevel.toFixed(2)}x`;
    }
});