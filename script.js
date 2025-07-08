// === GOOGLE CHARTS ===
google.charts.load("current", { packages: ["corechart", "bar"] });
google.charts.setOnLoadCallback(loadData);

// === GLOBAL DATASETS ===
let fullProjectionData = null;    // "Market Expectations" sheet
let fullHistoricalData = null;    // "Historical/Real" sheet
let fullArchivesData = null;      // "Archives" sheet 
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

function smoothData(dataArray, windowSize = 5) {
  if (dataArray.length < 2) return dataArray;

  const header = dataArray[0];
  const smoothed = [header];

  for (let i = windowSize; i < dataArray.length; i++) {
    const window = dataArray.slice(i - windowSize, i);
    const avgRow = [window[window.length - 1][0]]; 

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
    console.warn("Invalid start or end date passed to generateYearlyTicks");
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

function loadData() {
  const dataURL = "https://script.google.com/macros/s/AKfycbzhcymTfhNgFb_RJLSOYvtTihmh8lgdzr3sD4HuHYPaJ5L5lGKhMUsmdLyhnPar9ij5bw/exec";

  fetch(dataURL)
    .then(res => res.json())
    .then(response => {
      const rawProjection = response.projection;
      const rawHistorical = response.historical;
      const rawArchives = response.archives; 

      console.log("rawProjectionData preview:", rawProjection?.slice?.(0, 3));
      console.log("rawHistoricalData preview:", rawHistorical?.slice?.(0, 3));
      console.log("rawArchivesData preview:", rawArchives?.slice?.(0, 3)); 

      if (!Array.isArray(rawProjection)) {
        console.error("'projection' is not a valid array:", rawProjection);
        return;
      }

      fullProjectionData = transformData(rawProjection);
      headers = fullProjectionData[0];

      const showHistorical = document.getElementById("historicalToggle")?.checked ?? false;

      if (showHistorical) {
        if (!Array.isArray(rawHistorical)) {
          console.error("'historical' is not a valid array:", rawHistorical);
          return;
        }
        fullHistoricalData = transformData(rawHistorical);
        console.log("fullHistoricalData rows:", fullHistoricalData?.length);
      } else {
        fullHistoricalData = null;
      }

      // ✅ Only transform archives if valid
      fullArchivesData = Array.isArray(rawArchives) ? transformData(rawArchives) : [];

      processDataAndRedraw();
    })
    .catch(error => {
      console.error("Error fetching data from Apps Script:", error);
    });
}

function transformData(rawData) {
  if (!rawData || rawData.length < 2 || !Array.isArray(rawData)) {
    console.warn("transformData(): No raw data available for transformation.");
    return [];
  }

  // Trim and normalize headers
  const headerRow = rawData[0].map(cell =>
    typeof cell === "string" ? cell.trim() : cell
  );
  console.log("Raw HEADER:", headerRow);

  const dateColIndex = headerRow.findIndex(h => h === "Reset Date");
  console.log("Found 'Reset Date' at index:", dateColIndex);

  if (dateColIndex === -1) {
    console.error("transformData(): 'Reset Date' column not found.");
    return [];
  }

  // Start building transformed data
  const transformed = [headerRow];
  let validRowCount = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const dateValue = row[dateColIndex];

    if (!dateValue || isNaN(new Date(dateValue))) {
      continue; // Skip if no valid date
    }

    const parsedDate = new Date(dateValue);
    const transformedRow = [...row];
    transformedRow[dateColIndex] = parsedDate;

    // Log samples if needed
    if (i >= 100 && i < 125) {
      console.log(
        `Row ${i} raw date value:`,
        dateValue,
        "| type:",
        typeof dateValue
      );
    }

    transformed.push(transformedRow);
    validRowCount++;
  }

  console.log(`transformData() rows returned: ${validRowCount}`);
  return transformed;
}

function transformData(rawData) {
  if (!rawData || rawData.length < 2 || !Array.isArray(rawData)) {
    console.warn("transformData(): No raw data available for transformation.");
    return [];
  }

  const headerRow = rawData[0].map(cell =>
    typeof cell === "string" ? cell.trim() : cell
  );
  console.log("Raw HEADER:", headerRow);

  const dateColIndex = headerRow.findIndex(h => h === "Reset Date");
  console.log("Found 'Reset Date' at index:", dateColIndex);

  if (dateColIndex === -1) {
    console.error("transformData(): 'Reset Date' column not found.");
    return [];
  }

  const transformed = [headerRow];
  let validRowCount = 0;

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const dateValue = row[dateColIndex];

    if (!dateValue || isNaN(new Date(dateValue))) continue;

    const parsedDate = new Date(dateValue);
    const transformedRow = [...row];
    transformedRow[dateColIndex] = parsedDate;

    if (i >= 100 && i < 125) {
      console.log(
        `Row ${i} raw date value:`,
        dateValue,
        "| type:",
        typeof dateValue
      );
    }

    transformed.push(transformedRow);
    validRowCount++;
  }

  if (validRowCount === 0) {
    console.warn("transformData(): No valid rows after date parsing.");
    return [];
  }

  console.log(`transformData() rows returned: ${validRowCount}`);
  return transformed;
}

