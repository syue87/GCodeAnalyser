var canvas = document.getElementById("renderCanvas");
var ctx = canvas.getContext('2d');
var layers;
var scale = 1;
var translate = [0, 0];
var maxSpeed = 0;
var filamentDiameter;
var currentRender;
var maxCoord;
var minCoord;
var lastRenderTime;
var maxRenderDelay = 50;
var delayWithoutRender;


function addSpeedLables() {
    var table = document.getElementById("speedLable");
    table.innerHTML = "";
    for (var i = 10; i >= 0; i--) {
        var speed = Math.floor(maxSpeed * i / (10));
        var row = table.insertRow(-1);
        var cell = row.insertCell(-1);
        cell.setAttribute("style", "background-color:" + speedToColor(speed) + ";min-width:30px");
        cell = row.appendChild(document.createElement('th'));
        var span = document.createElement("span");
        span.innerHTML = speed + "mm/s";
        cell.appendChild(span);
    }
}

function initCanvas() {
    layers = undefined;
    resizeCanvas();
    maxSpeed = 100;
    lastRenderTime = 0;
    delayWithoutRender = 0;
    addSpeedLables();
}

function resizeCanvas() {
    var height = 640;
    var width = document.getElementById('renderCanvasContainer').offsetWidth - 36;
    canvas.width = width;
    canvas.height = height;
    $("#canvasVerticalSlider").height(height - 96);
    if (layers != undefined) {
        setTransform();
    }
}

function setTranslate(delta) {
    translate[0] += delta[0];
    translate[1] += delta[1];
    delayWithoutRender += maxRenderDelay;
    if (delayWithoutRender > lastRenderTime) {
        delayWithoutRender = 0;
        setRender(currentRender);
    } else {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        var cache = ctx.getImageData(0, 0, canvas.width, canvas.height);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.putImageData(cache, delta[0], delta[1]);
        ctx.setTransform(scale, 0, 0, scale, translate[0], translate[1]);
    }
}

function setTransform() {
    ctx.setTransform(scale, 0, 0, scale, translate[0], translate[1]);
    setRender(currentRender);
}

function scaleAboutPoint(x, y, oldScale) {
    var modelX = (x - translate[0]) / oldScale;
    var modelY = (y - translate[1]) / oldScale;
    translate = [x - modelX * scale, y - modelY * scale];
    ctx.setTransform(scale, 0, 0, scale, translate[0], translate[1]);
    setRender(currentRender);
}

function initRender(layerDict, filamentD) {
    filamentDiameter = filamentD;
    layers = layerDict.layers;
    if (layers.length == 0) {
        layers = undefined;
        $("#layerNumber").text("");
        return;
    }
    $("#canvasVerticalSlider").slider("option", "max", layers.length);
    maxCoord = layerDict.maxCoord;
    minCoord = layerDict.minCoord;
    maxSpeed = layerDict.maxSpeed;
    var xScale = canvas.width / (maxCoord[0] - minCoord[0]);
    var yScale = canvas.height / (maxCoord[1] - minCoord[1]);
    if (xScale < yScale) {
        scale = xScale;
    } else {
        scale = yScale;
    }
    translate = [canvas.width / 2 - (maxCoord[0] + minCoord[0]) / 2 * scale, canvas.height / 2 - (maxCoord[1] + minCoord[1]) / 2 * scale];
    currentRender = Math.floor(layers.length / 2) + 1;
    addSpeedLables();
    $("#canvasVerticalSlider").slider("option", "value", currentRender);
    resizeCanvas();
}

function render(layerNumber) {
    var startTime = new Date().getTime();
    currentRender = layerNumber;
    var layerIndex = layerNumber - 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    renderGrid();
    renderLayer(layerIndex);
    lastRenderTime = new Date().getTime() - startTime;
}

function setRender(layerNumber) {
    if (layers != undefined) {
        $("#layerNumber").text("(Layer " + layerNumber + ", Time " + layers[layerNumber - 1]["t"] + ")");
        setTimeout(function () { render(layerNumber); }, 0);
    }
}

function renderGrid() {
    var coordSize = 10;
    var minGrid = [(Math.floor(minCoord[0] / coordSize) - 1) * coordSize, (Math.floor(minCoord[1] / coordSize) - 1) * coordSize];
    var maxGrid = [(Math.ceil(maxCoord[0] / coordSize) + 1) * coordSize, (Math.ceil(maxCoord[1] / coordSize) + 1) * coordSize];
    ctx.beginPath();
    for (var i = minGrid[0]; i <= maxGrid[0]; i += coordSize) {
        ctx.moveTo(i, minGrid[1]);
        ctx.lineTo(i, maxGrid[1]);
    }
    for (var i = minGrid[1]; i <= maxGrid[1]; i += coordSize) {
        ctx.moveTo(minGrid[0], i);
        ctx.lineTo(maxGrid[0], i);
    }
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
}

