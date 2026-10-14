import { loadEngine } from './storage.js';
import { ScoreboardController } from './controller.js';
import { SimulatedPhoneConnection } from './phone-connection.js';
import { initialiseDigits, renderBoard, renderPhone, renderMessage, renderStorageWarning } from './render.js';
import { bindPhysicalControls } from './physical-controls.js';
import { bindPhoneControls } from './phone-controls.js';
import { bindPanels, openPanel, closePanel } from './panels.js';

// Access through methods so privacy-mode / denied localStorage access can be caught.
const storage = {
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
};
const loaded = loadEngine(storage);
const controller = new ScoreboardController(loaded.engine, storage);
controller.storageWarning = loaded.warning;
const phone = new SimulatedPhoneConnection(controller);

initialiseDigits();
controller.subscribe(snapshot => {
  renderBoard(snapshot);
  renderStorageWarning(controller.storageWarning);
});
phone.subscribe(renderPhone);

function report(result, source = '') {
  renderMessage(`${source ? `${source} · ` : ''}${result.message}`, !result.ok);
  renderStorageWarning(controller.storageWarning);
}

const cancelHolds = bindPhysicalControls(controller, report);
bindPanels();
bindPhoneControls(phone, report, cancelHolds);

const clearDialog = document.getElementById('clear-dialog');
document.getElementById('clear-data').addEventListener('click', () => {
  cancelHolds();
  openPanel(clearDialog);
});
document.getElementById('clear-form').addEventListener('submit', event => {
  event.preventDefault();
  cancelHolds();
  const result = controller.clearSavedData();
  report(result);
  if (result.ok) closePanel(clearDialog);
});
