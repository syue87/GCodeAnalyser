var defaultSettings = {
    "maxSpeed": { "discription": "<b>Maximum Speed</b> (M203)", "value": [100, 100, 10, 100], "fieldId": ["maxSpeedX", "maxSpeedY", "maxSpeedZ", "maxSpeedE"], "fieldType": "value", "table": "printerAttribute", "unit": "mm/s" },
    "maxPrintAcceleration": { "discription": "<b>Print Acceleration</b> (M201)", "value": [1000, 1000, 100, 10000], "fieldId": ["maxPrintAccelerationX", "maxPrintAccelerationY", "maxPrintAccelerationZ", "maxPrintAccelerationE"], "fieldType": "value", "table": "printerAttribute", "unit": "mm/s^2" },
    "maxTravelAcceleration": { "discription": "<b>Travel Acceleration</b> (M202)", "value": [1000, 1000, 100, 10000], "fieldId": ["maxTravelAccelerationX", "maxTravelAccelerationY", "maxTravelAccelerationZ", "maxTravelAccelerationE"], "fieldType": "value", "table": "printerAttribute", "unit": "mm/s^2" },
    "maxJerk": { "discription": "<b>Jerk</b> (M205 or M566)", "value": [10, 10, 1, 10], "fieldId": ["maxJerkX", "maxJerkY", "maxJerkZ", "maxJerkE"], "fieldType": "value", "table": "printerAttribute", "unit": "mm/s" },
    "absoluteExtrusion": { "discription": "Extrusion Mode", "value": [false], "fieldId": ["absoluteExtrusion"], "fieldType": "checked", "table": undefined, "unit": undefined },
    "feedrateMultiplyer": { "discription": "Feedrate Multiplyer", "value": [100], "fieldId": ["feedrateMultiplyer"], "fieldType": "value", "table": undefined, "unit": undefined, "resetValue": true },
    "filamentDiameter": { "discription": "Filament Diameter", "value": [1.75], "fieldId": ["filamentDiameter"], "fieldType": "value", "table": undefined, "unit": undefined },
    "firmwareRetractLength": { "discription": "Firmware Retract Length", "value": [2], "fieldId": ["firmwareRetractLength"], "fieldType": "value", "table": undefined, "unit": undefined },
    "firmwareUnretractLength": { "discription": "firmware Un-retract Length", "value": [2], "fieldId": ["firmwareUnretractLength"], "fieldType": "value", "table": undefined, "unit": undefined },
    "firmwareRetractSpeed": { "discription": "Firmware Retract Speed", "value": [50], "fieldId": ["firmwareRetractSpeed"], "fieldType": "value", "table": undefined, "unit": undefined },
    "firmwareUnretractSpeed": { "discription": "Firmware Un-retract Speed", "value": [50], "fieldId": ["firmwareUnretractSpeed"], "fieldType": "value", "table": undefined, "unit": undefined },
    "firmwareRetractZhop": { "discription": "Firmware Retract Z-Hop", "value": [0], "fieldId": ["firmwareRetractZhop"], "fieldType": "value", "table": undefined, "unit": undefined },
    "timeScale": { "discription": "Time Scale", "value": [1.01], "fieldId": [undefined], "fieldType": "value", "table": undefined, "unit": undefined, "resetValue": true }
}

var globalSettings = {
    "collapsePanels": { "value": [false, false] }
}

var settingSets = Array(4);

function loadSettings() {
    for (var i = 0; i < 4; i++) {
        var settingsStorage = localStorage.getItem("gcodeAnalyserSettings" + i);
        var storageDict;
        if (settingsStorage == undefined) {
            storageDict = {};
        } else {
            storageDict = JSON.parse(settingsStorage);
        }
        settingSets[i] = JSON.parse(JSON.stringify(defaultSettings)); // Deep clone
        for (key in defaultSettings) {
            if (key in storageDict && storageDict[key] != undefined && !("resetValue" in defaultSettings[key])) {
                settingSets[i][key].value = storageDict[key];
            }
        }
    }

    var settingsStorage = localStorage.getItem("gcodeAnalyserGlobalSettings");
    var storageDict;
    if (settingsStorage == undefined) {
        storageDict = {};
    } else {
        storageDict = JSON.parse(settingsStorage);
    }

    for (key in globalSettings) {
        if (key in storageDict && storageDict[key] != undefined && !("resetValue" in globalSettings[key])) {
            globalSettings[key] = storageDict[key];
        }
    }
}

function exportSettings() {
    saveSettings({ "target": { "id": "" } });
    location.href = "data:application/octet-stream," + encodeURIComponent(localStorage.getItem("gcodeAnalyserSettings" + selectedSettings));
}

function importSettings(settings) {
    localStorage.setItem("gcodeAnalyserSettings" + selectedSettings, settings);
    loadSettings();
    displaySettings();
}

function saveSettings(event) {
    var fieldId = event.target.id;
    if (event.target.id == "relativeExtrusion") {
        fieldId = "absoluteExtrusion";
    }
    var storageDict = {};
    for (key in settingSets[selectedSettings]) {
        storageDict[key] = Array(settingSets[selectedSettings][key].fieldId.length);
        for (var i = 0; i < settingSets[selectedSettings][key].fieldId.length; i++) {
            if (fieldId == settingSets[selectedSettings][key].fieldId[i]) {
                var newValue;
                if (event.target.id == "relativeExtrusion") {
                    newValue = false;
                } else {
                    newValue = event.target[settingSets[selectedSettings][key].fieldType];
                    if (settingSets[selectedSettings][key].fieldType == "value") {
                        newValue = parseFloat(newValue);
                    }
                }
                storageDict[key][i] = newValue;
                settingSets[selectedSettings][key].value[i] = newValue;
            } else {
                storageDict[key][i] = settingSets[selectedSettings][key].value[i];
            }
        }
    }
    localStorage.setItem("gcodeAnalyserSettings" + selectedSettings, JSON.stringify(storageDict));
}

function simpleSettingsDict() {
    var simpleSettings = {};
    for (key in settingSets[selectedSettings]) {
        if (settingSets[selectedSettings][key].value.length == 1) {
            simpleSettings[key] = settingSets[selectedSettings][key].value[0];
        } else {
            simpleSettings[key] = settingSets[selectedSettings][key].value;
        }
    }
    return simpleSettings;
}

function saveGlobalSettings() {
    localStorage.setItem("gcodeAnalyserGlobalSettings", JSON.stringify(globalSettings));
}