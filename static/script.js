/**
 * IoT Patient Monitoring Dashboard Controller (script.js)
 * ------------------------------------------------------
 * Updated Version:
 * 1. Plots line charts using a sliding window of the last 15 records.
 * 2. Parses incoming diagnostic telemetry: Patient State, Battery, WiFi RSSI.
 * 3. Assesses clinical Composite Risk levels (Low, Moderate, High).
 * 4. Scans historical records to dynamically generate a Telemetry Event Log.
 * 5. Compiles and exports telemetry logs as CSV directly in the browser.
 */

// Global state trackers
let heartRateChart, spo2Chart, tempChart;
let globalTelemetryHistory = []; // Cached array for CSV export

// HTML Element references
const connectionDot = document.getElementById('connection-dot');
const connectionStatus = document.getElementById('connection-status');
const lastUpdatedTime = document.getElementById('last-updated-time');
const jsonConsole = document.getElementById('json-console');

// Stat values
const valHeartRate = document.getElementById('val-heart-rate');
const valSpo2 = document.getElementById('val-spo2');
const valTemp = document.getElementById('val-temp');

// Card elements (for alert highlights)
const cardHR = document.getElementById('card-heart-rate');
const cardSpo2 = document.getElementById('card-spo2');
const cardTemp = document.getElementById('card-temp');

const statusHeartRate = document.getElementById('status-heart-rate');
const statusSpo2 = document.getElementById('status-spo2');
const statusTemp = document.getElementById('status-temp');

// New Diagnostics fields in Header
const patientStateDisplay = document.getElementById('patient-state-display');
const batteryDisplay = document.getElementById('battery-display');
const batteryIcon = document.getElementById('battery-icon');
const rssiDisplay = document.getElementById('rssi-display');
const rssiIcon = document.getElementById('rssi-icon');

// Risk Index fields
const riskBox = document.getElementById('risk-box');
const riskBadge = document.getElementById('risk-badge');
const riskDesc = document.getElementById('risk-desc');

// Event Log fields
const eventLogTbody = document.getElementById('event-log-tbody');

// Clinical pretty names mapping for patient states
const STATE_LABELS = {
    'resting': 'Resting',
    'normal': 'Normal Activity',
    'walking': 'Walking',
    'exercise': 'Exercising',
    'recovery': 'Recovering'
};

/**
 * Formats time from YYYY-MM-DD HH:MM:SS to HH:MM:SS
 */
function formatTime(timestampString) {
    if (!timestampString) return "";
    const parts = timestampString.split(' ');
    return parts.length > 1 ? parts[1] : timestampString;
}

/**
 * Initialize Chart.js graphs
 */
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(12, 20, 36, 0.95)',
                titleFont: { family: 'Outfit', size: 12 },
                bodyFont: { family: 'Outfit', size: 14 },
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1,
                padding: 10,
                displayColors: false
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#8c9bb4', font: { family: 'Outfit', size: 10 } }
            },
            y: {
                grid: { color: 'rgba(255, 255, 255, 0.03)', borderColor: 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: '#8c9bb4', font: { family: 'Outfit', size: 11 } }
            }
        }
    };

    // --- HEART RATE CHART SETUP ---
    const hrCtx = document.getElementById('heartRateChart').getContext('2d');
    const hrGradient = hrCtx.createLinearGradient(0, 0, 0, 200);
    hrGradient.addColorStop(0, 'rgba(255, 74, 107, 0.25)');
    hrGradient.addColorStop(1, 'rgba(255, 74, 107, 0.00)');

    heartRateChart = new Chart(hrCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#ff4a6b',
                borderWidth: 3,
                fill: true,
                backgroundColor: hrGradient,
                tension: 0.4,
                pointRadius: 2,
                pointBackgroundColor: '#ff4a6b',
                pointHoverRadius: 5
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, suggestedMin: 55, suggestedMax: 115 }
            }
        }
    });

    // --- SPO2 CHART SETUP ---
    const spo2Ctx = document.getElementById('spo2Chart').getContext('2d');
    const spo2Gradient = spo2Ctx.createLinearGradient(0, 0, 0, 200);
    spo2Gradient.addColorStop(0, 'rgba(0, 242, 254, 0.25)');
    spo2Gradient.addColorStop(1, 'rgba(0, 242, 254, 0.00)');

    spo2Chart = new Chart(spo2Ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#00f2fe',
                borderWidth: 3,
                fill: true,
                backgroundColor: spo2Gradient,
                tension: 0.4,
                pointRadius: 2,
                pointBackgroundColor: '#00f2fe',
                pointHoverRadius: 5
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, suggestedMin: 88, suggestedMax: 100 }
            }
        }
    });

    // --- TEMPERATURE CHART SETUP ---
    const tempCtx = document.getElementById('tempChart').getContext('2d');
    const tempGradient = tempCtx.createLinearGradient(0, 0, 0, 200);
    tempGradient.addColorStop(0, 'rgba(255, 159, 67, 0.25)');
    tempGradient.addColorStop(1, 'rgba(255, 159, 67, 0.00)');

    tempChart = new Chart(tempCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#ff9f43',
                borderWidth: 3,
                fill: true,
                backgroundColor: tempGradient,
                tension: 0.4,
                pointRadius: 2,
                pointBackgroundColor: '#ff9f43',
                pointHoverRadius: 5
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, suggestedMin: 35.0, suggestedMax: 39.5 }
            }
        }
    });
}

