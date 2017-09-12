
function drawHistogram() {
    var data = histogram[selectedSettings];
    if (data == undefined || data.length == 0) {
        document.getElementById("STHistogramContainer").className = "panel-collapse collapse";
    } else {
        document.getElementById("STHistogramContainer").className = "panel-collapse collapse in";
        if (typeof (data[0][0]) != "string") {
            for (var i = 0; i < data.length; i++) {
                data[i][0] = data[i][0] + " mm/s";
                data[i][1] = parseFloat((data[i][1] / 60).toFixed(2));
                data[i][2] = parseFloat((data[i][2] / 60).toFixed(2));
            }
            data.unshift(["Speed", "Print Move (minutes)", "Travel Move (minutes)"]);
        }
        google.charts.load("current", { packages: ["corechart"] });
        google.charts.setOnLoadCallback(drawChart);
        function drawChart() {
            var chartData = google.visualization.arrayToDataTable(data);
            var options = {
                legend: { position: 'right' },
                bar: { groupWidth: "90%" },
                isStacked: true,
                height: 500,
                chartArea: { left: 80, right: 160, top: 40, bottom: 80 }
            };
            var chart = new google.visualization.ColumnChart(document.getElementById('STHistogram'));
            chart.draw(chartData, options);
        }
    }
}