function processDataAndRedraw() {
  const showHistorical = document.getElementById("historicalToggle")?.checked ?? false;
  const sinceDateStr = document.getElementById("sinceDateInput")?.value;
  const sinceDate = sinceDateStr ? new Date(sinceDateStr) : null;

  const showArchival = document.getElementById("archivalToggle")?.checked ?? false;
  const asOfDateStr = document.getElementById("asOfDate")?.value;
  const asOfDate = asOfDateStr ? new Date(asOfDateStr) : null;

  console.log("📌 showHistorical toggle?", showHistorical);
  console.log("📅 sinceDate input:", sinceDateStr, "| parsed:", sinceDate);
  console.log("📌 archival toggle?", showArchival);
  console.log("📅 asOfDate input:", asOfDateStr, "| parsed:", asOfDate);

  let cleanedProjection = Array.isArray(fullProjectionData) ? fullProjectionData : [];
  let cleanedHistorical = Array.isArray(fullHistoricalData) ? fullHistoricalData : [];
  let cleanedArchives = Array.isArray(fullArchivesData) ? fullArchivesData : [];

  console.log("📦 cleanedProjection", cleanedProjection?.slice?.(0, 3));
  console.log("📦 cleanedHistorical", cleanedHistorical?.slice?.(0, 3));
  console.log("📦 cleanedArchives", cleanedArchives?.slice?.(0, 3));

  let merged = [];

  function normalizeDate(date) {
    return date?.toISOString()?.split?.("T")?.[0];
  }

  if (showArchival && asOfDate instanceof Date && !isNaN(asOfDate.getTime())) {
    const asOfStr = normalizeDate(asOfDate);
    console.log("📁 Using archival data for as-of date:", asOfDate, "| normalized:", asOfStr);

    const archiveHeader = cleanedArchives[0];
    const rawArchives = cleanedArchives.slice(1);

    const filtered = rawArchives.filter(row => normalizeDate(new Date(row[0])) === asOfStr);

    if (filtered.length > 0) {
      console.log(`📦 matched archival rows for ${asOfStr}:`, filtered.length);
      // Remove the as-of column (first col), keep reset date + series
      merged = [
        ["Reset Date", ...archiveHeader.slice(2)],
        ...filtered.map(row => [new Date(row[1]), ...row.slice(2).map(val => {
          const parsed = typeof val === "string" ? parseFloat(val.replace("%", "")) / 100 : val;
          return isNaN(parsed) ? null : parsed;
        })])
      ];
    } else {
      console.warn("⚠️ No matching archival rows for selected as-of date.");
      document.getElementById("chart_div").innerHTML =
        "<p style='color:red;'>No archival data found for the selected As Of date.</p>";
      return;
    }
  } else if (showHistorical && cleanedHistorical.length > 1) {
    console.log("✅ Running mergeWithHistorical");
    merged = mergeWithHistorical(cleanedProjection, cleanedHistorical, sinceDate);
  } else {
    console.log("❌ mergeWithHistorical skipped: using projection-only fallback");
    merged = cleanedProjection;
  }

  if (!merged || merged.length < 2) {
    console.error("❌ No data to render after processing.");
    return;
  }

  // ✅ Final filter to honor sinceDate across the entire merged dataset
  if (sinceDate instanceof Date && !isNaN(sinceDate.getTime())) {
    const headerRow = merged[0];
    merged = [headerRow, ...merged.slice(1).filter(row => {
      const date = row[0];
      return date instanceof Date && date >= sinceDate;
    })];
  }

  transformedData = merged;

  // ✅ Now define currentStartDate and currentEndDate window
  const earliestDate = transformedData[1]?.[0];
  const fallbackStart = new Date();
  fallbackStart.setFullYear(fallbackStart.getFullYear() - 1);

  const viewStart = earliestDate instanceof Date ? earliestDate : fallbackStart;

  // Dynamically choose end date based on activeRange (3y, 5y, 10y)
  let yearsToAdd = 10;
  if (activeRange === "5y") yearsToAdd = 5;
  else if (activeRange === "3y") yearsToAdd = 3;

  const viewEnd = new Date(viewStart);
  viewEnd.setFullYear(viewEnd.getFullYear() + yearsToAdd);

  window.currentStartDate = viewStart;
  window.currentEndDate = viewEnd;

  console.log("🧪 FINAL transformedData HEADERS:", transformedData[0]);
  drawChart(viewStart, viewEnd);
}

