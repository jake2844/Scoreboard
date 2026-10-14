// In-page edit/confirmation forms work in embedded viewers without popup APIs.
let activePanel = null;
let returnFocus = null;

export function openPanel(panel) {
  if (activePanel === panel) return;
  if (activePanel) closePanel(activePanel);
  returnFocus = document.activeElement;
  activePanel = panel;
  panel.hidden = false;
  panel.setAttribute('open', '');
  panel.scrollIntoView({ block: 'nearest' });
  const input = panel.querySelector('input:not(:disabled), select:not(:disabled)');
  (input ?? panel.querySelector('form')).focus();
}

export function closePanel(panel) {
  panel.hidden = true;
  panel.removeAttribute('open');
  if (activePanel !== panel) return;
  activePanel = null;
  // A disconnect can disable the opener while the panel is open.
  if (returnFocus?.isConnected && !returnFocus.matches(':disabled')) returnFocus.focus();
  returnFocus = null;
}

export function bindPanels() {
  for (const panel of document.querySelectorAll('[data-dialog]')) {
    panel.querySelector('form').tabIndex = -1;
    for (const button of panel.querySelectorAll('[data-close-dialog]')) {
      button.addEventListener('click', () => closePanel(panel));
    }
  }

  document.addEventListener('keydown', event => {
    if (activePanel && event.key === 'Escape') {
      event.preventDefault();
      closePanel(activePanel);
    }
  });
}