/**
 * Maps device statistics (battery, rssi) and patient state to the header.
 */
function updateDiagnosticsUI(state, battery, rssi) {
    // 1. Patient State
    const prettyState = STATE_LABELS[state] || state;
    patientStateDisplay.innerText = prettyState;

    // 2. Battery Indicator
    batteryDisplay.innerText = `${battery}%`;
    batteryIcon.className = "fa-solid"; // Reset icon
    
    if (battery >= 75) {
        batteryIcon.classList.add("fa-battery-full", "text-success");
    } else if (battery >= 40) {
        batteryIcon.classList.add("fa-battery-half", "text-success");
    } else if (battery >= 20) {
        batteryIcon.classList.add("fa-battery-quarter", "text-warning");
    } else {
        batteryIcon.classList.add("fa-battery-empty", "text-danger");
    }

    // 3. RSSI Signal Indicator
    rssiDisplay.innerText = `${rssi} dBm`;
    rssiIcon.className = "fa-solid fa-wifi"; // Reset icon
    
    if (rssi >= -60) {
        rssiIcon.className = "fa-solid fa-wifi text-success";
    } else if (rssi >= -70) {
        rssiIcon.className = "fa-solid fa-wifi text-warning";
    } else {
        rssiIcon.className = "fa-solid fa-wifi text-danger";
    }
}

/**
 * Validates individual parameters and toggles alerts.
 * Returns parameter severity metrics for composite risk evaluation.
 */
