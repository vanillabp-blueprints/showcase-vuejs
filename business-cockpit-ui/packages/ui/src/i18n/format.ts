// One formatter per language, made once. They follow a switch of the language at runtime.
const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

export function formatNumber(value: number, language: string): string {
  if (!numberFormats.has(language)) numberFormats.set(language, new Intl.NumberFormat(language));
  return numberFormats.get(language)!.format(value);
}

export function formatDate(value: Date, language: string): string {
  if (!dateFormats.has(language)) {
    dateFormats.set(language, new Intl.DateTimeFormat(language, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
  }
  return dateFormats.get(language)!.format(value);
}
