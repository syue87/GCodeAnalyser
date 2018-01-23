var gcodeProcessorWorker = new Worker('js/gcodeProcessor.js?1801221');
var gcodeLines = undefined;
var selectedSettings = 0;
var results = Array(4);
var resultFieldIds = [];
var currentCalculationSetting = 0;
var dropzone = document.getElementById('dropzone');
var histogram = Array(4);
dropzone.style.cursor = 'pointer';
dropzone.onmouseover = function () {
  this.style.border = '3px dashed #909090';
};
dropzone.onmouseout = function () {
  this.style.border = '3px dashed #cccccc';
};

makeDroppable(document.getElementById("importSettingsButton"), readSettings);

$(document).ready(function () {
  $('#viewerHelp').popover({
    content: "&#8226 Make sure <b>Extrusion Mode</b> is selected correctly <br /> &#8226 <b>Filament Diameter</b> will affect line width",
    html: true
  });
});

makeDroppable(dropzone, readFile);

function makeDroppable(element, callback) {

  var input = document.createElement('input');
  input.setAttribute('type', 'file');
  input.setAttribute('multiple', false);
  input.style.display = 'none';

  input.addEventListener('change', triggerCallback);
  element.appendChild(input);

  element.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    element.classList.add('dragover');
  });

  element.addEventListener('dragleave', function (e) {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('dragover');
  });

  element.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    element.classList.remove('dragover');
    triggerCallback(e);
  });

  element.addEventListener('click', function () {
    input.value = null;
    input.click();
  });

  function triggerCallback(e) {
    var files;
    if (e.dataTransfer) {
      files = e.dataTransfer.files;
    } else if (e.target) {
      files = e.target.files;
    }
    callback.call(null, files);
  }
}

$(function () {
  $("#canvasVerticalSlider").slider({
    orientation: "vertical",
    min: 1,
    max: 2,
    step: 1,
    values: 1,
  });
  $("#canvasVerticalSlider").height($("#renderCanvas").height() - 96);
  $("#canvasVerticalSlider").on("slide", function (event, ui) { setRender(ui.value) });
});

gcodeProcessorWorker.onmessage = function (e) {
  if ("resultFormat" in e.data) {
    addResultTableEntries(e.data.resultFormat);
  } else if ("progress" in e.data) {
    setProgressBarPercent(e.data.progress);
  } else if ("complete" in e.data) {
    document.getElementById("progress").style = "display:none;";
    document.getElementById("calculateButton").style = "margin-bottom: 20px; display:true;";
    setProgressBarPercent(0);
  } else if ("result" in e.data) {
    results[currentCalculationSetting] = e.data.result;
    $("#layerNumber").text("(Generating...)");
    displayResult();
    generateView();
  } else if ("layers" in e.data) {
    gcodeProcessorWorker.postMessage("cleanup");
    initRender(e.data.layers, settingSets[currentCalculationSetting].filamentDiameter.value[0]);
  } else if ("histogram" in e.data) {
    histogram[currentCalculationSetting] = e.data.histogram;
    drawHistogram();
  }
}

function generateView() {
  initCanvas();
}

function displayResult() {
  for (var i = 0; i < resultFieldIds.length; i++) {
    var key = resultFieldIds[i];
    if (results[selectedSettings] != undefined && results[selectedSettings][key] != undefined) {
      document.getElementById(key).innerHTML = results[selectedSettings][key];
    } else {
      document.getElementById(key).innerHTML = "";
    }
  }
}

function setProgressBarPercent(percent) {
  var progressBar = document.getElementById("progressBar");
  progressBar.style = "-webkit-transition: none; transition: none;width: " + percent + "%;";
  progressBar.setAttribute("aria-valuenow", percent);
  progressBar.innerHTML = percent + "%";
}

function selectSettings(newSelectedSettings) {
  document.getElementById("selectSettings" + selectedSettings).className = "btn btn-info";
  document.getElementById("selectSettings" + newSelectedSettings).className = "btn btn-info active";
  selectedSettings = newSelectedSettings;
  displaySettings();
  displayResult();
  drawHistogram();
}

function displayProgressBar() {
  setProgressBarPercent(0);
  document.getElementById("progress").style = "margin-bottom: 14px; display:true;";
  document.getElementById("calculateButton").style = "display:none;";
}

function refreshStatistics() {
  if (gcodeLines != undefined) {
    displayProgressBar();
    gcodeProcessorWorker.postMessage([gcodeLines, simpleSettingsDict(selectedSettings)]);
    currentCalculationSetting = selectedSettings;
  }
}

function readSettings(evt) {
  var f = evt[0];
  if (f) {
    var r = new FileReader();
    r.onload = function (e) {
      importSettings(e.target.result);
    }
    r.readAsText(f);
  }
}


function readFile(evt) {
  var f = evt[0];
  if (f) {
    var size;
    if (f.size / 1024 / 1024 < 1) {
      size = (f.size / 1024).toFixed(1) + "KB";
    } else {
      size = (f.size / 1024 / 1024).toFixed(1) + "MB";
    }
    dropzone.innerHTML = f.name + " - " + size;
    var r = new FileReader();
    r.onload = function (e) {
      gcodeLines = e.target.result.split(/\s*[\r\n]+\s*/g);
      refreshStatistics();
    }
    r.readAsText(f);
    displayProgressBar();
  }
}