function validateMetrics(hr, spo2, temp) {
    let hrSeverity = 0;   // 0 = Normal, 1 = Warning, 2 = Critical
    let spo2Severity = 0;
    let tempSeverity = 0;

    // 1. Heart Rate Alerts
    valHeartRate.innerText = hr.toFixed(1);
    statusHeartRate.className = "metric-status";
    
    if (hr > 100.0) {
        statusHeartRate.innerText = "HIGH HEART RATE";
        statusHeartRate.classList.add("status-critical");
        cardHR.classList.add("alert-active");
        hrSeverity = 2;
    } else if (hr > 95.0) {
        statusHeartRate.innerText = "Elevated";
        statusHeartRate.classList.add("status-warning");
        cardHR.classList.remove("alert-active");
        hrSeverity = 1;
    } else if (hr < 70.0) {
        statusHeartRate.innerText = "Low (Resting)";
        statusHeartRate.classList.add("status-warning");
        cardHR.classList.remove("alert-active");
        hrSeverity = 1;
    } else {
        statusHeartRate.innerText = "Normal";
        statusHeartRate.classList.add("status-normal");
        cardHR.classList.remove("alert-active");
    }

    // 2. SpO2 Alerts
    valSpo2.innerText = spo2.toFixed(1);
    statusSpo2.className = "metric-status";
    
    if (spo2 < 94.0) {
        statusSpo2.innerText = "LOW OXYGEN";
        statusSpo2.classList.add("status-critical");
        cardSpo2.classList.add("alert-active");
        spo2Severity = 2;
    } else if (spo2 === 94.0) {
        statusSpo2.innerText = "Borderline";
        statusSpo2.classList.add("status-warning");
        cardSpo2.classList.remove("alert-active");
        spo2Severity = 1;
    } else {
        statusSpo2.innerText = "Optimal";
        statusSpo2.classList.add("status-normal");
        cardSpo2.classList.remove("alert-active");
    }

    // 3. Body Temperature Alerts
    valTemp.innerText = temp.toFixed(1);
    statusTemp.className = "metric-status";
    
    if (temp > 38.0) {
        statusTemp.innerText = "FEVER ALERT";
        statusTemp.classList.add("status-critical");
        cardTemp.classList.add("alert-active");
        tempSeverity = 2;
    } else if (temp > 37.5) {
        statusTemp.innerText = "Elevated Temp";
        statusTemp.classList.add("status-warning");
        cardTemp.classList.remove("alert-active");
        tempSeverity = 1;
    } else if (temp < 36.2) {
        statusTemp.innerText = "Mild Hypothermia";
        statusTemp.classList.add("status-warning");
        cardTemp.classList.remove("alert-active");
        tempSeverity = 1;
    } else {
        statusTemp.innerText = "Normal";
        statusTemp.classList.add("status-normal");
        cardTemp.classList.remove("alert-active");
    }

    return { hrSeverity, spo2Severity, tempSeverity };
}

/**
 * Calculates a composite clinical risk status index (Low, Moderate, High).
 */
function updateRiskAssessment(hrSev, spo2Sev, tempSev) {
    riskBox.className = "risk-indicator-box"; // Reset class
    
    const maxSeverity = Math.max(hrSev, spo2Sev, tempSev);
    const warningCount = (hrSev === 1 ? 1 : 0) + (spo2Sev === 1 ? 1 : 0) + (tempSev === 1 ? 1 : 0);

    if (maxSeverity === 2 || warningCount >= 2) {
        // High Risk: 1 critical parameter or multiple warning parameters
        riskBadge.innerText = "HIGH RISK";
        riskDesc.innerText = "CRITICAL TELEMETRY ALERT! One or more biometrics have breached safe limits. Immediate clinical review is recommended.";
        riskBox.classList.add("risk-high");
    } else if (maxSeverity === 1) {
        // Moderate Risk: 1 warning parameter
        riskBadge.innerText = "MODERATE RISK";
        riskDesc.innerText = "Mild physiological fluctuations detected. Patient biometrics are slightly elevated or low. Monitor closely.";
        riskBox.classList.add("risk-mod");
    } else {
        // Low Risk: All parameters normal
        riskBadge.innerText = "LOW RISK";
        riskDesc.innerText = "All biometrics are normal, stable, and within safe boundaries. No clinical action is required.";
        riskBox.classList.add("risk-low");
    }
}

/**
 * Scans telemetry history to dynamically build a Telemetry Event Log feed.
 * Shows state transitions and threshold breaches chronologically.
 */
