google.charts.load("current", {
  packages: ["corechart", "bar"],
});
google.charts.setOnLoadCallback(loadData);
let fullData = [], headers = [], transformedData = [];
let activeRange = "3y";
let visibleCheckboxes = ["Reset Date", "1M Term SOFR", "3M Term SOFR", "30D Average SOFR (NYFED)"];
let viewMode = "daily";
let tableViewMode = "daily";
let dataCache = { key: null, grouped: null, averaged: null };

let redrawTimeout;
function debounceRedraw() {
  clearTimeout(redrawTimeout);
  redrawTimeout = setTimeout(() => {
    processDataAndRedraw();
  }, 250); 
}

let cachedParams = {};
let cachedGroupedData = [];
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
        const date = new Date(row[j]);
        if (isNaN(date.getTime())) break;
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

  return cleaned;
}

function processDataAndRedraw() {
  if (!fullData || fullData.length < 2) {
    console.error("No full data to process.");
    return;
  }

  const dateIndex = headers.indexOf("Reset Date");
  if (dateIndex === -1) {
    console.error("'Reset Date' column not found.");
    return;
  }

  // Extract valid dates
  const allDates = fullData.slice(1)
    .map(row => new Date(row[dateIndex]))
    .filter(d => !isNaN(d));

  if (!allDates.length) {
    console.error("No valid dates found in dataset.");
    return;
  }

  // Determine fallback date range: 10 years from earliest date
  const minDataDate = new Date(Math.min(...allDates));
  const defaultStart = new Date(minDataDate.getFullYear(), 0, 1);
  const defaultEnd = new Date(minDataDate.getFullYear() + 10, 11, 31);

  // Use input values if available
  const inputStart = document.getElementById("startDateInput")?.value;
  const inputEnd = document.getElementById("endDateInput")?.value;

  const startDate = inputStart ? new Date(inputStart) : defaultStart;
  const endDate = inputEnd ? new Date(inputEnd) : defaultEnd;

  console.log("Using Start:", startDate, "End:", endDate);

  // Filter rows within date range
  const filteredRows = fullData.slice(1).filter(row => {
    const d = new Date(row[dateIndex]);
    return d >= startDate && d <= endDate;
  });

  console.log("Parsed rows in date range:", filteredRows.length);
  if (!filteredRows.length) {
    console.warn("No data rows passed the date range filter.");
  }

  // Build transformedData to be used by drawChart
  transformedData = [headers, ...filteredRows];
  drawChart(); // Call chart rendering
}

function loadData() {
  const url =
    "https://script.google.com/macros/s/AKfycbzHFuyzb14srQh4moOB2fXzu_hFKA9QFaroaCgEdsS5b17ikQHqj-KvQ_EkTshqIUZvCg/exec?sheet=Floating";

  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      console.log("Raw fetched data:", data);
      if (!data || data.length < 2) {
        console.error("Insufficient data from Apps Script");
        return;
      }

      const transformed = transformData(data);

      if (transformed.length < 2) {
        console.error("No valid rows after transformation.");
        return;
      }

      fullData = transformed;
      headers = transformed[0];
      processDataAndRedraw();
    })
    .catch((error) => {
      console.error("Fetch error:", error);
    });
}

// Helper to parse dropdown-based date selectors
function parseSelectorDate(dayId, monthId, yearId) {
  const day = document.getElementById(dayId)?.value;
  const month = document.getElementById(monthId)?.value;
  const year = document.getElementById(yearId)?.value;

  if (!day || !month || !year) return null;

  const parsed = new Date(`${month} ${day}, ${year}`);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function getYearTicks(startDate, endDate) {
  const ticks = [];
  const startYear = startDate.getFullYear();
  const endYear = endDate.getFullYear();
  for (let year = startYear; year <= endYear; year++) {
    ticks.push(new Date(year, 0, 1)); // Jan 1 of each year
  }
  return ticks;
}

function generateYearTicks(startDate, endDate) {
  const ticks = [];
  const current = new Date(startDate.getFullYear(), 0, 1);
  const final = new Date(endDate.getFullYear(), 0, 1);
  while (current <= final) {
    ticks.push(new Date(current));
    current.setFullYear(current.getFullYear() + 1);
  }
  return ticks;
}

function drawChart(startDate = new Date(2019, 0, 1), endDate = new Date(2025, 11, 31)) {
  if (!transformedData || transformedData.length < 2) {
    console.warn("Not enough data to draw the chart.");
    return;
  }

  window.currentStartDate = startDate;
  window.currentEndDate = endDate;

  console.log("Drawing chart with range:", startDate, "to", endDate);

  const fullHeader = transformedData[0];

  // Filter columns based on visibleCheckboxes
  const filteredIndexes = fullHeader
    .map((label, i) => (i === 0 || visibleCheckboxes.includes(label)) ? i : -1)
    .filter(i => i !== -1);

  if (filteredIndexes.length <= 1) {
    console.warn("Please select at least one data series to render the chart.");
    const chartDiv = document.getElementById("chart_div");
    if (chartDiv) {
      chartDiv.innerHTML = "<p style='color:red;'>Please select at least one data series to display the chart.</p>";
    }
    return;
  }

  //Build data array with only selected columns
  let dataArray = transformedData.map(row => filteredIndexes.map(i => row[i]));

  //Smoothing toggle
  const smoothingToggle = document.getElementById("smoothingToggle");
  if (smoothingToggle?.checked) {
    dataArray = smoothData(dataArray, 5);
  }

  try {
    const data = google.visualization.arrayToDataTable(dataArray);
    const header = dataArray[0];

    const asOfDate = getDateFromInputs("asOf") || new Date();
    const highlightActuals = document.getElementById("actualsToggle")?.checked ?? false;
    const showHistorical = document.getElementById("historicalToggle")?.checked ?? false;

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
          bold: false,
          color: '#333'
        },
        showColorCode: true, // shows the color boxes like in your screenshot
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
      "30D Average SOFR (NYFED)": "#f57c00"   
    };

    for (let i = 1; i < header.length; i++) {
      const label = header[i];
      const color = colorMap[label] || "#9e9e9e"; 

      const seriesOptions = {
        color: highlightActuals && label.includes("Actual") ? "#d32f2f" : color
      };

      if (showHistorical) {
        const hasHistorical = dataArray.some(row => row[0] instanceof Date && row[0] < asOfDate);
        if (hasHistorical) {
          seriesOptions.lineDashStyle = [4, 4];
        }
      }

      options.series[i - 1] = seriesOptions;
    }

    const chart = new google.visualization.LineChart(document.getElementById("chart_div"));
    chart.draw(data, options);

    //Update the table to match current view
    renderForwardCurveTable(startDate, endDate, viewMode);

  } catch (err) {
    console.error("Chart rendering error:", err);
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

  // Add event listeners to trigger re-render
  ["sinceDay", "sinceMonth", "sinceYear"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("change", () => {
        processDataAndRedraw();
      });
    }
  });
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
      opt.value = m.toString(); // still 0-indexed for JS Date
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

