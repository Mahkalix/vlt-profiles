import { french, translate } from './translations.js';
let saved;
try { saved = localStorage.getItem('vlt-language'); } catch { /* Storage may be disabled. */ }
const requested = new URLSearchParams(location.search).get('lang');
export const language = ['fr', 'en'].includes(requested) ? requested : (saved === 'fr' ? 'fr' : 'en');
export const t = (message, params) => translate(message, language, params);
export function translateError(message) {
  if (language !== 'fr') return message;
  if (Object.hasOwn(french, message)) return french[message];
  for (const prefix of ['Transfer not confirmed. Check the account before retrying. Backup:', 'Settings read back from Riot differ from the profile. Check the transfer. Backup:']) {
    if (message.startsWith(prefix)) return t(prefix) + message.slice(prefix.length);
  }
  return message;
}
try { localStorage.setItem('vlt-language', language); } catch { /* URL keeps the choice if storage is unavailable. */ }
document.documentElement.lang = language;
document.title = t(document.title);
const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
const textNodes = [];
while (walker.nextNode()) textNodes.push(walker.currentNode);
for (const textNode of textNodes) {
  if (textNode.parentElement.closest('script, style, code, .brand, [data-no-translate]')) continue;
  const text = textNode.nodeValue;
  const key = text.trim();
  if (key && Object.hasOwn(french, key)) textNode.nodeValue = text.replace(key, t(key));
}
for (const element of document.querySelectorAll('[aria-label], meta[name="description"]')) {
  const attribute = element.matches('meta') ? 'content' : 'aria-label';
  element.setAttribute(attribute, t(element.getAttribute(attribute)));
}
// Explicit URL language also keeps navigation consistent when local storage is blocked.
for (const link of document.querySelectorAll('a[href]')) {
  const url = new URL(link.href);
  if (url.origin === location.origin && ['/', '/docs', '/docs/', '/docs.html'].includes(url.pathname)) {
    url.searchParams.set('lang', language);
    link.href = url.href;
  }
}
for (const button of document.querySelectorAll('[data-language]')) {
  button.setAttribute('aria-pressed', String(button.dataset.language === language));
  button.addEventListener('click', () => {
    if (button.disabled || button.dataset.language === language) return;
    const url = new URL(location.href);
    url.searchParams.set('lang', button.dataset.language);
    try { localStorage.setItem('vlt-language', button.dataset.language); } catch { /* URL fallback. */ }
    location.assign(url.href);
  });
}
