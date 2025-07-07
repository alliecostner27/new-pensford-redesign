// === GOOGLE CHARTS ===
google.charts.load("current", { packages: ["corechart", "bar"] });
google.charts.setOnLoadCallback(loadData);

// === GLOBAL DATASETS ===
let fullProjectionData = null;    // "Market Expectations" sheet
let fullHistoricalData = null;    // "Historical/Real" sheet
let transformedData = [];         // Data sent to chart/table
let headers = [];                 // Column headers (shared between both)

// === FILTERING + VIEW STATE ===
let activeRange = "3y";           // Default date range
let viewMode = "daily";           // Options: daily | monthly
let tableViewMode = "daily";      // Separate for table if needed
let visibleCheckboxes = ["Reset Date", "1M Term SOFR", "3M Term SOFR", "30D Average SOFR (NYFED)"];

let redrawTimeout;
function debounceRedraw() {
  clearTimeout(redrawTimeout);
  redrawTimeout = setTimeout(() => {
    processDataAndRedraw();
  }, 250); 
}

function transformData(rawData) {
  if (!rawData || rawData.length < 2) {
    console.warn("No raw data available for transformation.");
    return [];
  }

  const header = rawData[0];
  const resetDateIndex = header.indexOf("Reset Date");

  if (resetDateIndex === -1) {
    console.error("'Reset Date' column missing.");
    return [];
  }

  const cleaned = [header];

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const newRow = [];

    for (let j = 0; j < row.length; j++) {
      if (j === resetDateIndex) {
        const raw = row[j];
        const date = new Date(raw); 
        if (isNaN(date.getTime())) {
          console.warn(`❌ Invalid date at row ${i}:`, raw);
          break; 
        }
        newRow.push(date);
      } else {
        const val = parseFloat(row[j]);
        newRow.push(isNaN(val) ? null : val);
      }
    }

    if (newRow.length === header.length) {
      cleaned.push(newRow);
    }
  }

  console.log("✅ transformData() rows returned:", cleaned.length);
  return cleaned;
}

function loadData() {
  const showHistorical = document.getElementById("historicalToggle")?.checked ?? false;

  if (showHistorical) {
    // Load both sheets in parallel
    const historicalURL = "https://script.google.com/macros/s/AKfycbzhcymTfhNgFb_RJLSOYvtTihmh8lgdzr3sD4HuHYPaJ5L5lGKhMUsmdLyhnPar9ij5bw/exec?sheet=Historical/Real";
    const projectionURL = "https://script.google.com/macros/s/AKfycbzhcymTfhNgFb_RJLSOYvtTihmh8lgdzr3sD4HuHYPaJ5L5lGKhMUsmdLyhnPar9ij5bw/exec?sheet=Market Expectations";

    Promise.all([
      fetch(historicalURL).then(res => res.json()),
      fetch(projectionURL).then(res => res.json())
    ])
    .then(([historical, projection]) => {
      if (!historical || !projection || historical.length < 2 || projection.length < 2) {
        console.error("Missing or insufficient data in one of the sources.");
        return;
      }

      fullHistoricalData = transformData(historical);
      fullProjectionData = transformData(projection);
      headers = fullProjectionData[0]; 

      processDataAndRedraw();
    })
    .catch(error => {
      console.error("Error loading both sheets:", error);
    });

  } else {
    // Load only projection
    const url = "https://script.google.com/macros/s/AKfycbzhcymTfhNgFb_RJLSOYvtTihmh8lgdzr3sD4HuHYPaJ5L5lGKhMUsmdLyhnPar9ij5bw/exec?sheet=Market Expectations";

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (!data || data.length < 2) {
          console.error("Projection sheet is empty or invalid.");
          return;
        }

        fullProjectionData = transformData(data);
        headers = fullProjectionData[0];
        fullHistoricalData = null; // Clear if previously loaded

        processDataAndRedraw();
      })
      .catch(error => {
        console.error("Error loading projection sheet:", error);
      });
  }
}

