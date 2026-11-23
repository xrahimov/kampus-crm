import { ChoiceList } from "@/components/choice-list";
import { LOCALES, useLocaleChoice, useTranslations, type Locale } from "@/lib/i18n";
import { THEME_CHOICES, useTheme, type ThemeChoice } from "@/lib/theme";

/** What belongs to this phone, not to the account: the language and light or dark. */
export function DeviceSettings() {
  const t = useTranslations();
  const { locale, setLocale } = useLocaleChoice();
  const { choice, setChoice } = useTheme();
  return (
    <>
      <ChoiceList<Locale>
        label={t("common.language")}
        value={locale}
        onChange={setLocale}
        options={LOCALES.map((code) => ({ value: code, label: t(`locales.${code}`) }))}
      />
      <ChoiceList<ThemeChoice>
        label={t("common.theme")}
        value={choice}
        onChange={setChoice}
        options={THEME_CHOICES.map((value) => ({ value, label: t(`theme.${value}`) }))}
      />
    </>
  );
}