function mergeWithHistorical(proj, hist, sinceDate) {
  if (!Array.isArray(proj) || proj.length < 2 || !Array.isArray(hist) || hist.length < 2) {
    console.error("mergeWithHistorical: Missing or empty data arrays.");
    return proj;
  }

  const projHeaders = proj[0].slice(1); 
  const histHeaders = hist[0].slice(1); 
  const commonHeaders = projHeaders.filter(label => histHeaders.includes(label));

  const dateMap = new Map();

  // Filtered Historical Rows
  for (let i = 1; i < hist.length; i++) {
    const row = hist[i];
    const date = row[0];

    // Ensure it's a valid Date
    if (!(date instanceof Date) || isNaN(date)) continue;

    // Skip if before sinceDate
    if (sinceDate instanceof Date && !isNaN(sinceDate) && date < sinceDate) {
      continue;
    }

    const key = +date;
    if (!dateMap.has(key)) {
      dateMap.set(key, { date, hist: {}, proj: {} });
    }

    for (let j = 1; j < row.length; j++) {
      const label = hist[0][j];
      if (commonHeaders.includes(label)) {
        const val = typeof row[j] === "number" ? row[j] : parseFloat(row[j]);
        dateMap.get(key).hist[label] = isNaN(val) ? null : val;
      }
    }
  }

  // 2. Projection Rows (no sinceDate filter)
  for (let i = 1; i < proj.length; i++) {
    const row = proj[i];
    const date = row[0];
    if (!(date instanceof Date) || isNaN(date)) continue;

    const key = +date;
    if (!dateMap.has(key)) {
      dateMap.set(key, { date, hist: {}, proj: {} });
    }

    for (let j = 1; j < row.length; j++) {
      const label = proj[0][j];
      if (commonHeaders.includes(label)) {
        const val = typeof row[j] === "number" ? row[j] : parseFloat(row[j]);
        dateMap.get(key).proj[label] = isNaN(val) ? null : val;
      }
    }
  }

  // 3. Construct Final Output
  const mergedHeaders = ['Reset Date'];
  commonHeaders.forEach(label => {
    mergedHeaders.push(`${label} (Hist)`);
    mergedHeaders.push(`${label} (Proj)`);
  });

  const mergedRows = [mergedHeaders];

  const sortedDates = Array.from(dateMap.values()).sort((a, b) => a.date - b.date);
  for (const entry of sortedDates) {
    const row = [entry.date];
    commonHeaders.forEach(label => {
      row.push(entry.hist[label] ?? null);
      row.push(entry.proj[label] ?? null);
    });
    mergedRows.push(row);
  }

  console.log("mergeWithHistorical complete:", mergedRows.length, "rows");
  return mergedRows;
}

