var gcodeProcessor;

onmessage = function (e) {
    if (e.data == "getResultFormat") {
        gcodeProcessor = new GcodeProcessor();
        postMessage({ "resultFormat": gcodeProcessor.results });
    } else if (e.data == "cleanup") {
        gcodeProcessor = undefined;
    } else {
        gcodeProcessor = new GcodeProcessor();
        var settings;
        [gcodeLines, settings] = e.data;
        gcodeProcessor.processGcodes(gcodeLines, settings);
    }
}

function sameSign(num1, num2) {
    if ((num1 > 0 && num2 > 0) || (num1 < 0 && num2 < 0)) {
        return true;
    } else if ((num1 > 0 && num2 < 0) || (num1 < 0 && num2 > 0)) {
        return false;
    } else {
        return undefined;
    }
}

function scaleValues(scale, values) {
    var result = Array(4);
    for (var i = 0; i < 4; i++) {
        result[i] = values[i] * scale;
    }
    return result;
}

function arrayEqual(array1, array2) {
    for (var i = 0; i < 4; i++) {
        if (array1[i] != array2[i]) {
            return false;
        }
    }
    return true;
}

function updatedValueInNewArray(array, valueToUpdate) {
    var newArray;
    if (valueToUpdate != undefined) {
        newArray = Array(4);
        for (var i = 0; i < 4; i++) {
            if (valueToUpdate[i] != undefined) {
                newArray[i] = valueToUpdate[i];
            } else {
                newArray[i] = array[i];
            }
        }
    } else {
        newArray = array.slice()
    }
    return newArray;
}

function secondsToHMS(time) {
    var hrs = Math.floor(time / 3600);
    var mins = Math.floor((time % 3600) / 60);
    var secs = Math.floor(time % 60);

    var ret = "";

    if (hrs > 0) {
        ret += "" + hrs + ":" + (mins < 10 ? "0" : "");
    }

    ret += "" + mins + ":" + (secs < 10 ? "0" : "");
    ret += "" + secs;
    return ret;
}

Gcode = function () { }
Gcode.prototype.axisRatio = undefined;
Gcode.prototype.commandType = undefined;
Gcode.prototype.coord = undefined;
Gcode.prototype.endSpeed = undefined;
Gcode.prototype.feedrate = undefined;
Gcode.prototype.isMovement = undefined;
Gcode.prototype.indexForAccelerationCalculation = undefined;
Gcode.prototype.limitedByMaxSpeed = undefined;
Gcode.prototype.maxAcceleration = undefined;
Gcode.prototype.maxJerk = undefined;
Gcode.prototype.movementGcodeIndex = undefined;
Gcode.prototype.nextMovementGcode = undefined;
Gcode.prototype.parameters = undefined;
Gcode.prototype.phaseDistance = undefined;
Gcode.prototype.phaseSpeed = undefined;
Gcode.prototype.phaseTime = undefined;
Gcode.prototype.previousMovementGcode = undefined;
Gcode.prototype.printMove = undefined;
Gcode.prototype.reachedFeedrateScale = undefined;
Gcode.prototype.relativeCoord = undefined;
Gcode.prototype.startSpeed = undefined;
Gcode.prototype.targetAccelerationPerAxis = undefined;
Gcode.prototype.targetFeedratePerAxis = undefined;

Gcode.prototype.loadGcode = function (gcodeLine) {
    var command = gcodeLine.split(";")[0].trim().toUpperCase();
    if (command.length != 0) {
        this.parameters = {};
        var tokens = command.split(" ");
        this.commandType = tokens[0];
        for (var i = 1; i < tokens.length; i++) {
            var value = parseFloat(tokens[i].substring(1));
            if (!isNaN(value)) {
                this.parameters[tokens[i].charAt(0)] = value;
            }
        }
        if (this.parameters.X != undefined || this.parameters.Y != undefined || this.parameters.Z != undefined || this.parameters.E != undefined) {
            this.coord = [this.parameters.X, this.parameters.Y, this.parameters.Z, this.parameters.E];
        }
    }
}

Gcode.prototype.calculateAxisRatio = function () {
    this.axisRatio = Array(4);
    var sum = 0;
    for (var i = 0; i < 4; i++) {
        sum += this.relativeCoord[i] * this.relativeCoord[i];
    }
    var base = Math.sqrt(sum);
    for (var i = 0; i < 4; i++) {
        this.axisRatio[i] = this.relativeCoord[i] / base;
    }
}

Gcode.prototype.calculateSpeed = function (maxSpeed) {
    this.targetFeedratePerAxis = Array(4);
    this.limitedByMaxSpeed = Array(4);
    var feedrateFactor = 1;
    for (var i = 0; i < 4; i++) {
        this.targetFeedratePerAxis[i] = this.feedrate * this.axisRatio[i];
        if (maxSpeed[i] < Math.abs(this.targetFeedratePerAxis[i])) {
            var newFeedrateFactor = maxSpeed[i] / Math.abs(this.targetFeedratePerAxis[i]);
            this.limitedByMaxSpeed[i] = newFeedrateFactor;
            if (newFeedrateFactor < feedrateFactor) {
                feedrateFactor = newFeedrateFactor;
            }
        } else {
            this.limitedByMaxSpeed[i] = 1;
        }
    }
    if (feedrateFactor != 1) {
        for (var i = 0; i < 4; i++) {
            this.targetFeedratePerAxis[i] *= feedrateFactor;
        }
    }
}

