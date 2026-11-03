
"use strict";



const API_BASE = "https://ev-charging-node.onrender.com/api";

const stations = [
  { id: "STN-EV-101", name: "North Garage", power: 22, type: "AC Charger" },
  { id: "STN-EV-102", name: "Innovation Hub", power: 50, type: "DC Fast Charger" },
  { id: "STN-EV-103", name: "Library Parking", power: 7, type: "Home/AC Charger" },
  { id: "STN-EV-104", name: "Engineering Block", power: 22, type: "AC Charger" }
];

let sessions = [];
let activeSession = null;
let timerId = null;
// ---------- Storage ----------

// ---------- MongoDB API ----------

async function loadSessions() {
  try {
   const response = await fetch(`${API_BASE}/sessions`);

    const data = await response.json();

    sessions = data.map((item) => ({
     ...item,
      id: item.id || item._id,
      endedAt: item.endedAt || item.createdAt,
      hash: item.hash || item.transactionHash || ""
    }));

    if (!response.ok) {
      throw new Error("Could not load sessions from the backend.");
    }

    sessions = await response.json();

    renderDashboard();
    renderHistory();
    renderVerificationSummary();
  } catch (error) {
    console.error("Could not load sessions:", error);
    setMessage(
      "Could not load saved sessions. Check that your backend is running.",
      true
    );
  }
}