function processDataAndRedraw() {
  const showHistorical = document.getElementById("historicalToggle")?.checked ?? false;

  const dateIndex = headers.indexOf("Reset Date");
  if (dateIndex === -1) {
    console.error("'Reset Date' column missing");
    return;
  }

  const sinceDateStr = document.getElementById("sinceDate")?.value;
  const sinceDate = sinceDateStr ? new Date(sinceDateStr) : null;

  if (!sinceDate || isNaN(sinceDate.getTime())) {
    console.warn("⚠️ Invalid or missing 'since' date input");
    return;
  }

  // Set today and 10-year forward limit
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endDate = new Date(sinceDate);
  endDate.setFullYear(endDate.getFullYear() + 10);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let chartData = [];

  if (showHistorical && fullHistoricalData && fullProjectionData) {
    const histRows = fullHistoricalData.slice(1).filter(row => {
      const d = new Date(row[dateIndex]);
      return d >= sinceDate && d <= yesterday;
    });

    const projRows = fullProjectionData.slice(1).filter(row => {
      const d = new Date(row[dateIndex]);
      return d >= today && d <= endDate;
    });

    chartData = [headers, ...histRows, ...projRows];
  } else if (fullProjectionData) {
    const projRows = fullProjectionData.slice(1).filter(row => {
      const d = new Date(row[dateIndex]);
      return d >= sinceDate && d <= endDate;
    });

    chartData = [headers, ...projRows];
  } else {
    console.error("No projection data available");
    return;
  }

  transformedData = chartData;

  console.log("Chart Data Range", {
    sinceDate,
    endDate,
    totalRows: chartData.length,
    preview: chartData.slice(0, 5)
  });

  drawChart(sinceDate, endDate);
}

