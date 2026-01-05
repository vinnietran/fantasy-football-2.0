import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
  onSnapshot
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

const rosterSlotMap = new Map(rosterSlots.map((slot) => [slot.id, slot]));

const teamName = document.getElementById("teamName");
const teamMeta = document.getElementById("teamMeta");
const teamRoster = document.getElementById("teamRoster");
const teamRoundTotals = document.getElementById("teamRoundTotals");
const teamTotal = document.getElementById("teamTotal");
const roundBreakdownTable = document.getElementById("roundBreakdownTable");
const roundBreakdownHead = roundBreakdownTable
  ? roundBreakdownTable.querySelector("thead")
  : null;
const roundBreakdownBody = roundBreakdownTable
  ? roundBreakdownTable.querySelector("tbody")
  : null;
const teamError = document.getElementById("teamError");

const params = new URLSearchParams(window.location.search);
const teamId = params.get("teamId");

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let team = null;
let scores = {};

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

function getTeamRoster(target) {
  if (Array.isArray(target?.roster) && target.roster.length) {
    return target.roster;
  }
  return rosterSlots.map((slot) => ({
    slotId: slot.id,
    position: slot.position,
    player: ""
  }));
}

function getRoundScoreMap(roundKey) {
  const entries = scores[roundKey]?.entries || [];
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

function getRoundTotal(target, roundKey) {
  const scoreMap = getRoundScoreMap(roundKey);
  const roster = getTeamRoster(target);
  return roster.reduce(
    (sum, entry) => sum + normalizeNumber(scoreMap.get(normalizeName(entry.player))),
    0
  );
}

function getTeamTotal(target) {
  return rounds.reduce((sum, round) => sum + getRoundTotal(target, round.key), 0);
}

function renderError(message) {
  teamError.textContent = message;
}

function renderRoster() {
  teamRoster.innerHTML = "";
  const roster = getTeamRoster(team);
  roster.forEach((entry) => {
    const item = document.createElement("li");
    const label = rosterSlotMap.get(entry.slotId)?.label || entry.position || "Slot";
    const playerName = entry.player || "Open slot";
    item.textContent = `${label}: ${playerName}`;
    teamRoster.appendChild(item);
  });
}

function renderRoundTotals() {
  teamRoundTotals.innerHTML = "";
  rounds.forEach((round) => {
    const item = document.createElement("li");
    item.textContent = `${round.label}: ${formatScore(getRoundTotal(team, round.key))}`;
    teamRoundTotals.appendChild(item);
  });
  teamTotal.textContent = `Total: ${formatScore(getTeamTotal(team))}`;
}

function renderScoreTable() {
  if (!roundBreakdownHead || !roundBreakdownBody) {
    return;
  }
  roundBreakdownHead.innerHTML = "";
  roundBreakdownBody.innerHTML = "";

  const headRow = document.createElement("tr");
  const playerHeader = document.createElement("th");
  playerHeader.textContent = "Player";
  headRow.appendChild(playerHeader);

  rounds.forEach((round) => {
    const header = document.createElement("th");
    header.textContent = round.label;
    headRow.appendChild(header);
  });

  roundBreakdownHead.appendChild(headRow);

  const roster = getTeamRoster(team);
  const roundScoreMaps = rounds.reduce((accumulator, round) => {
    accumulator[round.key] = getRoundScoreMap(round.key);
    return accumulator;
  }, {});

  roster.forEach((entry) => {
    const row = document.createElement("tr");

    const playerCell = document.createElement("td");
    playerCell.className = "player-cell";
    const playerName = entry.player || "Open slot";
    const positionLabel =
      rosterSlotMap.get(entry.slotId)?.label || entry.position || "Slot";
    const nameLine = document.createElement("span");
    nameLine.textContent = playerName;
    const positionLine = document.createElement("span");
    positionLine.className = "player-position";
    positionLine.textContent = positionLabel;
    playerCell.append(nameLine, positionLine);

    row.appendChild(playerCell);

    rounds.forEach((round) => {
      const scoreMap = roundScoreMaps[round.key];
      const scoreValue = normalizeNumber(
        scoreMap.get(normalizeName(entry.player))
      );
      const cell = document.createElement("td");
      cell.className = "score-cell";
      cell.textContent = formatScore(scoreValue);
      row.appendChild(cell);
    });

    roundBreakdownBody.appendChild(row);
  });
}

function render() {
  if (!team) {
    teamName.textContent = "Team Details";
    teamMeta.textContent = "";
    teamRoster.innerHTML = "";
    teamRoundTotals.innerHTML = "";
    teamTotal.textContent = "";
    if (roundBreakdownHead) {
      roundBreakdownHead.innerHTML = "";
    }
    if (roundBreakdownBody) {
      roundBreakdownBody.innerHTML = "";
    }
    renderError("Team not found.");
    return;
  }
  renderError("");
  teamName.textContent = team.name;
  teamMeta.textContent = `Overall total: ${formatScore(getTeamTotal(team))}`;
  renderRoster();
  renderRoundTotals();
  renderScoreTable();
}

if (!teamId) {
  team = null;
  render();
  renderError("Missing team id. Go back to the leaderboard to choose a team.");
} else {
  onSnapshot(doc(db, "teams", teamId), (docSnap) => {
    if (!docSnap.exists()) {
      team = null;
    } else {
      team = { id: docSnap.id, ...docSnap.data() };
    }
    render();
  });

  onSnapshot(collection(db, "scores"), (snapshot) => {
    scores = {};
    snapshot.forEach((docSnap) => {
      if (rounds.some((round) => round.key === docSnap.id)) {
        scores[docSnap.id] = docSnap.data();
      }
    });
    render();
  });
}
