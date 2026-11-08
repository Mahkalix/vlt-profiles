import { t } from './i18n.js';
let installPrompt;
let waitingWorker;
let busy = false;
let reloadOnUpdate = false;
const installButton = document.getElementById('install-app');
const updateButton = document.getElementById('update-app');
const help = document.getElementById('install-help');
export function setPwaBusy(value) {
  busy = value;
  if (installButton) installButton.disabled = value;
  if (updateButton) updateButton.disabled = value;
}
function installationState() {
  if (installButton) installButton.hidden = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
installationState();
matchMedia('(display-mode: standalone)').addEventListener('change', installationState);
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); installPrompt = event;
});
window.addEventListener('appinstalled', () => { installPrompt = null; installationState(); });
installButton?.addEventListener('click', async () => {
  if (busy) return;
  if (installPrompt) {
    const prompt = installPrompt; installPrompt = null;
    await prompt.prompt(); await prompt.userChoice;
  } else {
    help.hidden = !help.hidden;
  }
});
function showUpdate(registration) {
  if (!registration.waiting) return;
  waitingWorker = registration.waiting;
  if (updateButton) { updateButton.hidden = false; updateButton.textContent = t('UPDATE APP ↻'); }
}
updateButton?.addEventListener('click', () => {
  if (busy || !waitingWorker) return;
  reloadOnUpdate = true;
  waitingWorker.postMessage({ type: 'ACTIVATE_UPDATE' });
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloadOnUpdate) location.reload(); });
  navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(registration => {
    showUpdate(registration);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) showUpdate(registration);
      });
    });
  }).catch(() => {
    if (help) { help.hidden = false; help.textContent = t('Offline setup failed. You can keep using the website online.'); }
  });
}