function drawChart(startDate, endDate) {
  if (!transformedData || transformedData.length < 2) return;

  // Ensure fallback dates
  if (!startDate || isNaN(startDate.getTime())) {
    startDate = transformedData[1]?.[0] instanceof Date ? transformedData[1][0] : new Date();
  }
  if (!endDate || isNaN(endDate.getTime())) {
    const lastRow = transformedData[transformedData.length - 1];
    endDate = lastRow?.[0] instanceof Date ? lastRow[0] : new Date();
  }

  window.currentStartDate = startDate;
  window.currentEndDate = endDate;

  const fullHeader = transformedData[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const showHistorical = document.getElementById("historicalToggle")?.checked ?? false;
  const highlightActuals = document.getElementById("actualsToggle")?.checked ?? false;

  const filteredIndexes = fullHeader
    .map((label, i) => (i === 0 || visibleCheckboxes.includes(label)) ? i : -1)
    .filter(i => i !== -1);

  if (filteredIndexes.length <= 1) {
    const chartDiv = document.getElementById("chart_div");
    if (chartDiv) {
      chartDiv.innerHTML = "<p style='color:red;'>Please select at least one data series to display the chart.</p>";
    }
    return;
  }

  // Apply column filter
  let dataArray = transformedData.map(row => filteredIndexes.map(i => row[i]));

  // Smoothing if toggle is on
  const smoothingToggle = document.getElementById("smoothingToggle");
  if (smoothingToggle?.checked) {
    dataArray = smoothData(dataArray, 5);
  }

  try {
    const data = google.visualization.arrayToDataTable(dataArray);
    const header = dataArray[0];

    const options = {
      title: '',
      height: 500,
      curveType: 'function',
      legend: { position: 'none' },
      chartArea: { width: '85%', height: '70%' },
      lineWidth: 2,
      focusTarget: 'category',
      tooltip: {
        trigger: 'both',
        textStyle: {
          fontName: 'Kanit',
          fontSize: 12,
          color: '#333'
        },
        showColorCode: true,
        isHtml: false
      },
      hAxis: {
        format: 'yyyy',
        slantedText: false,
        ticks: generateYearlyTicks(startDate, endDate),
        textStyle: { fontSize: 12 },
        gridlines: { color: 'transparent' }
      },
      vAxis: {
        format: '#.##%',
        textStyle: { fontSize: 12 },
        gridlines: { color: '#e0e0e0' },
        baselineColor: '#333',
        baseline: 0,
        textPosition: 'out',
        minorGridlines: { color: 'transparent' }
      },
      series: {}
    };

    const colorMap = {
      "1M Term SOFR": "#1976d2",
      "3M Term SOFR": "#388e3c",
      "30D Average SOFR (NYFED)": "#f57c00",
      "Overnight SOFR": "#6a1b9a",
      "Simple Average SOFR": "#00838f",
      "1M ISDA SOFR": "#5d4037",
      "Prime": "#e65100",
      "FOMC DOT Plot": "#2e7d32"
    };

    // Assign color per series based on whether it has only historical or mixed
    for (let i = 1; i < header.length; i++) {
      const label = header[i];
      let hasHistorical = false;
      let hasProjection = false;

      for (let j = 1; j < dataArray.length; j++) {
        const rowDate = dataArray[j][0];
        const value = dataArray[j][i];
        if (value != null) {
          if (rowDate < today) hasHistorical = true;
          if (rowDate >= today) hasProjection = true;
        }
      }

      let seriesColor = colorMap[label] || "#000000";

      if (showHistorical && hasHistorical && !hasProjection) {
        seriesColor = "#4caf50"; // historical only — green
      } else if (highlightActuals && label.toLowerCase().includes("actual")) {
        seriesColor = "#d32f2f"; // red for actuals toggle
      }

      options.series[i - 1] = {
        color: seriesColor
      };
    }

    const chart = new google.visualization.LineChart(document.getElementById("chart_div"));
    chart.draw(data, options);

    renderForwardCurveTable(startDate, endDate, viewMode);
  } catch (err) {
    const chartDiv = document.getElementById("chart_div");
    if (chartDiv) {
      chartDiv.innerHTML = `<p style='color:red;'>Chart failed to render: ${err.message}</p>`;
    }
  }
}

function downloadChartImage() {
  const chartContainer = document.getElementById("chart_div");
  if (!chartContainer) {
    alert("Chart not found.");
    return;
  }

  // Recreate the visible data subset
  const filteredIndexes = transformedData[0]
    .map((label, i) => (i === 0 || visibleCheckboxes.includes(label)) ? i : -1)
    .filter(i => i !== -1);

  const dataArray = transformedData.map(row => filteredIndexes.map(i => row[i]));
  const data = google.visualization.arrayToDataTable(dataArray);

  const options = {
    title: '',
    width: 1200,
    height: 600,
    curveType: 'function',
    legend: { position: 'bottom' },
    chartArea: { width: '85%', height: '70%' },
    lineWidth: 2,
    hAxis: {
      format: 'yyyy',
      slantedText: false,
      ticks: generateYearlyTicks(currentStartDate, currentEndDate),
      textStyle: { fontSize: 12 },
      gridlines: { color: 'transparent' }
    },
    vAxis: {
      format: '#.##%',
      textStyle: { fontSize: 16 },
      gridlines: { color: '#e0e0e0' },
      baselineColor: '#333',
      baseline: 0,
      textPosition: 'out',
      minorGridlines: { color: 'transparent' }
    },
    series: {}
  };

  // Render off-screen
  const tempDiv = document.createElement("div");
  tempDiv.style.position = "absolute";
  tempDiv.style.left = "-9999px";
  tempDiv.style.top = "0";
  document.body.appendChild(tempDiv);

  const tempChart = new google.visualization.LineChart(tempDiv);
  google.visualization.events.addListener(tempChart, 'ready', () => {
    const imgUri = tempChart.getImageURI();

    const link = document.createElement("a");
    link.href = imgUri;
    link.download = "forward_curve_chart.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    document.body.removeChild(tempDiv); 
  });

  tempChart.draw(data, options);
}

function applyURLSettings() {
  const urlParams = new URLSearchParams(window.location.search);
  const settings = urlParams.get("settings");
  const view = urlParams.get("viewMode");
  const asOf = urlParams.get("asOf");
  const historical = urlParams.get("historical");

  // Apply checkboxes
  if (settings) {
    const selected = settings.split(",");
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = selected.includes(cb.value);
    });
    visibleCheckboxes = ["Reset Date", ...selected.filter(val => val !== "Reset Date")];
  }

  // Apply view mode
  if (view) viewMode = view;
  if (document.querySelector(`[data-view="${view}"]`)) {
    document.querySelectorAll(".view-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelector(`[data-view="${view}"]`).classList.add("active");
  }

  // Apply As Of toggle
  if (asOf === "on") {
    document.getElementById("actualsToggle")?.setAttribute("checked", true);
  }

  // Apply Historical toggle
  if (historical === "on") {
    document.getElementById("historicalToggle")?.setAttribute("checked", true);
  }
}

