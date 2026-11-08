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
}
async function api(action, extra = {}) {
  if (!token) throw new Error('Lancez Demarrer.cmd dans le connecteur Windows. Il ouvrira cet onglet associé à votre PC.');
  let response;
  try {
    const endpoint = location.hostname === '127.0.0.1' ? location.origin + '/api' : 'http://127.0.0.1:43187/api';
    response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, ...extra }), signal: AbortSignal.timeout(['apply','restore','save'].includes(action) ? 125_000 : 12_000), cache: 'no-store' });
  } catch { throw new Error('Connecteur inaccessible. Lancez Demarrer.cmd et autorisez l’accès au réseau local si le navigateur le demande.'); }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Le connecteur a refusé cette opération.');
  return data.result;
}
async function run(action) {
  if (state.busy) return;
  state.busy = true; setButtons();
  notice('Opération en cours… Gardez Riot Client sur le même compte.');
  try { await action(); } catch (error) { notice(error.message, 'error'); }
  finally { state.busy = false; setButtons(); }
}
function date(value) { return new Date(value).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }); }
function node(tag, text, className) { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; }
function renderProfiles() {
  const root = $('profiles'); root.replaceChildren();
  $('profile-count').textContent = String(state.profiles.length).padStart(2, '0');
  if (!state.profiles.length) {
    const empty = node('div', '', 'empty');
    empty.append(node('span', '[ + ]', 'empty-mark'), node('h4', 'Votre prochaine configuration commence ici.'), node('p', 'Connectez le compte source dans Riot Client, puis créez un profil. Il restera disponible sur ce PC.'));
    root.append(empty);
  }
  state.profiles.forEach((profile, i) => {
    const row = node('article', '', 'profile-row');
    const info = node('div', '', 'profile-info');
    const copy = node('div'); copy.append(node('h4', profile.name), node('p', `ENREGISTRÉ LE ${date(profile.created)}`));
    info.append(node('span', String(i + 1).padStart(2, '0'), 'profile-icon'), copy);
    const button = node('button', 'APPLIQUER ↗'); button.dataset.apply = profile.id;
    button.addEventListener('click', () => confirmApply(profile));
    row.append(info, button); root.append(row);
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
    $('account-detail').textContent = `Compte vérifié : ${state.account.id.slice(0, 8)}…`;
    $('game-state').textContent = state.gameRunning ? 'FERMEZ VALORANT POUR APPLIQUER UN PROFIL' : 'PRÊT POUR LE TRANSFERT';
    $('game-state').className = `account-status ${state.gameRunning ? '' : 'ready'}`;
    $('bridge-state').textContent = 'CONNECTEUR EN LIGNE'; $('bridge-state').className = 'connection online';
    await loadLibrary();
    notice(state.gameRunning ? 'Vos profils sont disponibles. Fermez VALORANT, puis actualisez pour appliquer une configuration.' : 'Compte vérifié. Vous pouvez enregistrer ses réglages ou lui appliquer un profil.', 'success');
  } catch (error) {
    state.online = false; state.account = null;
    $('bridge-state').textContent = 'CONNEXION À VÉRIFIER'; $('bridge-state').className = 'connection';
    $('account-name').textContent = 'Compte non vérifié'; $('account-detail').textContent = 'Connectez Riot Client et actualisez.';
    $('game-state').textContent = 'RIOT CLIENT REQUIS'; $('game-state').className = 'account-status';
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
  const text = node('p'); text.append('Appliquer ', node('strong', profile.name), ' sur ', node('strong', account.name), ' ?');
  content.append(text, node('p', 'Les réglages actuels seront sauvegardés avant le remplacement. Gardez VALORANT fermé et Riot Client sur ce compte.'));
  modal(restore ? 'RESTAURER LES RÉGLAGES ?' : 'PRÊT À CHANGER DE CONFIG ?', content, restore ? 'RESTAURER ↗' : 'APPLIQUER LE PROFIL ↗', () => {
    $('modal').close();
    run(async () => {
      await api(restore ? 'restore' : 'apply', { id: profile.id, account: account.id });
      await loadLibrary();
      notice(`Profil « ${profile.name} » enregistré chez Riot et relu à l’identique sur ${account.name}. Lancez VALORANT.`, 'success');
    });
  });
}
$('new-profile').addEventListener('click', () => {
  if (!state.account) return;
  const account = { ...state.account };
  const content = node('div'); content.append(node('p', `Enregistrez les réglages synchronisés de ${account.name}. Chaque enregistrement crée une nouvelle version.`));
  const label = node('label', 'Nom du profil'); label.htmlFor = 'profile-name';
  const input = node('input'); input.id = 'profile-name'; input.maxLength = 60; input.value = account.name; input.autocomplete = 'off';
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); $('modal-confirm').click(); } });
  content.append(label, input);
  modal('GARDEZ VOS REPÈRES.', content, 'ENREGISTRER ↗', () => {
    const name = input.value.trim(); if (!name) { input.focus(); return; }
    $('modal').close();
    run(async () => { await api('save', { name, account: account.id }); await loadLibrary(); notice(`Profil « ${name} » enregistré sur ce PC. Il restera disponible après redémarrage.`, 'success'); });
  });
  input.focus(); input.select();
});
$('show-backups').addEventListener('click', () => run(async () => {
  await loadLibrary();
  const content = node('div', '', 'backup-list');
  const backups = state.backups.filter(backup => backup.source === state.account?.id);
  if (!backups.length) content.append(node('p', 'Aucune sauvegarde pour le compte connecté. Elles sont créées automatiquement avant chaque transfert.'));
  for (const backup of backups) {
    const row = node('div', '', 'backup-row'); const button = node('button', 'RESTAURER ↗');
    row.append(node('p', `${backup.name} · ${date(backup.created)}`), button);
    button.addEventListener('click', () => { $('modal').close(); confirmApply(backup, true); }); content.append(row);
  }
  modal('VOS POINTS DE RETOUR.', content, '', null);
  notice('Sauvegardes du compte connecté affichées.');
}));
for (const id of ['refresh', 'refresh-account']) $(id).addEventListener('click', () => run(refresh));
if (token && location.hostname === '127.0.0.1') run(refresh);
else if (token) notice('Onglet associé au connecteur. Cliquez sur « Connecter mon compte » et autorisez l’accès au réseau local si demandé.');
