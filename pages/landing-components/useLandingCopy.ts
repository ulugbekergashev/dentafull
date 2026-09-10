import { useLanguage } from '../../context/LanguageContext';
import { content, type LandingCopy } from './content';

/**
 * Landing matnlari + til boshqaruvi.
 *
 * Til app'ning umumiy `LanguageContext` idan olinadi, ya'ni tanlov
 * `app_language` localStorage kalitida saqlanadi va tizimga kirgandan
 * keyin ham o'sha tilda davom etadi.
 */
export function useLandingCopy() {
  const { language, setLanguage } = useLanguage();
  const locale = language === 'ru' ? 'ru-RU' : 'uz-UZ';

  return {
    /** Joriy tildagi matnlar */
    c: content[language] as LandingCopy,
    lang: language,
    setLang: setLanguage,
    /** Raqamni joriy til qoidasi bo'yicha ajratib yozadi */
    fmt: (n: number) => n.toLocaleString(locale),
  };
}
