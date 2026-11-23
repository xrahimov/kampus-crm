/*
 * Hermes, the JavaScript engine of the native apps, has dates and numbers but
 * not plural rules. The site's texts use them ("{count, plural, …}"), so the
 * missing piece is filled in here, for the app's three languages only. A
 * browser has them already and skips this.
 */
import "@formatjs/intl-getcanonicallocales/polyfill.js";
import "@formatjs/intl-locale/polyfill.js";
import "@formatjs/intl-pluralrules/polyfill.js";
import "@formatjs/intl-pluralrules/locale-data/en.js";
import "@formatjs/intl-pluralrules/locale-data/ru.js";
import "@formatjs/intl-pluralrules/locale-data/uz.js";
