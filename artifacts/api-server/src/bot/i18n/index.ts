import { fa } from "./fa";
import { en } from "./en";

export type Lang = "fa" | "en";
export type I18n = typeof fa;

const translations: Record<Lang, typeof fa> = { fa, en };

export function t(lang: Lang | null | undefined): typeof fa {
  return translations[lang ?? "fa"] ?? fa;
}

export { fa, en };
