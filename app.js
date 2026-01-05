import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDpe_O9jCT8OWuGTV5ZwmKtKxpy1q6WWmM",
  authDomain: "fantasy-football-playoff-b5211.firebaseapp.com",
  projectId: "fantasy-football-playoff-b5211",
  storageBucket: "fantasy-football-playoff-b5211.firebasestorage.app",
  messagingSenderId: "651928014712",
  appId: "1:651928014712:web:57fc1e401e6b0756ac428d",
  measurementId: "G-FCWNFHDRF1"
};

const ADMIN_PASSPHRASE = "cosie";
const ADMIN_KEY = "ff_admin_ok";

function checkAdminAccess() {
  try {
    if (localStorage.getItem(ADMIN_KEY) === "true") {
      return true;
    }
  } catch (error) {
    console.warn("Admin access check failed.", error);
  }
  const attempt = window.prompt("Enter admin passphrase:");
  if (attempt === ADMIN_PASSPHRASE) {
    try {
      localStorage.setItem(ADMIN_KEY, "true");
    } catch (error) {
      console.warn("Unable to persist admin access.", error);
    }
    return true;
  }
  return false;
}

function lockAdminPage() {
  document.body.innerHTML = `
    <main class="lock-screen">
      <div class="card">
        <h1>Admin Access Required</h1>
        <p class="empty-state">Refresh the page to try again.</p>
      </div>
    </main>
  `;
}