function renderLayer(layerIndex) {
    var layerHeight;

    if (layerIndex == 0) {
        layerHeight = layers[layerIndex]["z"];
    } else {
        layerHeight = layers[layerIndex]["z"] - layers[layerIndex - 1]["z"];
        if (layerHeight < 0) {
            layerHeight = layers[layerIndex]["z"];
        }
    }
    if (layerHeight == 0) {
        layerHeight = 0.1;
    }
    var extrusion = layers[layerIndex]["e"];
    for (var j = 0; j < extrusion.length; j++) {
        var segments = extrusion[j];
        var startCoords = [];
        var endCoords = [];
        var extrusionWidths = [];
        var phaseDistances = [];
        var phaseSpeeds = [];
        var lengths = [];
        var angles = Array(segments.length - 1);
        for (var k = 0; k < segments.length - 1; k++) {
            angles[k] = Math.atan2(segments[k + 1][0][1] - segments[k][0][1], segments[k + 1][0][0] - segments[k][0][0]);
        }
        for (var k = 1; k < segments.length; k++) {
            var segment = segments[k];
            var startCoord = segments[k - 1][0];
            var endCoord = segment[0];
            var phaseDistance = segment[3];
            var phaseSpeed = segment[4];
            var length = Math.sqrt((endCoord[0] - startCoord[0]) * (endCoord[0] - startCoord[0]) + (endCoord[1] - startCoord[1]) * (endCoord[1] - startCoord[1]));
            var halfCircleCount = 0;
            if (k == 1) {
                halfCircleCount++;
            }
            if (k == segments.length - 1) {
                halfCircleCount++;
            }
            var extrusionWidth = calculateExtrusionWidth(startCoord, endCoord, segment[1], layerHeight, length, halfCircleCount);
            startCoords.push(startCoord);
            endCoords.push(endCoord);
            extrusionWidths.push(extrusionWidth);
            phaseDistances.push(phaseDistance);
            phaseSpeeds.push(phaseSpeed);
            lengths.push(length);
            drawCircle(startCoord, extrusionWidth, phaseSpeed[0], angles[k - 1] + Math.PI);
        }
        for (var k = 0; k < segments.length - 1; k++) {
            drawCircle(endCoords[k], extrusionWidths[k], phaseSpeeds[k][3], angles[k]);
        }
        for (var k = 0; k < segments.length - 1; k++) {
            drawExtrusion(startCoords[k], endCoords[k], phaseDistances[k], phaseSpeeds[k], extrusionWidths[k], lengths[k], angles[k]);
        }
    }
}

function drawExtrusion(fromCoord, toCoord, linePhaseDistance, linePhaseSpeed, extrusionWidth, length, angle) {
    var colorStopSpeeds = [];
    var colorStopLocations = [];
    var currentDistance = 0;
    for (var i = 0; i < 3; i++) {
        if (linePhaseDistance[i] > 0) {
            var startSpeed = linePhaseSpeed[i];
            var endSpeed = linePhaseSpeed[i + 1];
            if (currentDistance == 0) {
                colorStopLocations.push(0);
                colorStopSpeeds.push(startSpeed);
            }
            if (startSpeed < maxSpeed / 2 && endSpeed > maxSpeed / 2 || startSpeed > maxSpeed / 2 && endSpeed < maxSpeed / 2) {
                var ratio = Math.abs((startSpeed - maxSpeed / 2) / (startSpeed - endSpeed));
                colorStopLocations.push(currentDistance + linePhaseDistance[i] * ratio);
                colorStopSpeeds.push(maxSpeed / 2);
            }
            currentDistance += linePhaseDistance[i];
            colorStopLocations.push(currentDistance);
            colorStopSpeeds.push(endSpeed);
        }
    }
    drawLine(fromCoord, toCoord, extrusionWidth, colorStopLocations, colorStopSpeeds, angle);
}

function calculateExtrusionWidth(startCoord, endCoord, e, layerHeight, length, halfCircleCount) {
    var volume = Math.PI * (filamentDiameter / 2) * (filamentDiameter / 2) * e;
    var topSurfaceArea = volume / layerHeight;
    var width;
    if (halfCircleCount == 0) {
        width = topSurfaceArea / length;
    } else {
        var ratio = 0.2; // Math.PI / 8 in theory
        width = (-length + Math.sqrt(length * length + 4 * ratio * halfCircleCount * topSurfaceArea)) / (2 * ratio * halfCircleCount);
    }
    if (width < layerHeight) {
        width = Math.sqrt(width * layerHeight);
    }
    return width;
}

function drawCircle(coord, width, speed, angle) {
    ctx.beginPath();
    ctx.arc(coord[0], coord[1], width / 2, angle - Math.PI / 2 - 0.05, angle + Math.PI / 2 + 0.05, false);
    ctx.closePath();
    var grad = ctx.createRadialGradient(coord[0], coord[1], 0, coord[0], coord[1], width / 2);
    var color = speedToColor(speed);
    grad.addColorStop(0, color);
    grad.addColorStop(0.2, color);
    grad.addColorStop(1, '#000');
    ctx.fillStyle = grad;
    ctx.fill();
}

