import { FIELDS } from './scoring.js';
import { HoldReset } from './hold-reset.js';
import { bindRepeatButton } from './repeat-button.js';

// SW2–SW13 in schematic CSB-001 revision B, sheet 3. Labels only; no GPIO I/O.
const BUTTON_PINS = { runs: [13, 14, 16], wickets: [17, 18, 19], overs: [21, 22, 32], target: [33, 34, 35] };

export function bindPhysicalControls(controller, report) {
  const panel = document.getElementById('physical-controls');
  const cancelCallbacks = [];
  let switchNumber = 2;

  for (const [field, info] of Object.entries(FIELDS)) {
    const row = document.createElement('div');
    row.className = 'physical-row';
    const label = document.createElement('div');
    label.className = 'physical-label';
    label.textContent = field === 'target' ? 'Target' : info.label;
    const pinLabel = document.createElement('small');
    pinLabel.textContent = `SW${switchNumber}–${switchNumber + 2} · GPIO ${BUTTON_PINS[field].join(' / ')}`;
    label.append(pinLabel);
    row.append(label);

    for (const amount of [1, -1]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'physical-step';
      button.textContent = amount > 0 ? '+' : '−';
      button.setAttribute('aria-label', `Physical: ${amount > 0 ? 'add' : 'subtract'} 1 ${field === 'target' ? 'target' : field === 'runs' ? 'run' : field === 'wickets' ? 'wicket' : 'over'}`);
      if (field === 'target') {
        cancelCallbacks.push(bindRepeatButton(button, groupId => {
          const result = controller.dispatch({ type: 'adjust', field, amount, groupId });
          report(result, 'Physical');
          return result.ok;
        }));
      } else {
        button.addEventListener('click', () => report(controller.dispatch({ type: 'adjust', field, amount }), 'Physical'));
        button.addEventListener('keydown', event => { if (event.repeat) event.preventDefault(); });
      }
      row.append(button);
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'hold-button';
    reset.setAttribute('aria-label', `Physical: hold 2 seconds to reset ${field}`);
    reset.innerHTML = '<span class="hold-progress" aria-hidden="true"></span><span class="hold-label">Hold to reset · 2s</span>';
    const text = reset.querySelector('.hold-label');
    let pointerId = null;
    let heldKey = null;

    const hold = new HoldReset({
      complete: () => {
        reset.classList.remove('holding');
        reset.style.setProperty('--hold-progress', '0');
        text.textContent = 'Hold to reset · 2s';
        report(controller.dispatch({ type: 'reset', field }), 'Physical');
      },
      progress: value => {
        reset.style.setProperty('--hold-progress', String(value));
        reset.classList.toggle('holding', hold.active);
        text.textContent = hold.active ? `Holding… ${Math.floor(value * 100)}%` : 'Hold to reset · 2s';
      },
    });

    function cancel() {
      const wasActive = hold.active;
      hold.cancel();
      const capturedPointer = pointerId;
      pointerId = null;
      heldKey = null;
      if (capturedPointer !== null && reset.hasPointerCapture(capturedPointer)) reset.releasePointerCapture(capturedPointer);
      if (wasActive) report({ ok: true, message: `${info.label} reset cancelled — hold for a full 2 seconds.` }, 'Physical');
    }

    function release() {
      const wasActive = hold.active;
      const completed = hold.release();
      if (wasActive && !completed) report({ ok: true, message: `${info.label} reset cancelled — hold for a full 2 seconds.` }, 'Physical');
    }

    reset.addEventListener('pointerdown', event => {
      if (event.button !== 0 || pointerId !== null || heldKey !== null) return;
      event.preventDefault();
      reset.focus();
      pointerId = event.pointerId;
      reset.setPointerCapture(pointerId);
      hold.start();
    });
    reset.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      const box = reset.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) cancel();
    });
    reset.addEventListener('pointerup', event => {
      if (event.pointerId !== pointerId) return;
      release();
      pointerId = null;
      if (reset.hasPointerCapture(event.pointerId)) reset.releasePointerCapture(event.pointerId);
    });
    reset.addEventListener('pointercancel', cancel);
    reset.addEventListener('lostpointercapture', () => { if (pointerId !== null) cancel(); });
    reset.addEventListener('contextmenu', event => event.preventDefault());
    reset.addEventListener('click', event => event.preventDefault()); // A tap or synthetic click cannot reset.

    reset.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (event.repeat || heldKey !== null || pointerId !== null) return;
      heldKey = event.key;
      hold.start();
    });
    reset.addEventListener('keyup', event => {
      if (event.key !== heldKey) return;
      event.preventDefault();
      heldKey = null;
      release();
    });
    reset.addEventListener('blur', cancel);
    cancelCallbacks.push(cancel);
    row.append(reset);
    panel.append(row);
    switchNumber += 3;
  }

  const cancelAll = () => cancelCallbacks.forEach(cancel => cancel());
  window.addEventListener('blur', cancelAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });
  return cancelAll;
}
