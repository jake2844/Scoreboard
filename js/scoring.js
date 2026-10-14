// Pure scoring rules. No DOM, storage, transport, or hardware dependencies.
export const FIELDS = Object.freeze({
  runs: Object.freeze({ label: 'Runs', max: 999, digits: 3 }),
  wickets: Object.freeze({ label: 'Wickets', max: 10, digits: 2 }),
  overs: Object.freeze({ label: 'Overs', max: 99, digits: 2 }),
  target: Object.freeze({ label: 'To win', max: 999, digits: 3 }),
});

export const emptyScore = () => ({ runs: 0, wickets: 0, overs: 0, target: 0 });

export function validateValue(field, value) {
  if (!Object.hasOwn(FIELDS, field)) throw new Error('Unknown score field.');
  if (!Number.isInteger(value) || value < 0 || value > FIELDS[field].max) {
    throw new Error(`${FIELDS[field].label} must be a whole number from 0 to ${FIELDS[field].max}.`);
  }
  return value;
}

export function validateScore(score) {
  if (!score || typeof score !== 'object') throw new Error('Invalid score.');
  return Object.fromEntries(Object.keys(FIELDS).map(field => [field, validateValue(field, score[field])]));
}

// Parse user text deliberately: blank, fractions, signs, exponent notation, etc. are rejected.
export function parseScoreInput(field, text) {
  if (typeof text !== 'string' || !/^\d+$/.test(text.trim())) {
    throw new Error('Enter a whole number using digits only.');
  }
  return validateValue(field, Number(text.trim()));
}

export function describeAction(action) {
  if (action.type === 'new-innings') return `New innings · target ${action.target}`;
  const label = FIELDS[action.field]?.label ?? '';
  if (action.type === 'adjust') return `${label} ${action.amount > 0 ? '+' : ''}${action.amount}`;
  if (action.type === 'reset') return `${label} reset`;
  return `${label} set to ${action.value}`;
}

export class ScoringEngine {
  #score;
  #history;

  constructor(saved = null) {
    this.#score = saved ? validateScore(saved.score) : emptyScore();
    const history = saved?.history ?? [];
    if (!Array.isArray(history)) throw new Error('Invalid saved history.');
    this.#history = history.map(entry => {
      if (typeof entry.label !== 'string') throw new Error('Invalid history entry.');
      return { score: validateScore(entry.score), label: entry.label };
    });
  }

  snapshot() {
    return {
      score: { ...this.#score },
      canUndo: this.#history.length > 0,
      undoLabel: this.#history.at(-1)?.label ?? '',
      historyCount: this.#history.length,
    };
  }

  exportData() {
    return { score: { ...this.#score }, history: this.#history.map(entry => ({ ...entry, score: { ...entry.score } })) };
  }

  apply(action) {
    if (!action || typeof action !== 'object') throw new Error('Invalid command.');
    if (action.type === 'undo') {
      const previous = this.#history.pop();
      if (!previous) throw new Error('There is nothing to undo.');
      this.#score = previous.score;
      return { changed: true, message: `Undid: ${previous.label}` };
    }

    const next = { ...this.#score };
    switch (action.type) {
      case 'new-innings':
        // No implicit target. The caller must explicitly choose one, including zero.
        Object.assign(next, emptyScore(), { target: validateValue('target', action.target) });
        break;
      case 'adjust':
        validateValue(action.field, next[action.field]);
        if (!Number.isInteger(action.amount) || action.amount === 0) throw new Error('Invalid adjustment.');
        next[action.field] = validateValue(action.field, next[action.field] + action.amount);
        break;
      case 'set':
        next[action.field] = validateValue(action.field, action.value);
        break;
      case 'reset':
        next[action.field] = validateValue(action.field, 0);
        break;
      default:
        throw new Error('Unknown command.');
    }

    if (Object.keys(FIELDS).every(field => next[field] === this.#score[field])) {
      return { changed: false, message: 'Score already has that value.' };
    }
    const label = describeAction(action);
    this.#history.push({ score: { ...this.#score }, label });
    this.#score = next;
    return { changed: true, message: label };
  }
}