// Trigger chart redraw when toggles or date dropdowns are changed
function setupForwardCurveInteractionListeners() {
  const redraw = () => drawChart();

  const ids = [
    "historicalToggle",
    "actualsToggle",
    "sinceDay", "sinceMonth", "sinceYear",
    "asOfDay", "asOfMonth", "asOfYear"
  ];

  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", redraw);
  });
}

function populateSinceDateSelectors() {
  const now = new Date();
  const sinceDay = document.getElementById("sinceDay");
  const sinceMonth = document.getElementById("sinceMonth");
  const sinceYear = document.getElementById("sinceYear");

  if (!sinceDay || !sinceMonth || !sinceYear) return;

  // Day
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    if (d === now.getDate()) opt.selected = true;
    sinceDay.appendChild(opt);
  }

  // Month
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  monthNames.forEach((month, index) => {
    const opt = document.createElement("option");
    opt.value = month;
    opt.textContent = month;
    if (index === now.getMonth()) opt.selected = true;
    sinceMonth.appendChild(opt);
  });

  // Year: from 1990 to current year
  for (let y = now.getFullYear(); y >= 1990; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === now.getFullYear()) opt.selected = true;
    sinceYear.appendChild(opt);
  }
}

document.addEventListener("DOMContentLoaded", populateSinceDateSelectors);

function populateAsOfDateSelectors() {
  const today = new Date();
  const day = today.getDate();
  const month = today.getMonth(); 
  const year = today.getFullYear();

  const asOfDay = document.getElementById("asOfDay");
  const asOfMonth = document.getElementById("asOfMonth");
  const asOfYear = document.getElementById("asOfYear");

  // Populate day options (1–31)
  if (asOfDay) {
    for (let d = 1; d <= 31; d++) {
      const opt = document.createElement("option");
      opt.value = d.toString().padStart(2, "0");
      opt.textContent = d;
      if (d === day) opt.selected = true;
      asOfDay.appendChild(opt);
    }
  }

  // Populate month options (Jan–Dec)
  if (asOfMonth) {
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    for (let m = 0; m < 12; m++) {
      const opt = document.createElement("option");
      opt.value = m.toString(); 
      opt.textContent = monthNames[m];
      if (m === month) opt.selected = true;
      asOfMonth.appendChild(opt);
    }
  }

  // Populate year options (current year ± 5)
  if (asOfYear) {
    for (let y = year - 5; y <= year + 5; y++) {
      const opt = document.createElement("option");
      opt.value = y.toString();
      opt.textContent = y;
      if (y === year) opt.selected = true;
      asOfYear.appendChild(opt);
    }
  }
}

