const $ = id => document.getElementById(id);
const state = { account: null, profiles: [], backups: [], busy: false, online: false, gameRunning: false };
const hash = new URLSearchParams(location.hash.slice(1));
if (/^[a-f0-9]{64}$/.test(hash.get('pair') || '')) {
  sessionStorage.setItem('vlt-pair', hash.get('pair'));
  history.replaceState(null, '', location.pathname);
}
let token = sessionStorage.getItem('vlt-pair');
function notice(message, kind = '') { $('notice').textContent = message; $('notice').className = `notice ${kind}`; }
function setButtons() {
  $('new-profile').disabled = state.busy || !state.account;
  $('show-backups').disabled = state.busy || !state.online;
  for (const id of ['refresh', 'refresh-account']) $(id).disabled = state.busy;
  document.querySelectorAll('[data-apply]').forEach(button => button.disabled = state.busy || !state.account || state.gameRunning);
  document.querySelectorAll('[data-delete]').forEach(button => button.disabled = state.busy || !state.online);
}
async function api(action, extra = {}) {
  if (!token) throw new Error('Run Demarrer.cmd in the Windows connector folder to pair this browser with your PC.');
  let response;
  try {
    const endpoint = location.hostname === '127.0.0.1' ? location.origin + '/api' : 'http://127.0.0.1:43187/api';
    response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...extra }), signal: AbortSignal.timeout(['apply','restore','save'].includes(action) ? 125_000 : 12_000), cache: 'no-store' });
  } catch { throw new Error('Connector unavailable. Run Demarrer.cmd and allow local network access if your browser asks.'); }
  const data = await response.json();
  if (response.status === 401) {
    token = null; sessionStorage.removeItem('vlt-pair');
    state.account = null;
    throw new Error('Pairing expired after the connector restarted. Click Connect my PC to renew it.');
  }
  if (!response.ok) throw new Error(data.error || 'The connector rejected this operation.');
  return data.result;
}
async function run(action) {
  if (state.busy) return;
  state.busy = true; setButtons();
  notice('Working… Keep Riot Client signed in to the same account.');
  try { await action(); } catch (error) { notice(error.message, 'error'); }
  finally { state.busy = false; setButtons(); }
}
function date(value) { return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); }
function node(tag, text, className) { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; }
function renderProfiles() {
  const root = $('profiles'); root.replaceChildren();
  $('profile-count').textContent = String(state.profiles.length).padStart(2, '0');
  if (!state.profiles.length) {
    const empty = node('div', '', 'empty');
    empty.append(node('span', '[ + ]', 'empty-mark'), node('h4', 'Your next configuration starts here.'), node('p', 'Sign in to the source account in Riot Client, then save a profile. It will stay on this PC.'));
    root.append(empty);
  }
  state.profiles.forEach((profile, i) => {
    const row = node('article', '', 'profile-row');
    const info = node('div', '', 'profile-info');
    const copy = node('div'); copy.append(node('h4', profile.name), node('p', `SAVED ${date(profile.created)}`));
    info.append(node('span', String(i + 1).padStart(2, '0'), 'profile-icon'), copy);
    const button = node('button', 'APPLY ↗'); button.dataset.apply = profile.id;
    button.addEventListener('click', () => confirmApply(profile));
    const remove = node('button', 'DELETE', 'delete-button'); remove.dataset.delete = profile.id;
    remove.setAttribute('aria-label', `Delete profile ${profile.name}`);
    remove.addEventListener('click', () => {
      const content = node('div');
      content.append(node('p', `Remove “${profile.name}” from your profiles?`), node('p', 'Account settings and backups will stay unchanged. A copy of the file is kept on this PC in VLTProfiles/Profils-Supprimes.'));
      modal('DELETE THIS PROFILE?', content, 'DELETE', () => {
        $('modal').close();
        run(async () => { await api('delete', { id: profile.id }); await loadLibrary(); notice(`Profile “${profile.name}” removed from the library.`, 'success'); });
      });
    });
    const actions = node('div', '', 'profile-actions'); actions.append(button, remove);
    row.append(info, actions); root.append(row);
  });
  setButtons();
}
async function loadLibrary() { const library = await api('list'); state.profiles = library.profiles || []; state.backups = library.backups || []; renderProfiles(); }
async function refresh() {
  state.account = null; setButtons();
  try {
    const status = await api('status');
    state.account = status.account; state.gameRunning = status.gameRunning; state.online = true;
    $('account-name').textContent = state.account.name;
    $('account-detail').textContent = `Verified account: ${state.account.id.slice(0, 8)}…`;
    $('game-state').textContent = state.gameRunning ? 'CLOSE VALORANT TO APPLY A PROFILE' : 'READY TO TRANSFER';
    $('game-state').className = `account-status ${state.gameRunning ? '' : 'ready'}`;
    $('bridge-state').textContent = 'CONNECTOR ONLINE'; $('bridge-state').className = 'connection online';
    await loadLibrary();
    notice(state.gameRunning ? 'Your profiles are ready. Close VALORANT, then detect the account again to apply a profile.' : 'Account verified. Save its settings or apply a profile to this account.', 'success');
  } catch (error) {
    state.online = false; state.account = null;
    $('bridge-state').textContent = 'CHECK CONNECTION'; $('bridge-state').className = 'connection';
    $('account-name').textContent = 'Account not verified'; $('account-detail').textContent = 'Sign in to Riot Client and detect the account again.';
    $('game-state').textContent = 'RIOT CLIENT REQUIRED'; $('game-state').className = 'account-status';
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
  const text = node('p'); text.append('Apply ', node('strong', profile.name), ' to ', node('strong', account.name), ' ?');
  content.append(text, node('p', 'Current settings will be backed up before replacement. Keep VALORANT closed and Riot Client on this account.'));
  modal(restore ? 'RESTORE SETTINGS?' : 'APPLY THIS CONFIGURATION?', content, restore ? 'RESTORE ↗' : 'APPLY PROFILE ↗', () => {
    $('modal').close();
    run(async () => {
      await api(restore ? 'restore' : 'apply', { id: profile.id, account: account.id });
      await loadLibrary();
      notice(`Profile “${profile.name}” saved to Riot and verified on ${account.name}. You can launch VALORANT.`, 'success');
    });
  });
}
$('new-profile').addEventListener('click', () => {
  if (!state.account) return;
  const account = { ...state.account };
  const content = node('div'); content.append(node('p', `Save synchronized settings from ${account.name}. Each save creates a new version.`));
  const label = node('label', 'Profile name'); label.htmlFor = 'profile-name';
  const input = node('input'); input.id = 'profile-name'; input.maxLength = 60; input.value = account.name; input.autocomplete = 'off';
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('modal-confirm').click(); } });
  content.append(label, input);
  modal('SAVE YOUR CONFIGURATION.', content, 'SAVE ↗', () => {
    const name = input.value.trim(); if (!name) { input.focus(); return; }
    $('modal').close();
    run(async () => { await api('save', { name, account: account.id }); await loadLibrary(); notice(`Profile “${name}” saved on this PC. It will remain available after restarting.`, 'success'); });
  });
  input.focus(); input.select();
});
$('show-backups').addEventListener('click', () => run(async () => {
  await loadLibrary();
  const content = node('div', '', 'backup-list');
  const backups = state.backups.filter(backup => backup.source === state.account?.id);
  if (!backups.length) content.append(node('p', 'No backups for this account yet. Backups are created automatically before each transfer.'));
  for (const backup of backups) {
    const row = node('div', '', 'backup-row'); const button = node('button', 'RESTORE ↗');
    row.append(node('p', `${backup.name} · ${date(backup.created)}`), button);
    button.addEventListener('click', () => { $('modal').close(); confirmApply(backup, true); }); content.append(row);
  }
  modal('YOUR BACKUPS.', content, '', null);
  notice('Showing backups for the detected account.');
}));
function pairBrowser() {
  location.assign('http://127.0.0.1:43187/launch'+(location.hostname === '127.0.0.1' ? '' : '?web=1'));
}
for (const id of ['refresh', 'refresh-account']) $(id).addEventListener('click', () => {
  if (!token) {
    pairBrowser();
    return;
  }
  run(async () => {
    try { await refresh(); } catch (error) { if (!token) { pairBrowser(); return; } throw error; }
  });
});
if (token && location.hostname === '127.0.0.1') run(refresh);
else if (token) notice('Browser paired. Click Connect my PC and allow local network access if asked.');