Gcode.prototype.calculateAcceleration = function (maxAcceleration) {
    this.targetAccelerationPerAxis = Array(4);
    var limitedByMaxAccelertaion = Array(4);
    var accelerationFactor = Infinity;
    for (var i = 0; i < 4; i++) {
        var newAccelerationFactor = maxAcceleration[i] / Math.abs(this.axisRatio[i]);
        limitedByMaxAccelertaion[i] = newAccelerationFactor;
        if (newAccelerationFactor < accelerationFactor) {
            accelerationFactor = newAccelerationFactor;
        }
    }
    for (var i = 0; i < 4; i++) {
        this.targetAccelerationPerAxis[i] = accelerationFactor * Math.abs(this.axisRatio[i]);
    }
}

Gcode.prototype.calculateTimeByAcceleration = function () {
    if (this.indexForAccelerationCalculation == undefined) {
        for (var i = 0; i < 4; i++) {
            if (this.targetAccelerationPerAxis[i] != 0) {
                this.indexForAccelerationCalculation = i;
                break;
            }
        }
    }
    var index = this.indexForAccelerationCalculation;
    var a = a = this.targetAccelerationPerAxis[index];
    var v0 = Math.abs(this.startSpeed[index]);
    var v1 = Math.abs(this.targetFeedratePerAxis[index]);
    var v2 = Math.abs(this.endSpeed[index]);
    var s = Math.abs(this.relativeCoord[index]);
    var s0 = 0;
    var s1 = 0;
    var s2 = 0;
    var t0 = 0;
    var t1 = 0;
    var t2 = 0;
    var newStartSpeed = undefined;
    var newEndSpeed = undefined;

    // Acceleration phase
    if (v1 != v0) {
        t0 = (v1 - v0) / a;
        s0 = v0 * t0 + 0.5 * a * t0 * t0;
    } else {
        t0 = 0;
        s0 = 0;
    }

    // Deceleration phase
    if (v2 != v1) {
        t2 = (v2 - v1) / (-a);
        s2 = v1 * t2 + 0.5 * (-a) * t2 * t2;
    } else {
        t2 = 0;
        s2 = 0;
    }

    if (s0 + s2 <= s) { // topSpeed reached
        // Constatnt speed phase
        s1 = s - s0 - s2
        t1 = s1 / v1;
        this.reachedFeedrateScale = 1;
    } else {
        var state = 0; // State 0: Accelerate and Decelerate, State 1: Accelerate, State 2: Decelerate
        t1 = 0;
        s1 = 0;
        if (v0 <= v2) {
            // Accelerate
            var t0a = (v2 - v0) / a;
            var s0a = v0 * t0a + 0.5 * a * t0a * t0a;
            if (s0a > s) {
                state = 1;
            }
        } else {
            // Decelerate
            // Test deceleration from startSpeed to endSpeed
            var t2a = (v2 - v0) / (-a);
            var s2a = v0 * t2a + 0.5 * (-a) * t2a * t2a;
            if (s2a > s) {
                state = 2;
            }
        }
        if (state == 0) {
            // topSpeed not reached, enough distance to accelerate and decelerate
            v1a = Math.sqrt((v0 * v0 + v2 * v2) / 2 + a * s);
            t0 = (v1a - v0) / a;
            t2 = (v1a - v2) / a;
            s0 = v0 * t0 + 0.5 * a * t0 * t0;
            s2 = v2 * t2 + 0.5 * a * t2 * t2;
            this.reachedFeedrateScale = v1a / v1;
            v1 = v1a;
        } else if (state == 1) {
            // topSpeed not reached, not enough distance to accelerate, need new endSpeed
            v1a = Math.sqrt(2 * a * s + v0 * v0);
            t0 = (v1a - v0) / a;
            s0 = s;
            this.reachedFeedrateScale = v1a / v1;
            newEndSpeed = scaleValues(this.reachedFeedrateScale, this.targetFeedratePerAxis);
            s2 = 0;
            v1 = v1a;
            v2 = v1a;
            t2 = 0;
        } else {
            // topSpeed not reached, not enough distance to decelerate, need new startSpeed
            t0 = 0;
            v0a = Math.sqrt(2 * a * s + v2 * v2);
            t2 = (v2 - v0a) / (-a);
            this.reachedFeedrateScale = v0a / v1;
            newStartSpeed = scaleValues(this.reachedFeedrateScale, this.targetFeedratePerAxis);
            s0 = 0;
            s2 = s;
            v0 = v0a;
            v1 = v0a;
        }
    }
    this.phaseTime = [t0, t1, t2];
    var ratio = Math.abs(this.axisRatio[index]);
    this.phaseSpeed = [v0 / ratio, v1 / ratio, v2 / ratio];
    this.phaseDistance = [s0 / ratio, s1 / ratio, s2 / ratio];
    if (newStartSpeed != undefined) {
        this.startSpeed = newStartSpeed;
        this.previousMovementGcode.calculateSpeedByJerk();
    }
    if (newEndSpeed != undefined) {
        this.endSpeed = newEndSpeed;
        this.calculateSpeedByJerk();
    }
}