function drawChart(startDate, endDate) {
  if (!transformedData || transformedData.length < 2) return;

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
  const showArchival = document.getElementById("archivalToggle")?.checked ?? false;

  const filteredIndexes = fullHeader
    .map((label, i) => {
      if (i === 0) return i;
      const baseLabel = label.replace(" (Hist)", "").replace(" (Proj)", "").replace(" (Archival)", "");
      return visibleCheckboxes.includes(baseLabel) ? i : -1;
    })
    .filter(i => i !== -1);

  if (filteredIndexes.length <= 1) {
    document.getElementById("chart_div").innerHTML =
      "<p style='color:red;'>Please select at least one data series to display the chart.</p>";
    return;
  }

  let dataArray = transformedData.map(row => filteredIndexes.map(i => row[i]));

  const smoothingToggle = document.getElementById("smoothingToggle");
  if (smoothingToggle?.checked) {
    dataArray = smoothData(dataArray, 5);
  }

  // Calculate Y bounds
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < dataArray.length; i++) {
    for (let j = 1; j < dataArray[i].length; j++) {
      const val = dataArray[i][j];
      if (typeof val === "number" && isFinite(val)) {
        minY = Math.min(minY, val);
        maxY = Math.max(maxY, val);
      }
    }
  }
  if (!isFinite(minY)) minY = 0;
  if (!isFinite(maxY)) maxY = 1;
  const paddedMinY = minY;
  const paddedMaxY = maxY + (maxY - minY) * 0.05;

  const includeDivider = showHistorical;
  if (includeDivider) {
    dataArray[0].push("Divider");
    const numCols = dataArray[0].length;
    const nulls = Array(numCols - 2).fill(null);
    const dividerDate = new Date(today);

    for (let i = 1; i < dataArray.length; i++) {
      dataArray[i].push(null);
    }

    dataArray.push([dividerDate, ...nulls, paddedMinY]);
    dataArray.push([dividerDate, ...nulls, paddedMaxY]);
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
      crosshair: {
        trigger: 'selection',
        orientation: 'vertical',
        color: '#000000'
      },
      hAxis: {
        title: 'Date',
        format: 'yyyy',
        slantedText: false,
        ticks: generateYearlyTicks(startDate, endDate),
        viewWindow: {
          min: startDate,
          max: endDate
        },
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
      "3M Term SOFR": "#876FD4",
      "30D Average SOFR (NYFED)": "#f57c00",
      "Overnight SOFR": "#6a1b9a",
      "Simple Average SOFR": "#00838f",
      "1M ISDA SOFR": "#5d4037",
      "Prime": "#e65100",
      "FOMC DOT Plot": "#2e7d32"
    };

    for (let i = 1; i < header.length; i++) {
      const label = header[i];
      const baseLabel = label.replace(" (Hist)", "").replace(" (Proj)", "").replace(" (Archival)", "");
      const isArchival = label.includes(" (Archival)");
      let hasHistorical = false;
      let hasProjection = false;

      for (let j = 1; j < dataArray.length; j++) {
        const rowDate = dataArray[j][0];
        const value = dataArray[j][i];
        if (value != null && rowDate instanceof Date) {
          if (rowDate < today) hasHistorical = true;
          if (rowDate >= today) hasProjection = true;
        }
      }

      const isHistoricalOnly = showHistorical && hasHistorical && !hasProjection;
      let seriesColor = colorMap[baseLabel] || "#000000";
      let seriesStyle = {};

      if (isHistoricalOnly) {
        seriesStyle = { color: "#4caf50" };
      } else if (highlightActuals && baseLabel.toLowerCase().includes("actual")) {
        seriesStyle = { color: "#d32f2f" };
      } else if (showArchival && isArchival) {
        seriesStyle = {
          color: "#888888",
          lineDashStyle: [4, 4],
          lineWidth: 2
        };
      } else {
        seriesStyle = { color: seriesColor };
      }

      options.series[i - 1] = seriesStyle;
    }

    if (includeDivider) {
      options.series[header.length - 2] = {
        color: 'black',
        lineDashStyle: null,
        lineWidth: 2
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

function renderForwardCurveTable(_startDateInput, _endDateInput, mode = 'daily') {
  if (!transformedData || transformedData.length < 2) {
    console.warn("No transformed data available.");
    return;
  }

  const container = document.getElementById("forwardCurveTableContainer");
  if (!container) return;

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
  colIndexes.forEach((i) => {
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

    // Show moda
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

function handleRangeButtonClick(button) {
  // Remove 'active' from all buttons in both groups
  document.querySelectorAll(".term-btn, .range-btn").forEach((btn) => {
    btn.classList.remove("active");
  });
  button.classList.add("active");

  // Determine selected range
  const label = button.textContent.toLowerCase();
  if (label.includes("3")) activeRange = "3y";
  else if (label.includes("5")) activeRange = "5y";
  else if (label.includes("10")) activeRange = "10y";
  else activeRange = "all";

  processDataAndRedraw();
}

// Attach to both types
document.querySelectorAll(".term-btn, .range-btn").forEach((btn) => {
  btn.addEventListener("click", () => handleRangeButtonClick(btn));
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

document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
  cb.addEventListener("change", () => {
    visibleCheckboxes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
      .map(cb => cb.value)
      .filter(v => v !== "Date" && v !== "Reset Date");

    visibleCheckboxes.unshift("Reset Date");
    processDataAndRedraw();
  });
});

document.addEventListener("DOMContentLoaded", function () {
  const historicalToggle = document.getElementById("historicalToggle");
  const sinceDateInput = document.getElementById("sinceDateInput");

  if (historicalToggle) {
    historicalToggle.addEventListener("change", () => {
      console.log("Historical toggle changed. Reloading data...");
      loadData(); 
    });
  }

  if (sinceDateInput) {
    sinceDateInput.addEventListener("change", () => {
      console.log("Since date changed — redrawing chart");
      processDataAndRedraw();
    });
  }
});