function drawLine(fromCoord, toCoord, width, colorStopLocations, colorStopSpeeds, angle) {
    x1 = fromCoord[0];
    y1 = fromCoord[1];
    x2 = toCoord[0];
    y2 = toCoord[1];

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    var grad = ctx.createLinearGradient(x1, y1, x2, y2);
    var length = colorStopLocations[colorStopLocations.length - 1];
    for (var i = 0; i < colorStopLocations.length; i++) {
        grad.addColorStop(colorStopLocations[i] / length, speedToColor(colorStopSpeeds[i]));
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.stroke();

    var length = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
    var x3 = (x1 + x2) / 2 - width / 2 * Math.sin(angle);
    var y3 = (y1 + y2) / 2 + width / 2 * Math.cos(angle);
    var x4 = (x1 + x2) / 2 + width / 2 * Math.sin(angle);
    var y4 = (y1 + y2) / 2 - width / 2 * Math.cos(angle);
    ctx.beginPath();
    ctx.moveTo(x3, y3);
    ctx.lineTo(x4, y4);
    var grad = ctx.createLinearGradient(x3, y3, x4, y4);
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.4, "rgba(0,0,0,0)");
    grad.addColorStop(0.6, "rgba(0,0,0,0)");
    grad.addColorStop(1, '#000');
    ctx.strokeStyle = grad;
    ctx.lineWidth = length;
    ctx.stroke();
}

function speedToColor(speed) {
    var red, green, blue;
    if (speed >= 0 && speed <= maxSpeed / 2) {
        // interpolate between (1.0f, 0.0f, 0.0f) and (0.0f, 1.0f, 0.0f)
        green = speed / (maxSpeed / 2);
        blue = 1 - green;
        red = 0;
    } else if (speed > maxSpeed / 2 && speed <= maxSpeed) {
        // interpolate between (0.0f, 1.0f, 0.0f) and (0.0f, 0.0f, 1.0f)
        blue = 0;
        red = (speed - maxSpeed / 2) / (maxSpeed / 2);
        green = 1 - red;
    }
    return "rgb(" + Math.floor(red * 255) + "," + Math.floor(green * 255) + "," + Math.floor(blue * 255) + ")";
}

var changeLayerDelta = 0;

// For Chrome
canvas.addEventListener('mousewheel', mouseWheelEvent);
document.getElementById("canvasVerticalSliderContainer").addEventListener('mousewheel', changeLayer);
// For Firefox
canvas.addEventListener('DOMMouseScroll', mouseWheelEvent);
document.getElementById("canvasVerticalSliderContainer").addEventListener('DOMMouseScroll', changeLayer);

function mouseWheelEvent(e) {
    var delta = e.wheelDelta ? e.wheelDelta : -e.detail * 40;
    var oldScale = scale;
    scale = scale * (1 + 1 * delta / 2000);
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    scaleAboutPoint(Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top), oldScale);
}

function changeLayer(e) {
    e.preventDefault();
    if (layers == undefined) {
        return;
    }
    var delta = e.wheelDelta ? e.wheelDelta : -e.detail * 40;
    if (delta * changeLayerDelta >= 0) {
        changeLayerDelta += delta;
    } else {
        changeLayerDelta = delta;
    }

    if (Math.abs(changeLayerDelta) >= 60) {
        var previousRender = currentRender;
        if (changeLayerDelta > 0 && currentRender < layers.length) {
            currentRender++;

        } else if (changeLayerDelta < 0 && currentRender > 1) {
            currentRender--;
        }
        if (previousRender != currentRender) {
            setRender(currentRender);
            $("#canvasVerticalSlider").slider("option", "value", currentRender);
        }
        changeLayerDelta = 0;
    }
}

/*
canvas.addEventListener('wheel', function (e) {
    var oldScale = scale;
    scale = scale * (1 - 1 * event.deltaY / 2000);
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    scaleAboutPoint(Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top), oldScale);
}, false);*/

var dragging = false;
var lastX;
var lastY;

canvas.addEventListener('mousedown', function (e) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    e.preventDefault();
}, false);

window.addEventListener('mousemove', function (e) {
    if (dragging) {
        var deltaX = e.clientX - lastX;
        var deltaY = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        if (lastRenderTime > maxRenderDelay) {
            setTranslate([deltaX, deltaY]);
        } else {
            translate[0] += deltaX;
            translate[1] += deltaY;
            setTransform();
        }
    }
}, false);

window.addEventListener('mouseup', function () {
    dragging = false;
    if (delayWithoutRender > 0) {
        delayWithoutRender = 0;
        setRender(currentRender);
    }
}, false);