Gcode.prototype.calculateSpeedByJerk = function () {
    var endSpeed;
    var startSpeed;
    var oldEndSpeed;
    var oldStartSpeed;
    var fromSpeed = undefined;
    var toSpeed = undefined;

    if (this.endSpeed != undefined) {
        fromSpeed = this.endSpeed;
    } else {
        fromSpeed = this.targetFeedratePerAxis;
    }
    if (this.nextMovementGcode.startSpeed != undefined) {
        toSpeed = this.nextMovementGcode.startSpeed;
    } else {
        toSpeed = this.nextMovementGcode.targetFeedratePerAxis;
    }

    endSpeed = fromSpeed.slice();
    startSpeed = toSpeed.slice();
    oldEndSpeed = fromSpeed.slice();
    oldStartSpeed = toSpeed.slice();

    var ready = false;
    while (!ready) {
        for (var i = 0; i < 4; i++) {
            if (Math.abs(endSpeed[i] - startSpeed[i]) > this.nextMovementGcode.maxJerk[i]) {
                switch (sameSign(endSpeed[i], startSpeed[i])) {
                    case undefined:
                    case true:
                        if (Math.abs(endSpeed[i]) > Math.abs(startSpeed[i])) {
                            var ratio = (Math.abs(startSpeed[i]) + this.nextMovementGcode.maxJerk[i]) / Math.abs(endSpeed[i]);
                            endSpeed = scaleValues(ratio, endSpeed);
                        } else {
                            var ratio = (Math.abs(endSpeed[i]) + this.nextMovementGcode.maxJerk[i]) / Math.abs(startSpeed[i]);
                            startSpeed = scaleValues(ratio, startSpeed);
                        }
                        break;
                    case false:
                        if (this.nextMovementGcode.maxJerk[i] == 0) {
                            startSpeed = [0, 0, 0, 0];
                            endSpeed = [0, 0, 0, 0];
                            oldStartSpeed = startSpeed;
                            oldEndSpeed = endSpeed;
                        } else {
                            var ratio = this.nextMovementGcode.maxJerk[i] / Math.abs(endSpeed[i] - startSpeed[i]);
                            endSpeed = scaleValues(ratio, endSpeed);
                            startSpeed = scaleValues(ratio, startSpeed);
                        }
                    default:
                        break;
                }
            }
        }
        // Make sure jerk is not applied to at least one axis
        var startSpeedRatio = -1;
        var endSpeedRatio = -1;
        for (var i = 0; i < 4; i++) {
            switch (sameSign(endSpeed[i], startSpeed[i])) {
                case true:
                    if (endSpeed[i] == startSpeed[i]) {
                        startSpeedRatio = 1;
                        endSpeedRatio = 1;
                    } else if (Math.abs(endSpeed[i]) > Math.abs(startSpeed[i])) {
                        var newRatio = startSpeed[i] / endSpeed[i];
                        if (newRatio > endSpeedRatio) {
                            endSpeedRatio = newRatio;
                        }
                    } else {
                        var newRatio = endSpeed[i] / startSpeed[i];
                        if (newRatio > startSpeedRatio) {
                            startSpeedRatio = newRatio;
                        }
                    }
                    break;
                case false:
                    if (endSpeedRatio < 0) {
                        endSpeedRatio = 0;
                    }
                    if (startSpeedRatio < 0) {
                        startSpeedRatio = 0;
                    }
                    break;
            }
        }
        if (startSpeedRatio > 0 || endSpeedRatio > 0) {
            if (startSpeedRatio > endSpeedRatio) {
                if (startSpeedRatio < 0.999) {
                    startSpeed = scaleValues(startSpeedRatio, startSpeed);
                }
            } else {
                if (endSpeedRatio < 0.999) {
                    endSpeed = scaleValues(endSpeedRatio, endSpeed);
                }
            }
        } else if (startSpeedRatio == 0 && endSpeedRatio == 0) {
            startSpeed = [0, 0, 0, 0];
            endSpeed = [0, 0, 0, 0];
            break;
        }
        ready = true;
        for (var i = 0; i < 4; i++) {
            if (oldEndSpeed[i] != 0 && endSpeed[i] != 0) {
                var ratio = oldEndSpeed[i] / endSpeed[i];
                if ((ratio > 1.01 || ratio < 0.99) && oldEndSpeed[i] - endSpeed[i] > 0.0001) {
                    ready = false;
                }
            }
            if (oldStartSpeed[i] != 0 && startSpeed[i] != 0) {
                var ratio = oldStartSpeed[i] / startSpeed[i];
                if ((ratio > 1.01 || ratio < 0.99) && oldStartSpeed[i] - startSpeed[i] > 0.0001) {
                    ready = false;
                }
            }
        }
        oldEndSpeed = endSpeed.slice();
        oldStartSpeed = startSpeed.slice();
    }

    if (this.endSpeed == undefined) {
        this.endSpeed = endSpeed;
    } else if (!arrayEqual(this.endSpeed, endSpeed)) {
        this.endSpeed = endSpeed;
        this.calculateTimeByAcceleration();
    }

    if (this.nextMovementGcode.startSpeed == undefined) {
        this.nextMovementGcode.startSpeed = startSpeed;
    } else if (!arrayEqual(this.nextMovementGcode.startSpeed, startSpeed)) {
        this.nextMovementGcode.startSpeed = startSpeed;
        if (this.nextMovementGcode.endSpeed != undefined) {
            this.nextMovementGcode.calculateTimeByAcceleration();
        }
    }
}

