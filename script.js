google.charts.load("current", {
  packages: ["corechart", "bar"],
});
google.charts.setOnLoadCallback(loadData);
let fullData = [], headers = [], transformedData = [];
let activeRange = "3y";
let visibleCheckboxes = ["Date"];
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

function processDataAndRedraw() {
  if (!fullData || fullData.length < 2) {
    console.error("No data to process");
    return;
  }

  const headerRow = fullData[0];
  const dataRows = fullData.slice(1);
  const dateIndex = headerRow.findIndex(h => h.toLowerCase().includes("date"));
  if (dateIndex === -1) {
    console.error("No date column found in headers.");
    return;
  }

  // Build start and end dates based on since date and term range
  const sinceDay = document.getElementById("sinceDay")?.value;
  const sinceMonth = document.getElementById("sinceMonth")?.value;
  const sinceYear = document.getElementById("sinceYear")?.value;
  let startDate;

  if (sinceDay && sinceMonth && sinceYear) {
    const combined = `${sinceMonth} ${sinceDay}, ${sinceYear}`;
    const parsed = new Date(combined);
    startDate = isNaN(parsed.getTime()) ? new Date(`${new Date().getFullYear()}-01-01`) : parsed;
  } else {
    startDate = new Date(`${new Date().getFullYear()}-01-01`);
  }

  let yearSpan = 10;
  if (activeRange === "5y" || activeRange === "5Y") yearSpan = 5;
  const endDate = new Date(startDate.getFullYear() + yearSpan, 11, 31);

  // Parse, clean, and filter
  const parsedRows = dataRows
    .map(row => {
      const rawDate = row[dateIndex];
      const parsedDate = new Date(rawDate);
      if (isNaN(parsedDate.getTime())) return null;
      return { date: parsedDate, values: row };
    })
    .filter(obj => obj && obj.date >= startDate && obj.date <= endDate);

  // Grouping
  const grouped = {};
  parsedRows.forEach(({ date, values }) => {
    const key = viewMode === "monthly"
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      : viewMode === "yearly"
        ? `${date.getFullYear()}`
        : date.toISOString().split("T")[0];

    if (!grouped[key]) {
      grouped[key] = { count: 0, sums: Array(values.length).fill(0) };
    }

    grouped[key].count++;
    values.forEach((val, i) => {
      const num = parseFloat(val);
      if (!isNaN(num)) {
        grouped[key].sums[i] += num;
      } else {
        grouped[key].sums[i] = val;
      }
    });
  });

  // Averaging
  const averagedData = Object.entries(grouped).map(([label, obj]) => {
    const avg = obj.sums.map((sum, i) => {
      if (i === dateIndex) {
        if (viewMode === "yearly") return new Date(Number(label), 0, 1);
        if (viewMode === "monthly") {
          const [y, m] = label.split("-");
          return new Date(Number(y), Number(m) - 1, 1);
        }
        return new Date(label);
      }
      return typeof sum === "number" ? sum / obj.count : sum;
    });
    return avg;
  });

  transformedData = [headerRow, ...averagedData];
  cachedGroupedData = averagedData;

  drawChart(startDate, endDate);
  renderForwardCurveTable(startDate, endDate, tableViewMode);
}
function loadData() {
  const url =  "https://script.google.com/macros/s/AKfycbzHFuyzb14srQh4moOB2fXzu_hFKA9QFaroaCgEdsS5b17ikQHqj-KvQ_EkTshqIUZvCg/exec?sheet=Floating"; // Replace with your URL

  fetch(url)
    .then(response => response.json())
    .then(data => {
      console.log("Fetched data:", data);
      drawChart(data);
    })
    .catch(error => {
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

function drawChart(dataArray) {
  const data = google.visualization.arrayToDataTable(dataArray);

  const options = {
  legend: { position: 'bottom' },
  hAxis: {
    title: 'Reset Date',
    format: 'yyyy',
    slantedText: false,
    showTextEvery: 30,
    gridlines: { count: 8 }
  },
  vAxis: {
    format: '#.##%'  // displays as percentages
  },
  series: {
    0: { color: '#d62728', lineWidth: 1.5 }
  }
};


  const chart = new google.visualization.LineChart(document.getElementById('chart_div'));
  chart.draw(data, options);
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
  const month = today.getMonth(); // 0-indexed
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
      opt.value = y;
      opt.textContent = y;
      if (y === year) opt.selected = true;
      asOfYear.appendChild(opt);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Element references
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

  // ---- Set Current Date for As-Of ----
  const todayStr = new Date().toISOString().split("T")[0];
  const asOfDesktop = document.getElementById("asOfDate");
  const asOfMobile = document.getElementById("mobileAsOfDate");
  if (asOfDesktop) {
    asOfDesktop.value = todayStr;
    asOfDesktop.disabled = true;
  }
  if (asOfMobile) {
    asOfMobile.value = todayStr;
    asOfMobile.disabled = true;
  }

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

  const parseDate = val => {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  };

  const startDate = parseDate(startDateInput) || new Date(new Date().getFullYear(), 0, 1);
  const endDate = parseDate(endDateInput) || new Date(new Date().getFullYear() + 10, 11, 31);

  const fullHeader = transformedData[0];
  const dateIndex = 0;

  // Columns to keep: always keep date column (index 0), plus any visible checkboxes
  const colIndexes = fullHeader.map((label, i) => {
    if (i === 0 || visibleCheckboxes.includes(label)) return i;
    return -1;
  }).filter(i => i !== -1);

  const filteredRows = transformedData.slice(1).filter(row => {
    const date = new Date(row[dateIndex]);
    return date >= startDate && date <= endDate;
  });

  // Grouping logic
  let groupedRows;
  if (mode === 'monthly' || mode === 'yearly') {
    const grouped = {};

    filteredRows.forEach(row => {
      const date = new Date(row[0]);
      let key = mode === 'monthly'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        : `${date.getFullYear()}`;

      if (!grouped[key]) {
        grouped[key] = { count: 0, sum: Array(row.length).fill(0) };
      }

      for (let i = 1; i < row.length; i++) {
        grouped[key].sum[i] += row[i];
      }

      grouped[key].sum[0] = date;
      grouped[key].count++;
    });

    groupedRows = Object.values(grouped).map(group => {
      const avg = [...group.sum];
      for (let i = 1; i < avg.length; i++) {
        avg[i] = group.count ? avg[i] / group.count : 0;
      }
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

  groupedRows.forEach(row => {
    const tr = document.createElement("tr");
    colIndexes.forEach((i, idx) => {
      const td = document.createElement("td");
      if (i === 0) {
        const date = new Date(row[i]);
        td.textContent = mode === 'yearly'
          ? date.getFullYear()
          : mode === 'monthly'
            ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : date.toLocaleDateString();
      } else {
        // ✅ Fix: do not multiply by 100 — values already in percentage units
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