function compileEventLog(historyData) {
    if (historyData.length === 0) return;

    let events = [];

    // Check first record for any initial alerts
    const first = historyData[0];
    events.push({
        timestamp: first.timestamp,
        text: `Device connected. Patient state initialized: ${STATE_LABELS[first.patient_state] || first.patient_state}.`,
        severity: 'info'
    });

    // Scan records sequentially to identify changes
    for (let i = 1; i < historyData.length; i++) {
        const prev = historyData[i - 1];
        const curr = historyData[i];

        // 1. Patient State Transitions
        if (curr.patient_state !== prev.patient_state) {
            const prettyPrev = STATE_LABELS[prev.patient_state] || prev.patient_state;
            const prettyCurr = STATE_LABELS[curr.patient_state] || curr.patient_state;
            events.push({
                timestamp: curr.timestamp,
                text: `Patient state shifted from '${prettyPrev}' to '${prettyCurr}'.`,
                severity: 'info'
            });
        }

        // 2. Alert Trigger Boundaries
        // Heart Rate Alerts
        if (curr.heart_rate > 100.0 && prev.heart_rate <= 100.0) {
            events.push({
                timestamp: curr.timestamp,
                text: `High Heart Rate Alert: Heart rate reached ${curr.heart_rate} bpm.`,
                severity: 'critical'
            });
        }
        if (curr.heart_rate <= 100.0 && prev.heart_rate > 100.0) {
            events.push({
                timestamp: curr.timestamp,
                text: `Heart rate recovered to normal range: ${curr.heart_rate} bpm.`,
                severity: 'info'
            });
        }

        // SpO2 Alerts
        if (curr.spo2 < 94.0 && prev.spo2 >= 94.0) {
            events.push({
                timestamp: curr.timestamp,
                text: `Low Oxygen Alert: SpO2 dipped to ${curr.spo2}%.`,
                severity: 'critical'
            });
        }
        if (curr.spo2 >= 94.0 && prev.spo2 < 94.0) {
            events.push({
                timestamp: curr.timestamp,
                text: `Oxygen levels stabilized: SpO2 reached ${curr.spo2}%.`,
                severity: 'info'
            });
        }

        // Temperature Alerts
        if (curr.body_temperature > 38.0 && prev.body_temperature <= 38.0) {
            events.push({
                timestamp: curr.timestamp,
                text: `Fever Alert: Patient temperature rose to ${curr.body_temperature} °C.`,
                severity: 'critical'
            });
        }
        if (curr.body_temperature <= 38.0 && prev.body_temperature > 38.0) {
            events.push({
                timestamp: curr.timestamp,
                text: `Fever resolved: Body temperature dropped to ${curr.body_temperature} °C.`,
                severity: 'info'
            });
        }
    }

    // Sort events so the newest is at the top
    events.reverse();

    // Render Event Log rows
    if (events.length === 0) {
        eventLogTbody.innerHTML = `<tr><td colspan="3" class="empty-log">Telemetry stable. No warning events.</td></tr>`;
        return;
    }

    // Limit log to the last 12 events
    const displayEvents = events.slice(0, 12);
    
    eventLogTbody.innerHTML = displayEvents.map(ev => {
        let severityBadge = "";
        if (ev.severity === 'critical') {
            severityBadge = `<span class="badge-event critical">Critical</span>`;
        } else if (ev.severity === 'warning') {
            severityBadge = `<span class="badge-event warning">Warning</span>`;
        } else {
            severityBadge = `<span class="badge-event info">Info</span>`;
        }

        return `
            <tr>
                <td style="font-family: monospace; font-size: 11px;">${formatTime(ev.timestamp)}</td>
                <td>${ev.text}</td>
                <td>${severityBadge}</td>
            </tr>
        `;
    }).join('');
}

/**
 * Aggregates clinical log columns and triggers a client-side CSV download.
 */