function populateCommentaryDateSelector() {
  const commentaryInput = document.getElementById("commentaryDate");
  const commentaryOut = document.querySelector(".commentaryDate");

  if (!commentaryInput || !commentaryOut) return;

  // Set default to today if not set
  if (!commentaryInput.value) {
    const today = new Date().toISOString().split("T")[0];
    commentaryInput.value = today;
  }

  // Function to update display
  const updateCommentaryDisplay = () => {
    const selectedDate = new Date(commentaryInput.value);
    const formatted = selectedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    commentaryOut.textContent = formatted;
  };

  // Initial display update
  updateCommentaryDisplay();

  // Update on change
  commentaryInput.addEventListener("change", updateCommentaryDisplay);
}

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  const asOfInput = document.getElementById("asOfDate");
  const sinceInput = document.getElementById("sinceDate");
  const commentaryInput = document.getElementById("commentaryDate");

  if (asOfInput && !asOfInput.value) asOfInput.value = today;
  if (sinceInput && !sinceInput.value) sinceInput.value = today;
  // Element references
  applyURLSettings();
  const chartTab = document.getElementById("chartTab");
  const tableTab = document.getElementById("tableTab");
  const chartOptions = document.getElementById("chartOptions");
  const tableOptions = document.getElementById("tableOptions");
  const chartContent = document.getElementById("chartContent");
  const tableContent = document.getElementById("tableContent");

  let currentStartDate = new Date(new Date().getFullYear(), 0, 1);
  let currentEndDate = new Date(new Date().getFullYear() + 10, 11, 31);
  let tableViewMode = "daily";

  // ---- Tab Switching ----
  if (chartTab && tableTab && chartContent && tableContent) {
    chartTab.addEventListener("click", () => {
      chartTab.classList.add("active");
      tableTab.classList.remove("active");

      chartOptions?.style.setProperty("display", "block");
      tableOptions?.style.setProperty("display", "none");

      chartContent.style.display = "block";
      tableContent.style.display = "none";

      // When chart tab is shown, redraw chart with current dates
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 50);
    });

    tableTab.addEventListener("click", () => {
      tableTab.classList.add("active");
      chartTab.classList.remove("active");

      chartOptions?.style.setProperty("display", "none");
      tableOptions?.style.setProperty("display", "block");

      chartContent.style.display = "none";
      tableContent.style.display = "block";

      // When table tab is shown, render table with selected mode
      renderForwardCurveTable(currentStartDate, currentEndDate, tableViewMode);
    });
  }

  // ---- Table View Toggle Buttons ----
  document.querySelectorAll(".view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document
        .querySelectorAll(".view-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const newMode = btn.dataset.view;
      tableViewMode = newMode;

      // Only redraw table if Table tab is active
      if (tableContent?.style.display !== "none") {
        renderForwardCurveTable(
          currentStartDate,
          currentEndDate,
          tableViewMode
        );
      }
    });
  });

  // ---- Other Panel Toggles ----
  document.querySelectorAll(".tab-btn").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      document
        .querySelectorAll(".tab-btn")
        .forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      const target = button.getAttribute("data-tab");
      document
        .querySelectorAll(".tab-content")
        .forEach((div) => (div.style.display = "none"));

      const mobileCommentaryPanel = document.getElementById(
        "mobileCommentaryPanel"
      );
      const filterPanel = document.getElementById("filterPanel");
      const fedPanel = document.getElementById("fedPanel");
      const commentaryPanel = document.getElementById("commentaryPanel");
      if (mobileCommentaryPanel) mobileCommentaryPanel.style.display = "none";
      if (filterPanel) filterPanel.style.display = "none";
      if (fedPanel) fedPanel.style.display = "none";
      if (commentaryPanel) commentaryPanel.style.display = "none";

      const activeContent = document.getElementById(target);
      if (activeContent) activeContent.style.display = "block";

      if (target === "chartContent" && filterPanel) {
        filterPanel.style.display = "block";
        drawChart(currentStartDate, currentEndDate);
      } else if (target === "commentaryContent" && commentaryPanel) {
        commentaryPanel.style.display = "block";
        if (window.innerWidth <= 768 && mobileCommentaryPanel) {
          mobileCommentaryPanel.style.display = "block";
        }
      }
    });
  });

    // --- Mobile Nav Drawer toggle ---
  const hamburgerBtn = document.getElementById("hamburgerMenu");
  const mobileNavDrawer = document.getElementById("mobileNavDrawer");
  const closeDrawerBtn = document.getElementById("closeDrawer");

  if (hamburgerBtn && mobileNavDrawer) {
    hamburgerBtn.addEventListener("click", () => {
      mobileNavDrawer.classList.add("open");
    });
  }

  if (closeDrawerBtn && mobileNavDrawer) {
    closeDrawerBtn.addEventListener("click", () => {
      mobileNavDrawer.classList.remove("open");
    });
  }

  // ---- Populate Dropdowns and Navigation ----
  ["sinceDay", "sinceMonth", "sinceYear"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", debounceRedraw);
  });
  populateSinceDateSelectors();
  populateAsOfDateSelectors();
  populateCommentaryDateSelector();

  ["historicalToggle", "actualsToggle", "sinceDay", "sinceMonth", "sinceYear", "asOfDay", "asOfMonth", "asOfYear"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("change", debounceRedraw);
  });

    // Show modal
