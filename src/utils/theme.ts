// Theme preference: 'light', 'dark' or 'system' (follow the OS setting), saved in
// localStorage. The resolved theme is set as data-theme on <html>.

export type ThemePreference = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'truecalc-theme';

// Runs inline in <head> before the page paints, so the saved theme is applied
// without a flash. Also follows OS changes while the preference is 'system'.
export const THEME_INIT_SCRIPT = `(function () {
  var root = document.documentElement;
  var mq = window.matchMedia('(prefers-color-scheme: light)');
  function pref() {
    try { var p = localStorage.getItem('${THEME_STORAGE_KEY}'); } catch (e) {}
    return p === 'light' || p === 'dark' ? p : 'system';
  }
  function apply() {
    var p = pref();
    root.dataset.themePref = p;
    root.dataset.theme = p === 'system' ? (mq.matches ? 'light' : 'dark') : p;
  }
  apply();
  mq.addEventListener('change', function () {
    if (root.dataset.themePref === 'system') root.dataset.theme = mq.matches ? 'light' : 'dark';
  });
})();`;

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Storage unavailable (e.g. private mode): the choice lasts for this page only
  }
  const root = document.documentElement;
  const systemLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  root.dataset.themePref = pref;
  root.dataset.theme = pref === 'system' ? (systemLight ? 'light' : 'dark') : pref;
}