async function saveSessionToDatabase(session) {
  const response = await fetch(`${API_BASE}/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(session),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Could not save session to MongoDB.");
  }

  return result.session;
}
function money(value) {
  return "$" + Number(value || 0).toFixed(2);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map(value => String(value).padStart(2, "0"))
    .join(":");
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleString();
}

// ---------- Hashing ----------

// Keep the property order fixed so the same session produces the same hash.
function hashPayload(record) {
  return {
    id: record.id,
    userId: record.userId,
    stationId: record.stationId,
    stationName: record.stationName,
    powerKW: record.powerKW,
    energyKWh: record.energyKWh,
    tariff: record.tariff,
    cost: record.cost,
    durationSeconds: record.durationSeconds,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    previousHash: record.previousHash
  };
}

async function sha256(record) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error(
      "SHA-256 is unavailable here. Run the project through localhost using VS Code Live Server."
    );
  }

  const message = JSON.stringify(hashPayload(record));
  const bytes = new TextEncoder().encode(message);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

// ---------- Navigation ----------

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.toggle("active-page", page.id === pageId);
  });

  document.querySelectorAll(".nav-link").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  const titles = {
    dashboard: "Dashboard",
    stations: "Charging Stations",
    charging: "Start Charging",
    history: "Transaction History",
    blockchain: "Blockchain Verification"
  };

  document.getElementById("page-title").textContent =
    titles[pageId] || "Dashboard";

  if (pageId === "dashboard") renderDashboard();
  if (pageId === "stations") renderStations();
  if (pageId === "history") renderHistory();
  if (pageId === "blockchain") renderVerificationSummary();
}

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.page));
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

// ---------- Station setup ----------

function setupStations() {
  const select = document.getElementById("station-select");

  select.innerHTML = stations.map(station => `
    <option value="${station.id}">
      ${station.id} — ${station.power} kW ${station.name}
    </option>
  `).join("");

  document.getElementById("power-select").addEventListener("change", () => {
    if (!activeSession) updateSelectedStationDisplay();
  });

  select.addEventListener("change", () => {
    if (!activeSession) updateSelectedStationDisplay();
  });

  updateSelectedStationDisplay();
}

function getSelectedStation() {
  return stations.find(station =>
    station.id === document.getElementById("station-select").value
  ) || stations[0];
}

function updateSelectedStationDisplay() {
  const station = getSelectedStation();
  document.getElementById("live-station").textContent = station.id;
}


function isStationInUse(stationId) {
  return activeSession !== null &&
    activeSession.stationId === stationId;
}

function stationMarkup(station) {
  const inUse = isStationInUse(station.id);

  return `
    <div class="station-row ${inUse ? "station-in-use" : ""}"
         title="${inUse
      ? "IN USE — A charging session is active at this station."
      : "AVAILABLE — This station is ready for charging."}">
      <div>
        <strong>${escapeHTML(station.id)}</strong>
        <small>${escapeHTML(station.name)} · ${station.power} kW</small>
      </div>
      <span class="${inUse ? "in-use-label" : "online-label"}">
        ${inUse ? "● In Use" : "● Available"}
      </span>
    </div>
  `;
}



function renderStations() {
  document.getElementById("all-stations").innerHTML = stations.map(station => {
    const inUse = isStationInUse(station.id);

    return `
      <article class="station-card ${inUse ? "station-in-use" : ""}"
               title="${inUse
        ? "IN USE — This station has an active charging session."
        : "AVAILABLE — This station is ready to use."}">
        <span class="tag ${inUse ? "in-use-tag" : ""}">
          ${inUse ? "IN USE" : "AVAILABLE"}
        </span>

        <h3>${escapeHTML(station.name)}</h3>
        <p>${escapeHTML(station.id)}<br>${escapeHTML(station.type)}</p>
        <div class="station-power">${station.power} kW</div>
        <p>${inUse
        ? "A charging session is currently active at this node."
        : "Available for simulated charging."}</p>

        <button class="primary-btn"
                data-charge-station="${station.id}"
                ${inUse ? "disabled" : ""}>
          ${inUse ? "Currently In Use" : "Select Station"}
        </button>
      </article>
    `;
  }).join("");

  document.querySelectorAll("[data-charge-station]").forEach(button => {
    button.addEventListener("click", () => {
      if (activeSession) {
        alert("Stop the current charging session before changing stations.");
        return;
      }

      document.getElementById("station-select").value =
        button.dataset.chargeStation;

      updateSelectedStationDisplay();
      showPage("charging");
    });
  });
}


// ---------- Dashboard ----------

function renderDashboard() {
  const totalEnergy = sessions.reduce((sum, item) => sum + item.energyKWh, 0);
  const totalCost = sessions.reduce((sum, item) => sum + item.cost, 0);

  document.getElementById("stat-energy").innerHTML =
    `${totalEnergy.toFixed(2)} <small>kWh</small>`;
  document.getElementById("stat-sessions").textContent = sessions.length;
  document.getElementById("stat-cost").textContent = money(totalCost);

  document.getElementById("dashboard-stations").innerHTML =
    stations.map(stationMarkup).join("");

  const recent = sessions.slice().reverse().slice(0, 4);
  const container = document.getElementById("recent-transactions");

  if (!recent.length) {
    container.innerHTML = `
      <p class="empty-state">
        No charging sessions saved yet.<br>
        Start a session to see your first transaction.
      </p>`;
    return;
  }

  container.innerHTML = recent.map(item => `
    <div class="transaction-row">
      <div>
        <strong>${escapeHTML(item.stationId)}</strong>
        <small>${escapeHTML(item.userId)} · ${formatDate(item.endedAt)}</small>
      </div>
      <div style="text-align:right">
        <strong>${item.energyKWh.toFixed(3)} kWh</strong>
        <small>${money(item.cost)}</small>
      </div>
    </div>
  `).join("");
}

// ---------- Charging simulation ----------

function setMessage(message, isError = false) {
  const element = document.getElementById("charging-message");
  element.textContent = message;
  element.style.color = isError ? "var(--red)" : "var(--muted)";
}

function resetTelemetry() {
  document.getElementById("live-energy").textContent = "0.000";
  document.getElementById("live-power").textContent = "0.0 kW";
  document.getElementById("live-duration").textContent = "00:00:00";
  document.getElementById("live-cost").textContent = "$0.00";
  document.getElementById("energy-progress").style.width = "0%";
}

function updateTelemetry() {
  if (!activeSession) return;

  const energy = activeSession.energyKWh;
  const cost = energy * activeSession.tariff;

  document.getElementById("live-energy").textContent = energy.toFixed(3);
  document.getElementById("live-power").textContent =
    activeSession.powerKW.toFixed(1) + " kW";
  document.getElementById("live-duration").textContent =
    formatDuration(activeSession.durationSeconds);
  document.getElementById("live-cost").textContent = money(cost);
  document.getElementById("live-station").textContent = activeSession.stationId;
  document.getElementById("energy-progress").style.width =
    Math.min(100, (energy / 20) * 100) + "%";
}

document.getElementById("charging-form").addEventListener("submit", event => {
  event.preventDefault();

  if (activeSession) return;

  const userId = document.getElementById("user-id").value.trim();
  const tariff = Number(document.getElementById("tariff").value);
  const powerKW = Number(document.getElementById("power-select").value);
  const station = getSelectedStation();

  if (!userId) {
    setMessage("Please enter a demo user ID.", true);
    return;
  }

  if (!Number.isFinite(tariff) || tariff <= 0 || tariff > 10) {
    setMessage("Enter a tariff greater than 0 and no more than 10.", true);
    return;
  }

  if (!station || !Number.isFinite(powerKW) || powerKW <= 0) {
    setMessage("Please choose a valid station and power.", true);
    return;
  }

  activeSession = {
    id: "TX-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    userId,
    stationId: station.id,
    stationName: station.name,
    powerKW,
    energyKWh: 0,
    tariff,
    cost: 0,
    durationSeconds: 0,
    startedAt: new Date().toISOString()
  };

  document.getElementById("start-btn").disabled = true;
  document.getElementById("stop-btn").disabled = false;
  document.getElementById("station-select").disabled = true;
  document.getElementById("power-select").disabled = true;
  document.getElementById("tariff").disabled = true;
  document.getElementById("user-id").disabled = true;
  document.getElementById("live-tag").textContent = "CHARGING";
  document.getElementById("live-tag").style.color = "var(--green)";

  setMessage("Charging is running. One real second simulates one minute.");
  updateTelemetry();

  timerId = setInterval(() => {
    if (!activeSession) return;

    // One tick simulates 1 minute of charging.
    activeSession.energyKWh += activeSession.powerKW / 60;
    activeSession.durationSeconds += 60;
    updateTelemetry();
  }, 1000);
});

document.getElementById("stop-btn").addEventListener("click", stopAndSaveSession);

async function stopAndSaveSession() {
  if (!activeSession) return;

  clearInterval(timerId);
  timerId = null;

  const sessionToSave = {
    ...activeSession,
    energyKWh: Number(activeSession.energyKWh.toFixed(6)),
    cost: Number(
      (activeSession.energyKWh * activeSession.tariff).toFixed(6)
    ),
    endedAt: new Date().toISOString(),
    previousHash: sessions.length
      ? sessions[sessions.length - 1].hash
      : "GENESIS",
  };

  try {
    // Generate the SHA-256 transaction hash
    sessionToSave.hash = await sha256(sessionToSave);

    // Save the completed session to MongoDB
    const savedSession = await saveSessionToDatabase(sessionToSave);

    // Add the saved record to the dashboard's session list
    sessions.push({
      ...sessionToSave,
      ...savedSession,
      hash: savedSession.hash || sessionToSave.hash,
    });

    setMessage(`Session saved to MongoDB. Transaction: ${sessionToSave.id}`);
  } catch (error) {
    console.error("Session save error:", error);

    setMessage(
      error.message || "Could not save the charging session.",
      true
    );
  }

  activeSession = null;

  document.getElementById("start-btn").disabled = false;
  document.getElementById("stop-btn").disabled = true;
  document.getElementById("station-select").disabled = false;
  document.getElementById("power-select").disabled = false;
  document.getElementById("tariff").disabled = false;
  document.getElementById("user-id").disabled = false;
  document.getElementById("live-tag").textContent = "IDLE";

  renderDashboard();
  renderHistory();
  renderVerificationSummary();
}

// ---------- Transaction history ----------

function renderHistory() {
  const container = document.getElementById("history-table");

  if (!sessions.length) {
    container.innerHTML = `
      <p class="empty-state">
        No saved transactions yet. Start and stop a charging session first.
      </p>`;
    return;
  }

  container.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Station / User</th>
            <th>Energy</th>
            <th>Cost</th>
            <th>End Time</th>
            <th>SHA-256 Hash</th>
          </tr>
        </thead>
        <tbody>
          ${sessions.slice().reverse().map(item => `
            <tr>
              <td>${escapeHTML(item.id)}</td>
              <td>${escapeHTML(item.stationId)}<br><small>${escapeHTML(item.userId)}</small></td>
              <td>${item.energyKWh.toFixed(3)} kWh</td>
              <td>${money(item.cost)}</td>
              <td>${formatDate(item.endedAt)}</td>
              <td class="hash">${escapeHTML(item.hash || "No hash")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
}

