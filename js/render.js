import { FIELDS } from './scoring.js';

// Segment names follow schematic sheet 2: a through g, with no decimal point.
const SEGMENTS = {
  a: '10,3 42,3 48,9 42,15 10,15 4,9',
  b: '44,17 50,11 50,45 44,51 38,45 38,23',
  c: '44,55 50,61 50,95 44,101 38,95 38,67',
  d: '10,97 42,97 48,103 42,109 10,109 4,103',
  e: '8,55 14,61 14,95 8,101 2,95 2,67',
  f: '8,11 14,17 14,45 8,51 2,45 2,17',
  g: '10,50 42,50 48,56 42,62 10,62 4,56',
};
const DIGIT_SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
const SVG_NS = 'http://www.w3.org/2000/svg';

function createDigit() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 52 112');
  svg.setAttribute('class', 'seven-segment');
  svg.setAttribute('aria-hidden', 'true');
  for (const [name, points] of Object.entries(SEGMENTS)) {
    const segment = document.createElementNS(SVG_NS, 'polygon');
    segment.setAttribute('points', points);
    segment.setAttribute('class', 'segment');
    segment.dataset.segment = name;
    svg.append(segment);
  }
  return svg;
}

export function initialiseDigits() {
  for (const display of document.querySelectorAll('[data-display]')) {
    const field = FIELDS[display.dataset.display];
    for (let index = 0; index < field.digits; index++) display.append(createDigit());
  }
}

export function renderBoard({ score, historyCount }) {
  for (const display of document.querySelectorAll('[data-display]')) {
    const field = display.dataset.display;
    const digits = String(score[field]).padStart(FIELDS[field].digits, '0');
    display.setAttribute('aria-label', `${FIELDS[field].label} ${score[field]}`);
    [...display.children].forEach((svg, index) => {
      const lit = DIGIT_SEGMENTS[Number(digits[index])];
      for (const segment of svg.children) segment.classList.toggle('lit', lit.includes(segment.dataset.segment));
    });
  }
  document.getElementById('history-count').textContent = `${historyCount} ${historyCount === 1 ? 'action' : 'actions'} in history`;
}

export function renderPhone({ connected, snapshot }) {
  for (const field of Object.keys(FIELDS)) document.getElementById(`phone-${field}`).textContent = snapshot.score[field];
  document.getElementById('phone-command-controls').disabled = !connected;
  document.getElementById('undo').disabled = !snapshot.canUndo;
  document.getElementById('undo-note').textContent = snapshot.canUndo ? `Last action: ${snapshot.undoLabel}` : 'No actions to undo';
  const badge = document.getElementById('connection-badge');
  badge.classList.toggle('offline', !connected);
  badge.replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  badge.append(dot, connected ? ' Connected' : ' Disconnected');
  document.getElementById('phone-sync-note').textContent = connected ? 'Live from the controller' : 'Offline · showing last received score';
  document.getElementById('toggle-connection').textContent = connected ? 'Disconnect phone' : 'Reconnect phone';
}

export function renderMessage(message, isError = false) {
  const status = document.getElementById('action-status');
  status.textContent = message;
  status.classList.toggle('error', isError);
}

export function renderStorageWarning(message) {
  const warning = document.getElementById('storage-warning');
  warning.hidden = !message;
  warning.textContent = message;
  document.getElementById('storage-status').textContent = message ? 'Local save unavailable' : 'Saved in this browser';
}
