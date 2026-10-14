import { FIELDS, parseScoreInput } from './scoring.js';
import { openPanel, closePanel } from './panels.js';

export function bindPhoneControls(connection, report, cancelHolds) {
  const byId = id => document.getElementById(id);
  let received;
  connection.subscribe(message => {
    received = message.snapshot;
    if (!message.connected) {
      closePanel(byId('edit-dialog'));
      closePanel(byId('innings-dialog'));
    }
  });

  const send = async command => {
    const result = await connection.send(command);
    report(result, 'Phone');
    return result;
  };

  for (const button of document.querySelectorAll('[data-phone-field]')) {
    button.addEventListener('click', () => send({ type: 'adjust', field: button.dataset.phoneField, amount: Number(button.dataset.amount) }));
  }
  byId('undo').addEventListener('click', () => send({ type: 'undo' }));
  byId('toggle-connection').addEventListener('click', () => {
    connection.setConnected(!connection.connected);
    report({ ok: true, message: connection.connected ? 'Reconnected. Phone received the current controller score.' : 'Phone disconnected. Physical controls remain live.' });
  });

  const editDialog = byId('edit-dialog');
  const editField = byId('edit-field');
  const editValue = byId('edit-value');
  const editError = byId('edit-error');

  function populateEdit() {
    const field = editField.value;
    editValue.value = received.score[field];
    byId('edit-value-label').textContent = `${FIELDS[field].label} (0–${FIELDS[field].max})`;
    editError.textContent = '';
  }

  function openEdit(targetOnly) {
    if (!connection.connected) return;
    cancelHolds();
    editField.value = targetOnly ? 'target' : 'runs';
    editField.disabled = targetOnly;
    byId('edit-title').textContent = targetOnly ? 'Set target to win' : 'Edit score';
    populateEdit();
    openPanel(editDialog);
    editValue.focus();
    editValue.select();
  }
  byId('edit-target').addEventListener('click', () => openEdit(true));
  byId('correct').addEventListener('click', () => openEdit(false));
  editField.addEventListener('change', populateEdit);
  byId('edit-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const value = parseScoreInput(editField.value, editValue.value);
      const result = await send({ type: 'set', field: editField.value, value });
      if (result.ok) closePanel(editDialog);
      else editError.textContent = result.message;
    } catch (error) { editError.textContent = error.message; }
  });

  const inningsDialog = byId('innings-dialog');
  const inningsForm = byId('innings-form');
  const inningsTarget = byId('innings-target');
  byId('new-innings').addEventListener('click', () => {
    if (!connection.connected) return;
    cancelHolds();
    inningsForm.reset();
    inningsTarget.disabled = true;
    byId('innings-current-target').textContent = received.score.target;
    byId('innings-error').textContent = '';
    openPanel(inningsDialog);
  });
  inningsForm.addEventListener('change', () => {
    inningsTarget.disabled = inningsForm.elements['target-choice'].value !== 'custom';
    if (!inningsTarget.disabled) inningsTarget.focus();
  });
  inningsForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const choice = inningsForm.elements['target-choice'].value;
      if (!choice) throw new Error('Choose a target before confirming the new innings.');
      // "Keep" means keep the current received controller target, even if a physical edit just changed it.
      const command = choice === 'runs-plus-one'
        ? { type: 'new-innings', targetChoice: 'runs-plus-one' }
        : { type: 'new-innings', target: choice === 'keep' ? received.score.target : choice === 'zero' ? 0 : parseScoreInput('target', inningsTarget.value) };
      const result = await send(command);
      if (result.ok) closePanel(inningsDialog);
      else byId('innings-error').textContent = result.message;
    } catch (error) { byId('innings-error').textContent = error.message; }
  });
  // Show live target choices; derive runs + 1 in the controller at confirmation.
  connection.subscribe(({ snapshot }) => {
    byId('innings-current-target').textContent = snapshot.score.target;
    const possible = snapshot.score.runs < FIELDS.target.max;
    byId('innings-chase-target').textContent = possible ? snapshot.score.runs + 1 : '1000 exceeds the 999 limit';
    const chaseChoice = inningsForm.querySelector('[value="runs-plus-one"]');
    chaseChoice.disabled = !possible;
    if (!possible) chaseChoice.checked = false;
  });

}