document.getElementById("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(sessions, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "chargenode-transactions.json";
  link.click();

  URL.revokeObjectURL(url);
});

// ---------- Integrity verification ----------

function renderVerificationSummary(passed = 0, failed = 0) {
  document.getElementById("verify-total").textContent = sessions.length;
  document.getElementById("verify-passed").textContent = passed;
  document.getElementById("verify-failed").textContent = failed;
}

document.getElementById("verify-btn").addEventListener("click", verifyAllRecords);

async function verifyAllRecords() {
  const container = document.getElementById("verification-results");

  if (!sessions.length) {
    container.innerHTML = `
      <p class="empty-state">
        There are no saved records to verify. Complete a charging session first.
      </p>`;
    renderVerificationSummary(0, 0);
    return;
  }

  container.innerHTML = '<p class="empty-state">Checking saved record hashes…</p>';

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const record of sessions) {
    try {
      const recalculated = await sha256(record);
      const valid = recalculated === record.hash;

      if (valid) passed++;
      else failed++;

      results.push(`
        <div class="result-item ${valid ? "result-pass" : "result-fail"}">
          <strong class="${valid ? "pass-text" : "fail-text"}">
            ${valid ? "✓ PASS — Hash matches" : "✕ FAIL — Data mismatch"}
          </strong>
          <p>Transaction: ${escapeHTML(record.id)}</p>
          <p>Station: ${escapeHTML(record.stationId)} · Energy: ${Number(record.energyKWh).toFixed(3)} kWh</p>
          <p>Stored hash: <span class="hash">${escapeHTML(record.hash || "Missing")}</span></p>
          <p>Recalculated hash: <span class="hash">${escapeHTML(recalculated)}</span></p>
        </div>
      `);
    } catch (error) {
      failed++;
      results.push(`
        <div class="result-item result-fail">
          <strong class="fail-text">✕ Verification error</strong>
          <p>${escapeHTML(error.message)}</p>
        </div>
      `);
    }
  }

  container.innerHTML = results.join("");
  renderVerificationSummary(passed, failed);
}

// ---------- Initialize app ----------

// ---------- Initialize app ----------

setupStations();
renderStations();
showPage("dashboard");
loadSessions();