function triggerCSVExport() {
    if (globalTelemetryHistory.length === 0) {
        alert("No telemetry history available to export yet.");
        return;
    }

    // Compile rows
    let csvRows = [];
    
    // Add Headers
    csvRows.push(["Record ID", "Device ID", "Timestamp", "Heart Rate (bpm)", "Oxygen Saturation (SpO2 %)", "Body Temp (C)", "Patient State", "Battery (%)", "Signal strength (RSSI dBm)"].join(","));
    
    // Add Data rows
    globalTelemetryHistory.forEach(item => {
        const row = [
            item.id,
            `"${item.device_id}"`,
            `"${item.timestamp}"`,
            item.heart_rate,
            item.spo2,
            item.body_temperature,
            `"${item.patient_state}"`,
            item.battery,
            item.rssi
        ];
        csvRows.push(row.join(","));
    });

    // Create a Blob from the CSV string to support larger downloads safely
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create temporary link and click
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `VITALSHIELD_telemetry_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Main database polling fetch routine.
 */
async function fetchTelemetryData() {
    try {
        const response = await fetch('/data');
        
        if (!response.ok) {
            throw new Error(`Server status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Empty state handle
        if (data.length === 0) {
            connectionDot.className = "status-dot online pulsing";
            connectionStatus.innerText = "Waiting for device...";
            jsonConsole.innerText = "// Waiting for connection. Start sensor.py to stream telemetry.";
            return;
        }

        // Cache history globally
        globalTelemetryHistory = data;

        // Set Connection badge online
        connectionDot.className = "status-dot online";
        connectionStatus.innerText = "Receiving Telemetry Stream";

        // Get latest record
        const latest = data[data.length - 1];
        lastUpdatedTime.innerText = latest.timestamp;

        // Update raw JSON preview console
        jsonConsole.innerText = JSON.stringify(latest, null, 4);
        jsonConsole.scrollTop = jsonConsole.scrollHeight;

        // Update header diagnostic badges
        updateDiagnosticsUI(latest.patient_state, latest.battery, latest.rssi);

        // Update metric values and alert borders
        const { hrSeverity, spo2Severity, tempSeverity } = validateMetrics(
            latest.heart_rate, 
            latest.spo2, 
            latest.body_temperature
        );

        // Calculate and display composite health risk severity index
        updateRiskAssessment(hrSeverity, spo2Severity, tempSeverity);

        // Scan history array to assemble Event Log feed
        compileEventLog(data);

        // --- UPDATE GRAPHS USING SLIDING HISTORY WINDOW (LAST 15 READINGS) ---
        const chartHistory = data.slice(-15);
        
        const timestamps = chartHistory.map(item => formatTime(item.timestamp));
        const heartRates = chartHistory.map(item => item.heart_rate);
        const spo2Levels = chartHistory.map(item => item.spo2);
        const temperatures = chartHistory.map(item => item.body_temperature);

        // Update HR graph
        heartRateChart.data.labels = timestamps;
        heartRateChart.data.datasets[0].data = heartRates;
        heartRateChart.update();

        // Update SpO2 graph
        spo2Chart.data.labels = timestamps;
        spo2Chart.data.datasets[0].data = spo2Levels;
        spo2Chart.update();

        // Update Temp graph
        tempChart.data.labels = timestamps;
        tempChart.data.datasets[0].data = temperatures;
        tempChart.update();

    } catch (error) {
        console.error("Dashboard fetching error:", error);
        
        // Update connection status dot to red offline alert
        connectionDot.className = "status-dot offline pulsing";
        connectionStatus.innerText = "Backend Offline";
        jsonConsole.innerText = `// ERROR: Failed to poll database.\n// Details: ${error.message}\n// Action: Verify that server.py is running.`;
        
        // Reset header items
        patientStateDisplay.innerText = "Offline";
        batteryDisplay.innerText = "--%";
        rssiDisplay.innerText = "-- dBm";
        
        // Reset card elements values
        valHeartRate.innerText = "--";
        valSpo2.innerText = "--";
        valTemp.innerText = "--";
        
        // Clear card alerts and display offline
        cardHR.classList.remove("alert-active");
        cardSpo2.classList.remove("alert-active");
        cardTemp.classList.remove("alert-active");
        
        statusHeartRate.className = "metric-status status-critical";
        statusHeartRate.innerText = "Offline";
        statusSpo2.className = "metric-status status-critical";
        statusSpo2.innerText = "Offline";
        statusTemp.className = "metric-status status-critical";
        statusTemp.innerText = "Offline";

        // Reset Risk badge
        riskBox.className = "risk-indicator-box risk-high";
        riskBadge.innerText = "OFFLINE STATUS";
        riskDesc.innerText = "Lost communication with Flask telemetry server. Check server statuses.";
    }
}

// Initialise dashboard on load
window.addEventListener('DOMContentLoaded', () => {
    // Initialise Chart.js graphs
    initCharts();
    
    // Attach event listener to CSV Download button
    document.getElementById('btn-export-csv').addEventListener('click', triggerCSVExport);
    
    // Fetch first data batch immediately
    fetchTelemetryData();
    
    // Setup 5-second polling interval
    setInterval(fetchTelemetryData, 5000);
});