function onloadInit() {
  // Request Result Format
  gcodeProcessorWorker.postMessage("getResultFormat");
  // Printer Attribute
  loadSettings();
  collapsePanels();
  addTableEntries();
  displaySettings();
  initCanvas();
}

function savePanelCollapse(index) {
  globalSettings.collapsePanels.value[index] = !globalSettings.collapsePanels.value[index];
  saveGlobalSettings();
}

function collapsePanels() {
  if (globalSettings.collapsePanels.value[0] == true) {
    document.getElementById("collapse0").className = "panel-collapse collapse";
  } else {
    document.getElementById("collapse0").className = "panel-collapse collapse in";
  }
  if (globalSettings.collapsePanels.value[1] == true) {
    document.getElementById("collapse1").className = "panel-collapse collapse";
  } else {
    document.getElementById("collapse1").className = "panel-collapse collapse in";
  }
}

function addTableEntries() {
  var printerAttribute = document.getElementById("printerAttribute");
  for (key in defaultSettings) {
    if (defaultSettings[key].table == "printerAttribute") {
      var row = printerAttribute.insertRow(-1);
      var cell = row.appendChild(document.createElement('td'));
      cell.innerHTML = defaultSettings[key].discription;
      for (var i = 0; i < defaultSettings[key].fieldId.length; i++) {
        cell = row.insertCell(-1);
        var div = document.createElement("div");
        var input = document.createElement("input");
        input.className = "form-control";
        input.type = "text";
        input.pattern = "[0-9]*";
        input.setAttribute("onchange", "saveSettings(event)");
        input.id = defaultSettings[key].fieldId[i];
        input.style.background = "transparent";
        div.appendChild(input);
        div.className = "input-group-sm";
        cell.appendChild(div);
      }
      cell = row.insertCell(-1);
      cell.innerHTML = defaultSettings[key].unit;
    }
  }
}

function displaySettings() {
  for (key in settingSets[selectedSettings]) {
    if (settingSets[selectedSettings][key].table == "printerAttribute") {
      for (var i = 0; i < settingSets[selectedSettings][key].fieldId.length; i++) {
        document.getElementById(settingSets[selectedSettings][key].fieldId[i]).value = settingSets[selectedSettings][key].value[i];
      }
    } else {
      if (settingSets[selectedSettings][key].fieldId[0] != undefined) {
        if (settingSets[selectedSettings][key].fieldId[0] == "absoluteExtrusion") {
          document.getElementById("absoluteExtrusion").checked = settingSets[selectedSettings][key].value[0];
          document.getElementById("relativeExtrusion").checked = !settingSets[selectedSettings][key].value[0];
        } else {
          document.getElementById(settingSets[selectedSettings][key].fieldId[0])[settingSets[selectedSettings][key].fieldType] = settingSets[selectedSettings][key].value[0];
        }
      }
    }
  }
}

function addResultTableEntries(resultFormat) {
  var gcodeStatsCount = 0;
  for (key in resultFormat) {
    if (resultFormat[key].table == "gcodeStats") {
      gcodeStatsCount++;
    }
  }
  var maxRow = Math.ceil(gcodeStatsCount / 2);
  var gcodeStatsTableContent = [Array(maxRow), Array(maxRow)];
  var row = 0;
  var col = 0;
  for (key in resultFormat) {
    if (resultFormat[key].table == "gcodeStats") {
      if (!key.startsWith("Category")) {
        resultFieldIds.push(key);
      }
      gcodeStatsTableContent[col][row] = key;
    }
    row++;
    if (row == maxRow) {
      row = 0;
      col++;
    }
  }

  for (var i = 0; i < maxRow; i++) {
    var table = document.getElementById("gcodeStats");
    var row = table.insertRow(-1);
    for (var j = 0; j < 2; j++) {
      var key = gcodeStatsTableContent[j][i];
      if (key == undefined) {
        var cell = row.appendChild(document.createElement('th'));
        cell.setAttribute("colspan", 2);
        break;
      }
      var cell = row.appendChild(document.createElement('th'));
      cell.innerHTML = resultFormat[key].discription;
      if (key.startsWith("Category")) {
        cell.className = "bg-info text-center col-xs-6 col-sm-6 col-md-6 col-lg-6";
        cell.setAttribute("colspan", 2);
      } else {
        cell.className = "col-xs-3 col-sm-3 col-md-3 col-lg-3";
        cell = row.insertCell(-1);
        cell.className = "col-xs-3 col-sm-3 col-md-3 col-lg-3";
        var span = document.createElement("span");
        span.id = key;
        cell.appendChild(span);
      }
    }
  }

  for (key in resultFormat) {
    if (resultFormat[key].table == "gcodeStatsPerAxis") {
      var table = document.getElementById("gcodeStatsPerAxis");
      var row = table.insertRow(-1);
      var cell = row.appendChild(document.createElement('th'));
      cell.innerHTML = resultFormat[key].discription;
      for (var i = 0; i < resultFormat[key].fieldId.length; i++) {
        cell = row.insertCell(-1);
        var span = document.createElement("span");
        span.id = resultFormat[key].fieldId[i];
        resultFieldIds.push(resultFormat[key].fieldId[i]);
        cell.appendChild(span);
      }
    }
  }
}

var doit;
window.onresize = function () {
  drawHistogram();
  clearTimeout(doit);
  doit = setTimeout(resizeCanvas, 100);
};