document.getElementById("sharePageButton").addEventListener("click", () => {
  document.getElementById("emailModal").style.display = "flex";
});

// Show modal from TABLE share button
document.getElementById("sharePageButtonTable").addEventListener("click", () => {
  document.getElementById("emailModal").style.display = "flex";
});

// Hide modal
document.getElementById("cancelEmail").addEventListener("click", () => {
  document.getElementById("emailModal").style.display = "none";
});

// Add additional email field
document.getElementById("addEmail").addEventListener("click", () => {
  const container = document.getElementById("emailFields");
  const newInput = document.createElement("input");
  newInput.type = "email";
  newInput.className = "recipientEmail";
  newInput.placeholder = "example@email.com";
  newInput.required = true;
  container.appendChild(newInput);
});

// Send email with settings
document.getElementById("sendEmail").addEventListener("click", () => {
  const emails = Array.from(document.querySelectorAll(".recipientEmail"))
    .map(input => input.value.trim())
    .filter(email => email !== "");

  if (emails.length === 0) {
    alert("Please enter at least one email address.");
    return;
  }

  const selected = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value)
    .filter(val => val !== "Reset Date");

  const url = new URL(window.location.href);
  url.searchParams.set("settings", selected.join(","));
  url.searchParams.set("viewMode", viewMode);
  url.searchParams.set("asOf", document.getElementById("actualsToggle")?.checked ? "on" : "off");
  url.searchParams.set("historical", document.getElementById("historicalToggle")?.checked ? "on" : "off");

  const subject = encodeURIComponent("Pensford Forward Curve Settings");
  const body = encodeURIComponent(`Here’s a link to view the Forward Curve with my selected settings:\n\n${url.href}`);

  window.location.href = `mailto:${emails.join(",")}?subject=${subject}&body=${body}`;
  document.getElementById("emailModal").style.display = "none";
});

  setupForwardCurveInteractionListeners();
  drawChart(currentStartDate, currentEndDate);
});

