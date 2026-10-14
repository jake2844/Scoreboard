import { HoldRepeat } from './hold-repeat.js';

let nextGesture = 0;

// Bind a physical target button to pointer/keyboard holds and accessible clicks.
export function bindRepeatButton(button, step) {
  let pointerId = null;
  let heldKey = null;
  let groupId = null;
  const repeat = new HoldRepeat({ step: () => {
    const accepted = step(groupId);
    if (!accepted) button.classList.remove('holding');
    return accepted;
  } });

  function start() {
    groupId = `target-hold-${++nextGesture}`;
    button.classList.add('holding');
    repeat.start();
  }

  function stop() {
    repeat.stop();
    button.classList.remove('holding');
    const captured = pointerId;
    pointerId = null;
    heldKey = null;
    if (captured !== null && button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
  }

  button.classList.add('repeat-button');
  button.title = 'Tap for one. Hold to repeat faster.';
  button.setAttribute('aria-describedby', 'target-hold-help');
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointerId !== null || heldKey !== null) return;
    event.preventDefault();
    button.focus();
    pointerId = event.pointerId;
    button.setPointerCapture(pointerId);
    start();
  });
  button.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    const box = button.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) stop();
  });
  button.addEventListener('pointerup', event => { if (event.pointerId === pointerId) stop(); });
  button.addEventListener('pointercancel', stop);
  button.addEventListener('lostpointercapture', () => { if (pointerId !== null) stop(); });
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (event.repeat || pointerId !== null || heldKey !== null) return;
    heldKey = event.key;
    start();
  });
  button.addEventListener('keyup', event => {
    if (event.key !== heldKey) return;
    event.preventDefault();
    stop();
  });
  button.addEventListener('blur', stop);
  button.addEventListener('click', event => {
    event.preventDefault();
    // Pointer/keyboard presses already scored on press. A screen-reader activation
    // or programmatic click without a press sequence remains a single step.
    if (event.detail === 0 && pointerId === null && heldKey === null) step(undefined);
  });
  return stop;
}