const configBanner = document.getElementById("configBanner");
const configNeedsUpdate = Object.values(firebaseConfig).some((value) =>
  String(value).includes("YOUR_")
);
if (configNeedsUpdate && configBanner) {
  configBanner.hidden = false;
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const teamsCol = collection(db, "teams");
const scoresCol = collection(db, "scores");

const rounds = [
  { key: "wildcard", label: "Wild Card Round" },
  { key: "divisional", label: "Divisional Round" },
  { key: "conference", label: "Conference Championship" },
  { key: "superbowl", label: "Super Bowl" }
];

const rosterTemplate = [
  "QB",
  "QB",
  "RB",
  "RB",
  "WR",
  "WR",
  "WR",
  "TE",
  "TE",
  "Flex",
  "Flex",
  "Flex",
  "Kicker",
  "DST"
];

const rosterSlots = (() => {
  const totals = rosterTemplate.reduce((accumulator, position) => {
    accumulator[position] = (accumulator[position] || 0) + 1;
    return accumulator;
  }, {});
  const counts = {};
  return rosterTemplate.map((position) => {
    const nextCount = (counts[position] || 0) + 1;
    counts[position] = nextCount;
    const id = `${position.toLowerCase().replace(/[^a-z0-9]/g, "")}${nextCount}`;
    const label = totals[position] > 1 ? `${position} ${nextCount}` : position;
    return { id, position, label };
  });
})();

const rosterSlotMap = new Map(
  rosterSlots.map((slot) => [slot.id, slot])
);

const leaderboardList = document.getElementById("leaderboardList");
const leaderboardEmpty = document.getElementById("leaderboardEmpty");
const teamForm = document.getElementById("teamForm");
const teamNameInput = document.getElementById("teamName");
const rosterFields = document.getElementById("rosterFields");
const teamList = document.getElementById("teamList");
const teamEmpty = document.getElementById("teamEmpty");
const teamStatus = document.getElementById("teamStatus");
const roundTabs = document.getElementById("roundTabs");
const scoresList = document.getElementById("scoresList");
const scoresEmpty = document.getElementById("scoresEmpty");
const scoresStatus = document.getElementById("scoresStatus");
const roundTotalsList = document.getElementById("roundTotalsList");
const roundTotalsEmpty = document.getElementById("roundTotalsEmpty");

const isAdminPage = document.body?.dataset?.admin === "true";
const adminAllowed = !isAdminPage || checkAdminAccess();
if (isAdminPage && !adminAllowed) {
  lockAdminPage();
}

let teams = [];
let scores = {};
let activeRound = rounds[0].key;
const statusTimers = new Map();

function setStatus(target, message, isError = false) {
  if (!target) {
    return;
  }
  target.textContent = message;
  target.classList.toggle("status-error", isError);
  if (statusTimers.has(target)) {
    clearTimeout(statusTimers.get(target));
  }
  if (message) {
    statusTimers.set(
      target,
      setTimeout(() => {
        target.textContent = "";
        target.classList.remove("status-error");
      }, 2600)
    );
  }
}

function getTeamRoster(team) {
  if (Array.isArray(team?.roster) && team.roster.length) {
    return team.roster;
  }
  return rosterSlots.map((slot) => ({
    slotId: slot.id,
    position: slot.position,
    player: ""
  }));
}

function renderRosterFields() {
  if (!rosterFields) {
    return;
  }
  rosterFields.innerHTML = "";
  rosterSlots.forEach((slot) => {
    const label = document.createElement("label");
    label.className = "roster-field";
    label.textContent = slot.label;

    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = `${slot.position} player`;
    input.dataset.slotId = slot.id;

    label.appendChild(input);
    rosterFields.appendChild(label);
  });
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function formatScore(value) {
  const rounded = roundScore(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function getUniquePlayers() {
  const uniquePlayers = [];
  const seen = new Set();

  teams.forEach((team) => {
    const roster = getTeamRoster(team);
    roster.forEach((entry) => {
      const trimmed = String(entry.player || "").trim();
      if (!trimmed) {
        return;
      }
      const key = normalizeName(trimmed);
      if (!seen.has(key)) {
        seen.add(key);
        uniquePlayers.push(trimmed);
      }
    });
  });

  uniquePlayers.sort((a, b) => a.localeCompare(b));
  return uniquePlayers;
}

function getRoundEntries(roundKey) {
  const roundData = scores[roundKey];
  if (roundData && Array.isArray(roundData.entries)) {
    return roundData.entries;
  }
  return [];
}

function getRoundScoreMap(roundKey) {
  const entries = getRoundEntries(roundKey);
  const map = new Map();
  entries.forEach((entry) => {
    const key = normalizeName(entry.name);
    if (!key) {
      return;
    }
    map.set(key, normalizeNumber(entry.score));
  });
  return map;
}

function getRoundTotal(team, roundKey) {
  const roundScores = getRoundScoreMap(roundKey);
  const roster = getTeamRoster(team);
  return roster.reduce(
    (sum, entry) =>
      sum + normalizeNumber(roundScores.get(normalizeName(entry.player))),
    0
  );
}

function getTeamTotal(team) {
  return rounds.reduce((sum, round) => sum + getRoundTotal(team, round.key), 0);
}

function renderLeaderboard() {
  if (!leaderboardList || !leaderboardEmpty || (isAdminPage && !adminAllowed)) {
    return;
  }
  leaderboardList.innerHTML = "";

  if (!teams.length) {
    leaderboardEmpty.hidden = false;
    return;
  }
  leaderboardEmpty.hidden = true;

  const data = teams.map((team) => {
    const total = roundScore(getTeamTotal(team));
    return { id: team.id, name: team.name, total };
  });

  data.sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.name.localeCompare(b.name);
  });

  let lastScore = null;
  let lastRank = 0;

  data.forEach((entry, index) => {
    const position = index + 1;
    if (lastScore === null || entry.total !== lastScore) {
      lastRank = position;
      lastScore = entry.total;
    }

    const row = document.createElement("a");
    row.className = "board-row board-link";
    row.href = `team.html?teamId=${encodeURIComponent(entry.id)}`;

    const rank = document.createElement("strong");
    rank.textContent = String(lastRank);

    const name = document.createElement("span");
    name.textContent = entry.name;

    const total = document.createElement("span");
    total.textContent = formatScore(entry.total);

    row.append(rank, name, total);
    leaderboardList.appendChild(row);
  });
}

function renderTeams() {
  if (!teamList || !teamEmpty || (isAdminPage && !adminAllowed)) {
    return;
  }
  teamList.innerHTML = "";

  if (!teams.length) {
    teamEmpty.hidden = false;
    return;
  }
  teamEmpty.hidden = true;

  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((team) => {
    const wrapper = document.createElement("div");
    wrapper.className = "team-item";

    const name = document.createElement("h4");
    name.textContent = team.name;

    const rosterList = document.createElement("ul");
    rosterList.className = "roster-list";
    const roster = getTeamRoster(team);
    roster.forEach((entry) => {
      const item = document.createElement("li");
      const label =
        rosterSlotMap.get(entry.slotId)?.label || entry.position || "Slot";
      const playerName = entry.player ? entry.player : "Open slot";
      item.textContent = `${label}: ${playerName}`;
      rosterList.appendChild(item);
    });

    wrapper.append(name, rosterList);
    teamList.appendChild(wrapper);
  });
}

function renderRoundTotals() {
  if (!roundTotalsList || !roundTotalsEmpty || (isAdminPage && !adminAllowed)) {
    return;
  }
  roundTotalsList.innerHTML = "";

  if (!teams.length) {
    roundTotalsEmpty.hidden = false;
    return;
  }
  roundTotalsEmpty.hidden = true;

  const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach((team) => {
    const item = document.createElement("li");
    item.textContent = `${team.name}: ${formatScore(
      getRoundTotal(team, activeRound)
    )}`;
    roundTotalsList.appendChild(item);
  });
}

function renderScoresInputs() {
  if (!scoresList || !scoresEmpty || (isAdminPage && !adminAllowed)) {
    return;
  }
  scoresList.innerHTML = "";

  const uniquePlayers = getUniquePlayers();

  if (!uniquePlayers.length) {
    scoresEmpty.hidden = false;
    return;
  }
  scoresEmpty.hidden = true;

  const scoreMap = getRoundScoreMap(activeRound);

  uniquePlayers.forEach((name) => {
    const row = document.createElement("div");
    row.className = "score-player-row";

    const player = document.createElement("span");
    player.className = "score-player";
    player.textContent = name;

    const input = document.createElement("input");
    input.className = "score-input";
    input.type = "number";
    input.step = "0.1";
    input.min = "0";
    input.dataset.player = name;
    input.value = String(normalizeNumber(scoreMap.get(normalizeName(name))));

    row.append(player, input);
    scoresList.appendChild(row);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "ghost score-save";
  saveButton.textContent = "Save round scores";
  saveButton.addEventListener("click", async () => {
    const entries = [];
    scoresList.querySelectorAll("input[data-player]").forEach((input) => {
      entries.push({
        name: input.dataset.player,
        score: normalizeNumber(input.value)
      });
    });
    try {
      await setDoc(
        doc(scoresCol, activeRound),
        { entries, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setStatus(scoresStatus, "Scores saved.");
    } catch (error) {
      console.error(error);
      setStatus(scoresStatus, "Score update failed.", true);
    }
  });

  scoresList.appendChild(saveButton);
}

function setActiveRound(roundKey) {
  activeRound = roundKey;
  if (roundTabs) {
    Array.from(roundTabs.children).forEach((button) => {
      button.classList.toggle("active", button.dataset.round === roundKey);
    });
  }
  renderScoresInputs();
  renderRoundTotals();
}

function renderRoundTabs() {
  if (!roundTabs || (isAdminPage && !adminAllowed)) {
    return;
  }
  rounds.forEach((round, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab";
    if (index === 0) {
      button.classList.add("active");
    }
    button.dataset.round = round.key;
    button.textContent = round.label;
    button.addEventListener("click", () => setActiveRound(round.key));
    roundTabs.appendChild(button);
  });
}

if (adminAllowed) {
  renderRoundTabs();
  renderRosterFields();
}

if (adminAllowed && teamForm && teamNameInput) {
  teamForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const teamName = teamNameInput.value.trim();
    if (!teamName) {
      setStatus(teamStatus, "Team name is required.", true);
      return;
    }

    const duplicate = teams.some(
      (team) => team.name.trim().toLowerCase() === teamName.toLowerCase()
    );
    if (duplicate) {
      setStatus(teamStatus, "Team name already exists.", true);
      return;
    }

    const rosterInputs = rosterFields
      ? Array.from(rosterFields.querySelectorAll("input[data-slot-id]"))
      : [];
    if (!rosterInputs.length) {
      setStatus(teamStatus, "Roster inputs are missing.", true);
      return;
    }

    let missing = false;
    const roster = rosterInputs.map((input) => {
      const player = input.value.trim();
      if (!player) {
        missing = true;
      }
      return {
        slotId: input.dataset.slotId,
        position: rosterSlotMap.get(input.dataset.slotId)?.position || "Flex",
        player
      };
    });

    if (missing) {
      setStatus(teamStatus, "Fill every roster slot.", true);
      return;
    }

    try {
      await addDoc(teamsCol, {
        name: teamName,
        roster,
        createdAt: serverTimestamp()
      });
      teamForm.reset();
      setStatus(teamStatus, "Team created.");
    } catch (error) {
      console.error(error);
      setStatus(teamStatus, "Team creation failed.", true);
    }
  });
}

if (adminAllowed) {
  onSnapshot(teamsCol, (snapshot) => {
    teams = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data()
    }));
    renderTeams();
    renderScoresInputs();
    renderRoundTotals();
    renderLeaderboard();
  });

  onSnapshot(scoresCol, (snapshot) => {
    scores = {};
    snapshot.forEach((docSnap) => {
      if (rounds.some((round) => round.key === docSnap.id)) {
        scores[docSnap.id] = docSnap.data();
      }
    });
    renderScoresInputs();
    renderRoundTotals();
    renderLeaderboard();
  });
}