function renderForwardCurveTable(startDateInput, endDateInput, mode = 'daily') {
  if (!transformedData || transformedData.length < 2) {
    console.warn("No transformed data available.");
    return;
  }

  const container = document.getElementById("forwardCurveTableContainer");
  if (!container) return;

  // Parse safe fallback dates
  const parseDate = val => {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const startDate = window.currentStartDate || new Date(2019, 0, 1);
  const endDate = window.currentEndDate || new Date(2025, 11, 31);

  const fullHeader = transformedData[0];
  const dateIndex = 0;

  // Determine which columns to include
  const colIndexes = fullHeader.map((label, i) => {
    if (i === 0 || visibleCheckboxes.includes(label)) return i;
    return -1;
  }).filter(i => i !== -1);

  // Filter rows in range
  const filteredRows = transformedData.slice(1).filter(row => {
    const rowDate = new Date(row[dateIndex]).setHours(0, 0, 0, 0);
    const start = new Date(startDate).setHours(0, 0, 0, 0);
    const end = new Date(endDate).setHours(0, 0, 0, 0);
    return rowDate >= start && rowDate <= end;
  });

  // Group data if needed
  let groupedRows;
  if (mode === 'monthly' || mode === 'yearly') {
    const grouped = {};
    filteredRows.forEach(row => {
      const date = new Date(row[0]);
      const key = mode === 'monthly'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : `${date.getFullYear()}`;

      if (!grouped[key]) {
        grouped[key] = { count: 0, sum: Array(row.length).fill(0), sampleDate: date };
      }

      for (let i = 1; i < row.length; i++) {
        grouped[key].sum[i] += row[i];
      }

      grouped[key].count++;
    });

    groupedRows = Object.values(grouped).map(group => {
      const avg = [...group.sum];
      for (let i = 1; i < avg.length; i++) {
        avg[i] = group.count ? avg[i] / group.count : 0;
      }
      avg[0] = group.sampleDate;
      return avg;
    });
  } else {
    groupedRows = filteredRows;
  }

  // Build table
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const tbody = document.createElement("tbody");

  const headerRow = document.createElement("tr");
  colIndexes.forEach(i => {
    const th = document.createElement("th");
    th.textContent = typeof fullHeader[i] === "object" ? fullHeader[i].label : fullHeader[i];
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Copy buttons under headers (skip Reset Date column)
  const copyRow = document.createElement("tr");
  colIndexes.forEach((i, colIdx) => {
    const thLabel = typeof fullHeader[i] === "object" ? fullHeader[i].label : fullHeader[i];
    const td = document.createElement("td");
    if (thLabel === "Reset Date") {
      // Add the "Copy All" button under Reset Date
      const btn = document.createElement("button");
      btn.textContent = "Copy All";
      btn.className = "copy-all-btn";
      btn.addEventListener("click", () => {
        // Copy all table data (excluding copy button row)
        let data = "";
        // Header row
        const headerLabels = colIndexes.map(idx =>
          typeof fullHeader[idx] === "object" ? fullHeader[idx].label : fullHeader[idx]
        );
        data += headerLabels.join("\t") + "\n";
        // Data rows
        groupedRows.forEach(row => {
          const rowData = colIndexes.map(idx => {
            if (idx === 0) {
              const date = new Date(row[idx]);
              return mode === 'yearly'
                ? date.getFullYear()
                : mode === 'monthly'
                  ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                  : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            } else {
              return `${parseFloat(row[idx]).toFixed(2)}%`;
            }
          });
          data += rowData.join("\t") + "\n";
        });
        navigator.clipboard.writeText(data).then(() => {
          alert("All table data copied to clipboard.");
        });
      });
      td.appendChild(btn);
    } else if (thLabel !== "Reset Date") {
      const btn = document.createElement("button");
      btn.textContent = "Copy";
      btn.className = "copy-col-btn"; 
      btn.setAttribute("data-col-index", i); 
      btn.addEventListener("click", () => {
        const values = groupedRows.map(row => {
          const val = row[i];
          if (i === 0) {
            const date = new Date(val);
            return mode === 'yearly'
              ? date.getFullYear()
              : mode === 'monthly'
                ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
          } else {
            return `${parseFloat(val).toFixed(2)}%`;
          }
        });
        navigator.clipboard.writeText(values.join("\n")).then(() => {
          alert(`Column ${fullHeader[i]} copied to clipboard.`);
        });
      });
      td.appendChild(btn);
    }
    copyRow.appendChild(td);
  });
  thead.appendChild(copyRow);

  // Fill table body
  groupedRows.forEach(row => {
    const tr = document.createElement("tr");
    colIndexes.forEach(i => {
      const td = document.createElement("td");
      if (i === 0) {
        const date = new Date(row[i]);
        td.textContent = mode === 'yearly'
          ? date.getFullYear()
          : mode === 'monthly'
            ? date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      } else {
        td.textContent = `${parseFloat(row[i]).toFixed(2)}%`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  // Replace table content
  container.innerHTML = "";
  table.appendChild(thead);
  table.appendChild(tbody);
  container.appendChild(table);
}

document.querySelectorAll(".term-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Toggle .active state
    document
      .querySelectorAll(".term-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    // Determine selected term
    const term = btn.getAttribute("data-term");
    if (term === "5Y") {
      activeRange = "5y";
    } else if (term === "10Y") {
      activeRange = "10y";
    } else {
      activeRange = "custom";
    }
    processDataAndRedraw();
  });
});

document.querySelectorAll(".range-btn").forEach((button) => {
  button.addEventListener("click", () => {
    document
      .querySelectorAll(".range-btn")
      .forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    const label = button.textContent.toLowerCase();
    if (label.includes("3")) activeRange = "3y";
    else if (label.includes("5")) activeRange = "5y";
    else if (label.includes("10")) activeRange = "10y";
    else activeRange = "all";
    drawChart();
  });
});

document.getElementById("applyCustomRange")?.addEventListener("click", () => {
  activeRange = "custom";
  drawChart();
});

function addToCalendar(title, date) {
  const startDate = new Date(date);
  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + 1);
  const formatDate = (d) =>
    d
      .toISOString()
      .replace(/[-:]|(\.\d{3})/g, "")
      .slice(0, 15);
  const calendarUrl =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(title)}` +
    `&dates=${formatDate(startDate)}/${formatDate(endDate)}` +
    `&details=${encodeURIComponent("Added from Pensford Forward Curve")}` +
    `&sf=true&output=xml`;
  window.open(calendarUrl, "_blank");
}

function downloadCSV() {
  if (!transformedData || transformedData.length === 0) {
    alert("No chart data available.");
    return;
  }
  let csv = transformedData
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "ForwardCurveData.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

document.getElementById("resetCheckboxesBtn")?.addEventListener("click", () => {
  document
    .querySelectorAll(
      '.filter-panel input[type="checkbox"], .mobile-filter-drawer input[type="checkbox"]'
    )
    .forEach((cb) => {
      cb.checked = !1;
    });
  visibleCheckboxes = ["Reset Date"];
  processDataAndRedraw();
});

function smoothData(dataArray, windowSize = 5) {
  if (dataArray.length < 2) return dataArray;

  const header = dataArray[0];
  const smoothed = [header];

  for (let i = windowSize; i < dataArray.length; i++) {
    const window = dataArray.slice(i - windowSize, i);
    const avgRow = [window[window.length - 1][0]]; // keep the latest date

    for (let col = 1; col < header.length; col++) {
      let sum = 0;
      let count = 0;

      for (let j = 0; j < window.length; j++) {
        const val = parseFloat(window[j][col]);
        if (!isNaN(val)) {
          sum += val;
          count++;
        }
      }

      avgRow.push(count ? sum / count : null);
    }

    smoothed.push(avgRow);
  }

  return smoothed;
}

function generateYearlyTicks(startDate, endDate) {
  if (!startDate || !endDate || !(startDate instanceof Date) || !(endDate instanceof Date)) {
    console.warn("⚠️ Invalid start or end date passed to generateYearlyTicks");
    return [];
  }

  const ticks = [];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();

  for (let year = startYear; year <= endYear; year++) {
    ticks.push(new Date(year, 0, 1));
  }

  return ticks;
}

function getDateFromInputs(prefix) {
  const day = document.getElementById(`${prefix}Day`)?.value;
  const month = document.getElementById(`${prefix}Month`)?.value;
  const year = document.getElementById(`${prefix}Year`)?.value;

  if (!day || !month || !year) return null;

  const monthNames = {
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    August: 7,
    September: 8,
    October: 9,
    November: 10,
    December: 11
  };

  const monthIndex = monthNames[month];
  if (monthIndex === undefined) return null;

  const parsedDay = parseInt(day, 10);
  const parsedYear = parseInt(year, 10);

  if (isNaN(parsedDay) || isNaN(parsedYear)) return null;

  return new Date(parsedYear, monthIndex, parsedDay);
}

document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
  cb.addEventListener("change", () => {
    visibleCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value)
      .filter(v => v !== "Date" && v !== "Reset Date");

    visibleCheckboxes.unshift("Reset Date");
    processDataAndRedraw();
  });
});