function GcodeProcessor() {
    this.results = {
        "Category0": { "discription": "Time", "table": "gcodeStats" },
        "printTime": { "discription": "Print Time", "table": "gcodeStats" },
        "accelerationTime": { "discription": "Time Spent Accelerating/Decelerating", "table": "gcodeStats" },
        "constantSpeedTime": { "discription": "Time Spent at Target Speed", "table": "gcodeStats" },
        "zHopTime": { "discription": "Total Z Hop Time", "table": "gcodeStats" },
        "retractTime": { "discription": "Total Retract/Prime Time", "table": "gcodeStats" },
        "Category1": { "discription": "Distance", "table": "gcodeStats" },
        "totalDistance": { "discription": "Total Distance Moved", "table": "gcodeStats" },
        "printDistance": { "discription": "Print / Travel Move Distance", "table": "gcodeStats" },
        "accelerationDistance": { "discription": "Distance Accelerating/Decelerating", "table": "gcodeStats" },
        "constantSpeedDistance": { "discription": "Distance at Target Speed", "table": "gcodeStats" },
        "filamentUsage": { "discription": "Raw Filament Usage", "table": "gcodeStats" },
        "filamentLineRatio": { "discription": "Printed Line Length per mm of Raw Filament", "table": "gcodeStats" },
        "Category2": { "discription": "Speed", "table": "gcodeStats" },
        "averageSpeed": { "discription": "Average Speed", "table": "gcodeStats" },
        "printSpeed": { "discription": "Average Print Speed", "table": "gcodeStats" },
        "travelSpeed": { "discription": "Average Travel Speed", "table": "gcodeStats" },
        "filamentUsageRate": { "discription": "Raw Filament Usage Rate", "table": "gcodeStats" },
        "xyFeedrate": { "discription": "Min / Max XY Feedrate", "table": "gcodeStats" },
        "Category3": { "discription": "Count", "table": "gcodeStats" },
        "numberOfLines": { "discription": "Number of Lines", "table": "gcodeStats" },
        "moveCommandCount": { "discription": "Total Move Commands (G0 & G1)", "table": "gcodeStats" },
        "reachTargetSpeedCount": { "discription": "Move Commands Reached Target Speed", "table": "gcodeStats" },
        "moveType": { "discription": "Print Move / Travel Move", "table": "gcodeStats" },
        "zHopCount": { "discription": "Z Hop Count", "table": "gcodeStats" },
        "retractCount": { "discription": "Retraction Count", "table": "gcodeStats" },
        "limitedMaxSpeedPerAxis": { "discription": "Times Move Speed Limited By Axis Max Speed", "table": "gcodeStatsPerAxis", "fieldId": ["limitedMaxSpeedX", "limitedMaxSpeedY", "limitedMaxSpeedZ", "limitedMaxSpeedE"] },
        "totalDistancePerAxis": { "discription": "Total Distance Moved", "table": "gcodeStatsPerAxis", "fieldId": ["totalDistanceX", "totalDistanceY", "totalDistanceZ", "totalDistanceE"] },
        "averageSpeedPerAxis": { "discription": "Average Speed", "table": "gcodeStatsPerAxis", "fieldId": ["averageSpeedX", "averageSpeedY", "averageSpeedZ", "averageSpeedE"] }
    }

    this.processGcodes = function (gcodeLines, settings) {
        // Initialize
        this.settings = settings;
        var gcodeIndex = 0;
        this.absoluteExtrusion = this.settings.absoluteExtrusion;
        var gcodeQueueSize = 100;
        this.gcodes = [];
        this.retractedLength = 0;
        this.currentCoord = [0, 0, 0, 0];
        this.currentFeedrate = (settings.maxSpeed[0] + settings.maxSpeed[1]) / 2; // Set initial feedrate to avoid problem caused by movement before setting feedrate
        this.currentSpeedFactor = 1;
        this.currentExtrudeFactor = 1;
        this.currentPrintAcceleration = settings.maxPrintAcceleration;
        this.currentTravelAcceleration = settings.maxTravelAcceleration;
        this.movementGcodeCount = 0;
        this.firmwareRetractLength = settings.firmwareRetractLength;
        this.firmwareUnretractLength = settings.firmwareUnretractLength;
        this.firmwareRetractSpeed = settings.firmwareRetractSpeed * 60;
        this.firmwareUnretractSpeed = settings.firmwareUnretractSpeed * 60;
        this.firmwareRetractZhop = settings.firmwareRetractZhop;
        this.zBeforeFirmwareRetractZhop = 0;
        var headGcode = new Gcode();
        var tailGcode = new Gcode();
        headGcode.endSpeed = [0, 0, 0, 0];
        this.lastMovementGcode = headGcode;
        tailGcode.endOfMovementGcode = true;
        tailGcode.startSpeed = [0, 0, 0, 0];
        tailGcode.maxJerk = settings.maxJerk;
        headGcode.nextMovementGcode = tailGcode;
        headGcode.movementGcodeIndex = 0;
        var calculationGcode = headGcode;
        var gcode = headGcode;

        // Calculate Result
        var result = {};
        var totalAccelerationTime = 0;
        var totalConstantSpeedTime = 0;
        var totalDeccelerationTime = 0;
        var totalAccelerationDistance = 0;
        var totalConstantSpeedDistance = 0;
        var totalDeccelerationDistance = 0;
        var reachTargetSpeedCount = 0;
        var printMove = 0;
        var travelMove = 0;
        var limitedMaxSpeedScale = undefined;
        var limitedMaxSpeedIndex = undefined;
        var limitedMaxSpeed = [0, 0, 0, 0];
        var printDistance = 0;
        var travelDistance = 0;
        var totalDistance = 0;
        var retractCount = 0;
        var retractTime = 0;
        var totalDistancePerAxis = [0, 0, 0, 0];
        var zHopCount = 0;
        var zHopTime = 0;
        var filamentUsageTemp = 0;
        var filamentUsage = 0;
        var xyFeedrateMax = 0;
        var xyFeedrateMin = Infinity;
        var totalPrintTime = 0;
        var totalTravelTime = 0;

        // Export Layers
        var layers = [];
        var layer = {};
        layer["e"] = [];
        var extrusions = [];
        var segments = [];
        var lastLayerZ = undefined;
        var layerPrinterOrder = 0;
        var layerTime = 0;
        var maxPrintingSpeed = 0;
        var layerMaxs = [[], []];
        var layerMins = [[], []];
        var layerMax = [-Infinity, -Infinity];
        var layerMin = [Infinity, Infinity];

        // Speed Time Histogram
        this.STHistogram = [];

        // Calculate information required for calculating time
        while (true) {
            var loadingGcode;
            if (gcodeIndex < gcodeLines.length) {
                var loadingGcode = new Gcode();
                loadingGcode.loadGcode(gcodeLines[gcodeIndex]);
                this.processGcode(loadingGcode);
                if (loadingGcode.isMovement) {
                    this.gcodes.push(loadingGcode);
                }
                gcodeIndex++;
            } else if (gcodeIndex == gcodeLines.length) {
                this.headMovementGcode = headGcode.nextMovementGcode;
                this.lastMovementGcode.nextMovementGcode = tailGcode;
                gcodeIndex++;
            }

            if ((this.lastMovementGcode.movementGcodeIndex - calculationGcode.movementGcodeIndex > 1 || gcodeIndex > gcodeLines.length) && !("endOfMovementGcode" in calculationGcode)) {
                if (calculationGcode.movementGcodeIndex == 0) {
                    headGcode.calculateSpeedByJerk();
                    calculationGcode = headGcode.nextMovementGcode;
                    if ("endOfMovementGcode" in calculationGcode) {
                        break;
                    }
                }
                calculationGcode.calculateSpeedByJerk();
                calculationGcode.calculateTimeByAcceleration();
                calculationGcode = calculationGcode.nextMovementGcode;

            }

            if (this.gcodes.length > gcodeQueueSize || "endOfMovementGcode" in calculationGcode) {
                if (this.gcodes.length == 0) {
                    break;
                }
                gcode = this.gcodes.shift();
                // Export Layers
                if (gcode.printMove) {
                    if (gcode.startCoord[2] != lastLayerZ) {
                        // New Layer
                        if (layer["e"].length > 0) {
                            layer["o"] = layerPrinterOrder;
                            layerPrinterOrder++;
                            layer["z"] = lastLayerZ;
                            layer["t"] = secondsToHMS(layerTime);
                            layerTime = 0;
                            layers.push(layer);
                            for (var i = 0; i < 2; i++) {
                                layerMaxs[i].push(layerMax[i]);
                                layerMins[i].push(layerMin[i]);
                            }
                            layerMax = [-Infinity, -Infinity];
                            layerMin = [Infinity, Infinity];
                            layer = {};
                            layer["e"] = [];
                        }
                        lastLayerZ = gcode.startCoord[2];
                    }

                    if (extrusions.length == 0) {
                        extrusions.push([gcode.startCoord.slice(0, 2)]);
                        for (var i = 0; i < 2; i++) {
                            if (gcode.startCoord[i] > layerMax[i]) {
                                layerMax[i] = gcode.startCoord[i];
                            }
                            if (gcode.startCoord[i] < layerMin[i]) {
                                layerMin[i] = gcode.startCoord[i];
                            }
                        }
                    }

                    extrusionsLength = gcode.relativeCoord[3]
                    if (this.retractedLength > 0) {
                        extrusionsLength -= this.retractedLength;
                        this.retractedLength -= extrusionsLength;
                        if (this.retractedLength < 0) {
                            this.retractedLength = 0
                        }
                    }

                    if (extrusionsLength > 0) {
                        extrusions.push([gcode.endCoord.slice(0, 2), extrusionsLength, gcode.feedrate, gcode.phaseDistance, [gcode.phaseSpeed[0], gcode.phaseSpeed[1], gcode.phaseSpeed[1], gcode.phaseSpeed[2]]]);

                        if (gcode.phaseSpeed[1] > maxPrintingSpeed) {
                            maxPrintingSpeed = gcode.phaseSpeed[1];
                        }
                        for (var i = 0; i < 2; i++) {
                            if (gcode.endCoord[i] > layerMax[i]) {
                                layerMax[i] = gcode.endCoord[i];
                            }
                            if (gcode.endCoord[i] < layerMin[i]) {
                                layerMin[i] = gcode.endCoord[i];
                            }
                        }
                    } else {
                        if (extrusions.length > 0) {
                            // New Line
                            layer["e"].push(extrusions);
                            extrusions = [];
                        }
                    }
                } else {
                    if (extrusions.length > 0) {
                        // New Line
                        layer["e"].push(extrusions);
                        extrusions = [];
                    }
                    if (gcode.isMovement) {
                        if (gcode.relativeCoord[3] < 0) {
                            this.retractedLength += gcode.relativeCoord[3]
                        } else {
                            this.retractedLength -= gcode.relativeCoord[3]
                            if (this.retractedLength < 0) {
                                this.retractedLength = 0
                            }
                        }
                    }
                }
                layerTime += gcode.phaseTime[0];
                layerTime += gcode.phaseTime[1];
                layerTime += gcode.phaseTime[2];

                // Calculate Result
                var moveDistance = Math.sqrt(gcode.relativeCoord[0] * gcode.relativeCoord[0] + gcode.relativeCoord[1] * gcode.relativeCoord[1] + gcode.relativeCoord[2] * gcode.relativeCoord[2]);
                gcode.phaseTime[0] *= this.settings.timeScale;
                gcode.phaseTime[1] *= this.settings.timeScale;
                gcode.phaseTime[2] *= this.settings.timeScale;

                if (gcode.relativeCoord[0] != 0 || gcode.relativeCoord[1] != 0) {
                    if (xyFeedrateMax < gcode.feedrate) {
                        xyFeedrateMax = gcode.feedrate;
                    }
                    if (xyFeedrateMin > gcode.feedrate) {
                        xyFeedrateMin = gcode.feedrate;
                    }
                }
                totalAccelerationTime += gcode.phaseTime[0];
                totalConstantSpeedTime += gcode.phaseTime[1];
                totalDeccelerationTime += gcode.phaseTime[2];
                if (gcode.reachedFeedrateScale == 1) {
                    reachTargetSpeedCount++;
                }
                limitedMaxSpeedScale = 1;
                limitedMaxSpeedIndex = -1;
                filamentUsageTemp += gcode.relativeCoord[3];
                if (filamentUsageTemp > filamentUsage) {
                    filamentUsage = filamentUsageTemp;
                }
                if (gcode.relativeCoord[0] == 0 && gcode.relativeCoord[1] == 0 && gcode.relativeCoord[2] < 0) {
                    zHopCount++;
                    zHopTime += (gcode.phaseTime[0] + gcode.phaseTime[1] + gcode.phaseTime[2]) * 2;
                }
                if (gcode.relativeCoord[0] == 0 && gcode.relativeCoord[1] == 0 && gcode.relativeCoord[3] > 0 || gcode.relativeCoord[3] < 0) {
                    retractCount += 0.5;
                    retractTime += gcode.phaseTime[0] + gcode.phaseTime[1] + gcode.phaseTime[2];
                }
                for (var i = 0; i < 4; i++) {
                    if (gcode.limitedByMaxSpeed[i] < limitedMaxSpeedScale) {
                        limitedMaxSpeedScale = gcode.limitedByMaxSpeed[i];
                        limitedMaxSpeedIndex = i;
                    }
                    totalDistancePerAxis[i] += Math.abs(gcode.relativeCoord[i]);
                }
                var moveDistance = Math.sqrt(gcode.relativeCoord[0] * gcode.relativeCoord[0] + gcode.relativeCoord[1] * gcode.relativeCoord[1] + gcode.relativeCoord[2] * gcode.relativeCoord[2]);
                totalDistance += moveDistance;
                if (gcode.printMove) {
                    printMove++;
                    printDistance += moveDistance;
                    totalPrintTime += gcode.phaseTime[0] + gcode.phaseTime[1] + gcode.phaseTime[2];
                } else if (gcode.relativeCoord[0] != 0 || gcode.relativeCoord[1] != 0 || gcode.relativeCoord[2] != 0) {
                    travelMove++;
                    travelDistance += moveDistance;
                    totalTravelTime += gcode.phaseTime[0] + gcode.phaseTime[1] + gcode.phaseTime[2];
                }
                if (limitedMaxSpeedIndex != -1) {
                    limitedMaxSpeed[limitedMaxSpeedIndex]++;
                }
                if (gcode.relativeCoord[0] != 0 || gcode.relativeCoord[1] != 0 || gcode.relativeCoord[2] != 0) {
                    totalAccelerationDistance += gcode.phaseDistance[0];
                    totalConstantSpeedDistance += gcode.phaseDistance[1];
                    totalDeccelerationDistance += gcode.phaseDistance[2];
                    // Speed Time Histogram
                    this.calculateSTHistogram(gcode);
                }

                // Clear Gcode
                gcode.nextMovementGcode.previousMovementGcode = undefined;
                gcode.nextMovementGcode = undefined;
            }

            // update progress bar
            var percent = Math.floor(gcodeIndex * 100 / gcodeLines.length);
            if (percent != Math.floor((gcodeIndex - 1) * 100 / gcodeLines.length)) {
                postMessage({ "progress": percent });
            }
        }

        // Calculate Result
        var totalTime = totalAccelerationTime + totalConstantSpeedTime + totalDeccelerationTime;
        result["numberOfLines"] = gcodeLines.length;
        result["printTime"] = secondsToHMS(totalTime);
        result["accelerationTime"] = secondsToHMS(totalAccelerationTime + totalDeccelerationTime) + " (" + ((totalAccelerationTime + totalDeccelerationTime) * 100 / totalTime).toFixed(1) + "%)";
        result["constantSpeedTime"] = secondsToHMS(totalConstantSpeedTime) + " (" + (totalConstantSpeedTime * 100 / totalTime).toFixed(1) + "%)";
        result["moveCommandCount"] = this.movementGcodeCount;
        result["reachTargetSpeedCount"] = reachTargetSpeedCount + " (" + (reachTargetSpeedCount * 100 / this.movementGcodeCount).toFixed(1) + "%)";
        result["moveType"] = printMove + " (" + (printMove * 100 / this.movementGcodeCount).toFixed(1) + "%) / " + travelMove + " (" + (travelMove * 100 / this.movementGcodeCount).toFixed(1) + "%)";
        result["limitedMaxSpeedX"] = limitedMaxSpeed[0];
        result["limitedMaxSpeedY"] = limitedMaxSpeed[1];
        result["limitedMaxSpeedZ"] = limitedMaxSpeed[2];
        result["limitedMaxSpeedE"] = limitedMaxSpeed[3];
        result["totalDistance"] = (totalDistance / 1000).toFixed(2) + " m";
        result["totalDistanceX"] = (totalDistancePerAxis[0] / 1000).toFixed(2) + " m";
        result["totalDistanceY"] = (totalDistancePerAxis[1] / 1000).toFixed(2) + " m";
        result["totalDistanceZ"] = (totalDistancePerAxis[2] / 1000).toFixed(2) + " m";
        result["totalDistanceE"] = (totalDistancePerAxis[3] / 1000).toFixed(2) + " m";
        result["accelerationDistance"] = ((totalAccelerationDistance + totalDeccelerationDistance) / 1000).toFixed(2) + " m (" + ((totalAccelerationDistance + totalDeccelerationDistance) * 100 / totalDistance).toFixed(1) + "%)";
        result["constantSpeedDistance"] = (totalConstantSpeedDistance / 1000).toFixed(2) + " m (" + (totalConstantSpeedDistance * 100 / totalDistance).toFixed(1) + "%)";
        result["printDistance"] = (printDistance / 1000).toFixed(2) + " m (" + (printDistance * 100 / totalDistance).toFixed(1) + "%) / " + (travelDistance / 1000).toFixed(2) + " m (" + (travelDistance * 100 / totalDistance).toFixed(1) + "%)";
        result["averageSpeed"] = (totalDistance / totalTime).toFixed(1) + " mm/s";
        result["averageSpeedX"] = (totalDistancePerAxis[0] / totalTime).toFixed(1) + " mm/s";
        result["averageSpeedY"] = (totalDistancePerAxis[1] / totalTime).toFixed(1) + " mm/s";
        result["averageSpeedZ"] = (totalDistancePerAxis[2] / totalTime).toFixed(1) + " mm/s";
        result["averageSpeedE"] = (totalDistancePerAxis[3] / totalTime).toFixed(1) + " mm/s";
        result["zHopCount"] = zHopCount;
        result["zHopTime"] = secondsToHMS(zHopTime);
        result["retractCount"] = Math.floor(retractCount);
        result["retractTime"] = secondsToHMS(retractTime);
        result["filamentUsage"] = (filamentUsage / 1000).toFixed(2) + " m";
        result["xyFeedrate"] = (xyFeedrateMin * 60).toFixed(0) + " (" + xyFeedrateMin.toFixed(2) + "mm/s) / " + (xyFeedrateMax * 60).toFixed(0) + " (" + xyFeedrateMax.toFixed(2) + "mm/s)";
        result["filamentUsageRate"] = (filamentUsage / totalTime).toFixed(2) + " mm/s, " + (filamentUsage / 10 / totalTime * 60).toFixed(2) + " cm/min";
        result["filamentLineRatio"] = (printDistance / filamentUsage).toFixed(2) + " mm";
        result["printSpeed"] = (printDistance / totalPrintTime).toFixed(1) + " mm/s";
        result["travelSpeed"] = (travelDistance / totalTravelTime).toFixed(1) + " mm/s";
        postMessage({ "result": result });
        postMessage({ "histogram": this.STHistogram });

        // Export Layers
        if (extrusions.length > 0) {
            // New Line
            layer["e"].push(extrusions);
        }
        if (layer["e"].length > 0) {
            layer["o"] = layerPrinterOrder;
            layer["z"] = lastLayerZ;
            layer["t"] = secondsToHMS(layerTime);
            layers.push(layer);
            for (var i = 0; i < 2; i++) {
                layerMaxs[i].push(layerMax[i]);
                layerMins[i].push(layerMin[i]);
            }
        }

        layerMaxs[0].sort(function (a, b) {
            return b - a;
        });
        layerMaxs[1].sort(function (a, b) {
            return b - a;
        });
        layerMins[0].sort(function (a, b) {
            return a - b;
        });
        layerMins[1].sort(function (a, b) {
            return a - b;
        });
        var indexForMax = 1; // remove outlier
        if (layerMaxs[0].length == 1) {
            indexForMax = 0;
        }

        var maxCoord = [layerMaxs[0][indexForMax], layerMaxs[1][indexForMax]];
        var minCoord = [layerMins[0][indexForMax], layerMins[1][indexForMax]];
        postMessage({ "complete": true });
        postMessage({ "layers": { "layers": layers, "maxSpeed": maxPrintingSpeed, "maxCoord": maxCoord, "minCoord": minCoord } });
        layers = undefined;
        layerMaxs = undefined;
        layerMins = undefined;
    }

    this.calculateSTHistogram = function (gcode) {
        var phaseSpeed = [gcode.phaseSpeed[0], gcode.phaseSpeed[1], gcode.phaseSpeed[1], gcode.phaseSpeed[2]];
        for (var i = 0; i < 3; i++) {
            var phaseTime = gcode.phaseTime[i];
            if (phaseTime > 0) {
                var startSpeed = phaseSpeed[i];
                var endSpeed = phaseSpeed[i + 1];
                var startIndex = Math.floor(startSpeed);
                var endIndex = Math.floor(endSpeed);
                if (startIndex == endIndex) {
                    if (this.STHistogram.length < startIndex + 1) {
                        for (var k = this.STHistogram.length; k < startIndex + 1; k++) {
                            this.STHistogram.push([k, 0, 0]);
                        }
                    }
                    if (gcode.printMove) {
                        this.STHistogram[startIndex][1] += phaseTime;
                    } else {
                        this.STHistogram[startIndex][2] += phaseTime;
                    }
                } else {
                    for (var j = startIndex; j <= endIndex; j++) {
                        if (this.STHistogram.length < j + 1) {
                            for (var k = this.STHistogram.length; k < j + 1; k++) {
                                this.STHistogram.push([k, 0, 0]);
                            }
                        }
                        var s0;
                        var s1;
                        if (j == 0) {
                            s0 = startSpeed;
                        } else {
                            s0 = j;
                        }
                        if (j == endIndex) {
                            s1 = endSpeed;
                        } else {
                            s1 = j + 1;
                        }
                        if (gcode.printMove) {
                            this.STHistogram[j][1] += phaseTime * (s1 - s0) / (endSpeed - startSpeed);
                        } else {
                            this.STHistogram[j][2] += phaseTime * (s1 - s0) / (endSpeed - startSpeed);

                        }
                    }
                }
            }
        }
    }

    this.calculateBasicMovementInfo = function (gcode) {
        // Relative coord
        gcode.startCoord = this.currentCoord;
        if (!this.absoluteExtrusion) {
            gcode.startCoord[3] = 0;
        }
        gcode.endCoord = updatedValueInNewArray(gcode.startCoord, gcode.coord);
        var relativeCoord = Array(4);
        for (var i = 0; i < 3; i++) {
            relativeCoord[i] = gcode.endCoord[i] - gcode.startCoord[i];
        }
        relativeCoord[3] = (gcode.endCoord[3] - gcode.startCoord[3]) * this.currentExtrudeFactor;
        gcode.relativeCoord = relativeCoord;
        this.currentCoord = gcode.endCoord;

        // Is this a movement
        for (var i = 0; i < 4; i++) {
            if (relativeCoord[i] != 0) {
                gcode.isMovement = true;
                break;
            }
        }

        // Print or travel move
        if (relativeCoord[3] > 0 && (relativeCoord[0] != 0 || relativeCoord[1] != 0)) {
            gcode.printMove = true;
        } else {
            gcode.printMove = false;
        }

        // Feedrate
        if (gcode.parameters.F != undefined) {
            this.currentFeedrate = gcode.parameters.F * this.settings.feedrateMultiplyer * this.currentSpeedFactor / 6000;
        }
        gcode.feedrate = this.currentFeedrate;

        if (gcode.isMovement) {
            // Link movement gcodes
            gcode.previousMovementGcode = this.lastMovementGcode;
            gcode.movementGcodeIndex = this.lastMovementGcode.movementGcodeIndex + 1;
            this.lastMovementGcode.nextMovementGcode = gcode;
            this.lastMovementGcode = gcode;
            this.movementGcodeCount++;

            // Speed, acceleration and jerk
            gcode.calculateAxisRatio();
            gcode.calculateSpeed(this.settings.maxSpeed);
            if (gcode.printMove) {
                gcode.calculateAcceleration(this.currentPrintAcceleration);
            } else {
                gcode.calculateAcceleration(this.currentTravelAcceleration);
            }
            gcode.maxJerk = this.settings.maxJerk;
        }
    }

    this.processGcode = function (gcode) {
        switch (gcode.commandType) {
            case "G0":
            case "G1":
                this.calculateBasicMovementInfo(gcode);
                break;
            case "G10":
                if (gcode.parameters == undefined || !("P" in gcode.parameters)) {
                    gcode.parameters = {};
                    gcode.parameters["F"] = this.firmwareRetractSpeed;
                    gcode.coord = this.currentCoord.slice();
                    this.zBeforeFirmwareRetractZhop = gcode.coord[2];
                    gcode.coord[2] += this.firmwareRetractZhop;
                    if (this.absoluteExtrusion) {
                        gcode.coord[3] -= this.firmwareRetractLength;
                    } else {
                        gcode.coord[3] = -this.firmwareRetractLength;
                    }
                    this.calculateBasicMovementInfo(gcode);
                }
                break;
            case "G11":
                gcode.parameters = {};
                gcode.parameters["F"] = this.firmwareUnretractSpeed;
                gcode.coord = this.currentCoord.slice();
                gcode.coord[2] = this.zBeforeFirmwareRetractZhop;
                if (this.absoluteExtrusion) {
                    gcode.coord[3] += this.firmwareUnretractLength;
                } else {
                    gcode.coord[3] = this.firmwareUnretractLength;
                }
                this.calculateBasicMovementInfo(gcode);
                break;
            case "M82":
                this.absoluteExtrusion = true;
                break;
            case "M83":
                this.absoluteExtrusion = false;
                break;
            case "G92":
                this.currentCoord = updatedValueInNewArray(this.currentCoord, gcode.coord);
                break;
            case "M201":
                this.currentPrintAcceleration = updatedValueInNewArray(this.currentPrintAcceleration, gcode.coord);
                break;
            case "M202":
                this.currentTravelAcceleration = updatedValueInNewArray(this.currentTravelAcceleration, gcode.coord);
                break;
            case "M207":
                if (gcode.parameters.S != undefined) {
                    this.firmwareRetractLength = gcode.parameters.S;
                    if (!this.m208Ran) { // For firmware compatibility
                        this.firmwareUnretractLength = this.firmwareRetractLength;
                    }
                }
                if (gcode.parameters.F != undefined) {
                    this.firmwareRetractSpeed = gcode.parameters.F;
                    if (!this.m208Ran) { // For firmware compatibility
                        this.firmwareUnretractSpeed = this.firmwareRetractSpeed;
                    }
                }
                if (gcode.parameters.Z != undefined) {
                    this.firmwareRetractZhop = gcode.parameters.Z;
                }
                if (gcode.parameters.R != undefined) {
                    this.firmwareUnretractLength = this.firmwareRetractLength + gcode.parameters.R;
                }
                if (gcode.parameters.T != undefined) {
                    this.firmwareUnretractSpeed = gcode.parameters.T;
                }
                break;
            case "M208":
                this.m208Ran = true; // For firmware compatibility
                if (gcode.parameters.S != undefined) {
                    this.firmwareUnretractLength = gcode.parameters.S;
                }
                if (gcode.parameters.F != undefined) {
                    this.firmwareUnretractSpeed = gcode.parameters.F;
                }
                break;
            case "M220":
                if (gcode.parameters.S != undefined) {
                    this.currentSpeedFactor = gcode.parameters.S / 100;
                }
                break;
            case "M221":
                if (gcode.parameters.S != undefined) {
                    this.currentExtrudeFactor = gcode.parameters.S / 100;
                }
            default:
                // unsupported commands
                break;
        }
    }
}
