import { workspaceView } from './workspace-state.js';
import { connectorRequest, networkPermission } from './connector-client.js';
import { setPwaBusy } from './pwa.js';
import { t, language, translateError } from './i18n.js';
const $ = id => document.getElementById(id);
const state = { account: null, profiles: [], backups: [], busy: false, online: false, gameRunning: false, libraryLoaded: false };
const hash = new URLSearchParams(location.hash.slice(1));
if (/^[a-f0-9]{64}$/.test(hash.get('pair') || '')) {
  sessionStorage.setItem('vlt-pair', hash.get('pair'));
  history.replaceState(null, '', location.pathname + location.search);
}
let token = sessionStorage.getItem('vlt-pair');
function notice(message, kind = '') { $('notice').textContent = message; $('notice').className = `notice ${kind}`; }
function setButtons() {
  setPwaBusy(state.busy);
  document.querySelectorAll('[data-language]').forEach(button => button.disabled = state.busy);
  const view = workspaceView(state);
  $('new-profile').disabled = !view.canSave;
  $('account-connection').textContent = t(view.connection);
  $('account-connection').classList.toggle('connected', !!state.account);
  $('refresh-account').textContent = t(state.busy ? 'CONNECTING…' : view.accountAction);
  $('profile-count').textContent = state.libraryLoaded ? String(state.profiles.length).padStart(2, '0') : '—';
  $('profiles').setAttribute('aria-busy', String(state.busy));
  if ($('empty-title')) {
    $('empty-title').textContent = t(view.emptyTitle);
    $('empty-description').textContent = t(view.emptyDescription);
    $('empty-action').textContent = t(view.emptyAction);
    $('empty-action').disabled = state.busy;
  }
  $('account-guidance').textContent = t(state.account ? 'Profiles will be applied to the account shown above. Switching accounts? Refresh before applying.' : 'Your active Riot account is used to save and apply settings.');
  $('show-backups').disabled = state.busy || !state.online;
  for (const id of ['refresh', 'refresh-account']) $(id).disabled = state.busy;
  document.querySelectorAll('[data-apply]').forEach(button => button.disabled = !view.canApply);
  document.querySelectorAll('[data-delete]').forEach(button => button.disabled = !view.canDelete);
}
async function api(action, extra = {}) {
  if (!token) throw new Error(t('Run Demarrer.cmd in the Windows connector folder to pair this browser with your PC.'));
  let response;
  try {
    const request = connectorRequest(action, extra, token, location.origin, location.hostname === '127.0.0.1');
    response = await fetch(request.url, request.options);
  } catch {
    const denied = await networkPermission() === 'denied';
    throw new Error(t(denied ? 'PC access is blocked. In this site’s browser settings, allow local network or loopback access, then click Connect my PC again.' : 'Connector unavailable. Run Demarrer.cmd and allow local network access if your browser asks.'));
  }
  const data = await response.json();
  if (response.status === 401) {
    token = null; sessionStorage.removeItem('vlt-pair');
    state.account = null;
    throw new Error(t('Pairing expired after the connector restarted. Click Connect my PC to renew it.'));
  }
  if (!response.ok) throw new Error(translateError(data.error || t('The connector rejected this operation.')));
  return data.result;
}
async function run(action) {
  if (state.busy) return;
  state.busy = true; setButtons();
  notice(t('Working… Keep Riot Client signed in to the same account.'));
  try { await action(); } catch (error) { notice(error.message, 'error'); }
  finally { state.busy = false; setButtons(); }
}
function date(value) { return new Date(value).toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
function node(tag, text, className) { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; }
function renderProfiles() {
  const root = $('profiles'); root.replaceChildren();
  $('profile-count').textContent = String(state.profiles.length).padStart(2, '0');
  if (!state.profiles.length) {
    const empty = node('div', '', 'empty');
    const art = node('div', '', 'empty-files'); art.setAttribute('aria-hidden','true'); art.append(node('i'),node('i'));
    const title = node('h4'); title.id = 'empty-title';
    const description = node('p'); description.id = 'empty-description';
    const action = node('button', '', 'empty-action'); action.id = 'empty-action'; action.type = 'button'; action.addEventListener('click', emptyAction);
    const guide = node('a', t('First time? Read the setup guide ↗')); guide.href = '/docs?lang='+language+'#setup';
    empty.append(art, title, description, action, guide);
    root.append(empty);
  }
  state.profiles.forEach((profile, i) => {
    const row = node('article', '', 'profile-row');
    const info = node('div', '', 'profile-info');
    const copy = node('div'); copy.append(node('h4', profile.name), node('p', t('SAVED {date}', { date: date(profile.created) })));
    info.append(node('span', String(i + 1).padStart(2, '0'), 'profile-icon'), copy);
    const button = node('button', t('APPLY ↗'));
    button.setAttribute('aria-label', t('Apply profile {name}', { name: profile.name })); button.dataset.apply = profile.id;
    button.addEventListener('click', () => confirmApply(profile));
    const remove = node('button', t('DELETE'), 'delete-button'); remove.dataset.delete = profile.id;
    remove.setAttribute('aria-label', t('Delete profile {name}', { name: profile.name }));
    remove.addEventListener('click', () => {
      const content = node('div');
      content.append(node('p', t('Remove “{name}” from your profiles?', { name: profile.name })), node('p', t('Account settings and backups will stay unchanged. A copy of the file is kept on this PC in VLTProfiles/Profils-Supprimes.')));
      modal(t('DELETE THIS PROFILE?'), content, t('DELETE'), () => {
        $('modal').close();
        run(async () => { await api('delete', { id: profile.id }); await loadLibrary(); notice(t('Profile “{name}” removed from the library.', { name: profile.name }), 'success'); });
      });
    });
    const actions = node('div', '', 'profile-actions'); actions.append(button, remove);
    row.append(info, actions); root.append(row);
  });
  setButtons();
}
async function loadLibrary() { const library = await api('list'); state.profiles = library.profiles || []; state.backups = library.backups || []; state.libraryLoaded = true; renderProfiles(); }
async function refresh() {
  state.account = null; setButtons();
  try {
    const status = await api('status');
    state.account = status.account; state.gameRunning = status.gameRunning; state.online = true;
    $('account-name').textContent = state.account.name;
    $('account-detail').textContent = t('Verified account: {id}…', { id: state.account.id.slice(0, 8) });
    $('game-state').textContent = state.gameRunning ? t('CLOSE VALORANT TO APPLY A PROFILE') : t('READY TO TRANSFER');
    $('game-state').className = `account-status ${state.gameRunning ? '' : 'ready'}`;
    $('bridge-state').textContent = t('CONNECTOR ONLINE'); $('bridge-state').className = 'connection online';
    await loadLibrary();
    notice(state.gameRunning ? t('Your profiles are ready. Close VALORANT, then detect the account again to apply a profile.') : t('Account verified. Save its settings or apply a profile to this account.'), 'success');
  } catch (error) {
    state.online = false; state.account = null;
    $('bridge-state').textContent = t('CHECK CONNECTION'); $('bridge-state').className = 'connection';
    $('account-name').textContent = t('Account not verified'); $('account-detail').textContent = t('Sign in to Riot Client and detect the account again.');
    $('game-state').textContent = t('RIOT CLIENT REQUIRED'); $('game-state').className = 'account-status';
    // Profiles remain available even when Riot Client is signed out.
    try { await loadLibrary(); state.online = true; } catch { /* the connector may also be closed */ }
    throw error;
  }
}
let modalAction = null;
function modal(title, content, confirmLabel, action) {
  $('modal-title').textContent = title; $('modal-content').replaceChildren(content);
  $('modal-confirm').textContent = confirmLabel; $('modal-confirm').hidden = !action;
  modalAction = action; $('modal').showModal();
}
$('modal-confirm').addEventListener('click', () => { if (modalAction) modalAction(); });
function confirmApply(profile, restore = false) {
  if (!state.account || state.busy) return;
  const account = { ...state.account };
  const content = node('div');
  const text = node('p'); text.append(t('Apply '), node('strong', profile.name), t(' to '), node('strong', account.name), ' ?');
  content.append(text, node('p', t('Current settings will be backed up before replacement. Keep VALORANT closed and Riot Client on this account.')));
  modal(restore ? t('RESTORE SETTINGS?') : t('APPLY THIS CONFIGURATION?'), content, restore ? t('RESTORE ↗') : t('APPLY PROFILE ↗'), () => {
    $('modal').close();
    run(async () => {
      await api(restore ? 'restore' : 'apply', { id: profile.id, account: account.id });
      await loadLibrary();
      notice(t('Profile “{name}” saved to Riot and verified on {account}. You can launch VALORANT.', { name: profile.name, account: account.name }), 'success');
    });
  });
}
$('new-profile').addEventListener('click', () => {
  if (!state.account) return;
  const account = { ...state.account };
  const content = node('div'); content.append(node('p', t('Save synchronized settings from {account}. Each save creates a new version.', { account: account.name })));
  const label = node('label', t('Profile name')); label.htmlFor = 'profile-name';
  const input = node('input'); input.id = 'profile-name'; input.maxLength = 60; input.value = account.name; input.autocomplete = 'off';
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('modal-confirm').click(); } });
  content.append(label, input);
  modal(t('SAVE YOUR CONFIGURATION.'), content, t('SAVE ↗'), () => {
    const name = input.value.trim(); if (!name) { input.focus(); return; }
    $('modal').close();
    run(async () => { await api('save', { name, account: account.id }); await loadLibrary(); notice(t('Profile “{name}” saved on this PC. It will remain available after restarting.', { name }), 'success'); });
  });
  input.focus(); input.select();
});
$('show-backups').addEventListener('click', () => run(async () => {
  await loadLibrary();
  const content = node('div', '', 'backup-list');
  const backups = state.backups.filter(backup => backup.source === state.account?.id);
  if (!backups.length) content.append(node('p', t('No backups for this account yet. Backups are created automatically before each transfer.')));
  for (const backup of backups) {
    const row = node('div', '', 'backup-row'); const button = node('button', t('RESTORE ↗'));
    row.append(node('p', `${backup.name} · ${date(backup.created)}`), button);
    button.addEventListener('click', () => { $('modal').close(); confirmApply(backup, true); }); content.append(row);
  }
  modal(t('YOUR BACKUPS.'), content, '', null);
  notice(t('Showing backups for the detected account.'));
}));
function pairBrowser() {
  location.assign('http://127.0.0.1:43187/launch?lang='+language+(location.hostname === '127.0.0.1' ? '' : '&web=1'));
}
function connectAccount() {
  if (!token) {
    pairBrowser();
    return;
  }
  run(async () => {
    try { await refresh(); } catch (error) { if (!token) { pairBrowser(); return; } throw error; }
  });
}
for (const id of ['refresh', 'refresh-account']) $(id).addEventListener('click', connectAccount);
function emptyAction() { if (state.account) $('new-profile').click(); else connectAccount(); }
$('empty-action').addEventListener('click', emptyAction);
setButtons();
if (token && location.hostname === '127.0.0.1') run(refresh);
else if (token) {
  notice(t('Browser paired. Click Connect my PC and allow local network access if asked.'));
  networkPermission().then(permission => {
    if (permission === 'granted' && !state.busy && !state.online) run(refresh);
    else if (permission === 'denied') notice(t('PC access is blocked. In this site’s browser settings, allow local network or loopback access, then click Connect my PC again.'), 'error');
  });
}