function updateFormattedDates() {
  const formatOptions = { year: "numeric", month: "long", day: "numeric" };

  // Commentary
  const commentaryEl = document.querySelector(".commentaryDate");
  const commentaryInput = document.getElementById("commentaryDateInput");
  if (commentaryEl) {
    const commentaryDate = commentaryInput?.value ? new Date(commentaryInput.value) : new Date();
    commentaryEl.textContent = commentaryDate.toLocaleDateString("en-US", formatOptions);
  }

  // Since
  const sinceOut = document.getElementById("sinceFormattedDate");
  const sincePicker = document.getElementById("sinceDateInput");
  const sinceDropdown = getDateFromInputs("since");
  const sinceDate = sincePicker?.value ? new Date(sincePicker.value) : sinceDropdown;
  if (sinceOut && sinceDate) {
    sinceOut.textContent = sinceDate.toLocaleDateString("en-US", formatOptions);
  }

  // As Of
  const asOfOut = document.getElementById("asOfFormattedDate");
  const asOfPicker = document.getElementById("asOfDateInput");
  const asOfDropdown = getDateFromInputs("asOf");
  const asOfDate = asOfPicker?.value ? new Date(asOfPicker.value) : asOfDropdown;
  if (asOfOut && asOfDate) {
    asOfOut.textContent = asOfDate.toLocaleDateString("en-US", formatOptions);
  }
}

document.addEventListener("DOMContentLoaded", () => {
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

      // When chart tab is shown, draw chart
      drawChart(currentStartDate, currentEndDate);
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
  updateFormattedDates();
});

function renderForwardCurveTable(startDateInput, endDateInput, mode = 'daily') {
  if (!transformedData || transformedData.length < 2) {
    console.warn("No transformed data available.");
    return;
  }

  const container = document.getElementById("forwardCurveTableContainer");
  if (!container) return;

  // Parse dates safely
  const parseDate = val => {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const startDate = window.currentStartDate || new Date(2019, 0, 1);
  const endDate = window.currentEndDate || new Date(2025, 11, 31);

  console.log("Table Start Date:", startDate.toISOString());
  console.log("Table End Date:", endDate.toISOString());

  const fullHeader = transformedData[0];
  const dateIndex = 0;

  // Determine which columns to include
  const colIndexes = fullHeader.map((label, i) => {
    if (i === 0 || visibleCheckboxes.includes(label)) return i;
    return -1;
  }).filter(i => i !== -1);

  console.log("Visible Columns (indexes):", colIndexes);
  console.log("Visible Column Labels:", visibleCheckboxes);

  // Filter rows within selected date range
  const filteredRows = transformedData.slice(1).filter(row => {
    const rowDate = new Date(row[dateIndex]).setHours(0, 0, 0, 0);
    const start = new Date(startDate).setHours(0, 0, 0, 0);
    const end = new Date(endDate).setHours(0, 0, 0, 0);
    return rowDate >= start && rowDate <= end;
  });

  console.log("Filtered rows within date range:", filteredRows.length);
  if (filteredRows.length === 0) {
    console.warn("No rows matched the date range.");
  }

  // Handle grouping for monthly or yearly modes
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

    console.log(`Grouped (${mode}) row count:`, groupedRows.length);
  } else {
    groupedRows = filteredRows;
    console.log("Daily (raw) row count:", groupedRows.length);
  }

  // Table rendering
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
            : date.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              });
      } else {

        td.textContent = `${parseFloat(row[i]).toFixed(2)}%`;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);

  console.log("Table rendering complete.");
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
  visibleCheckboxes = ["Date"];
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
  const ticks = [];
  let current = new Date(startDate.getFullYear(), 0, 1);
  while (current <= endDate) {
    ticks.push(new Date(current));
    current.setFullYear(current.getFullYear() + 1);
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

