export const symbols = [
  { id: 'aries', glyph: '♈︎', name: 'Aries' },
  { id: 'taurus', glyph: '♉︎', name: 'Taurus' },
  { id: 'gemini', glyph: '♊︎', name: 'Gemini' },
  { id: 'cancer', glyph: '♋︎', name: 'Cancer' },
  { id: 'leo', glyph: '♌︎', name: 'Leo' },
  { id: 'virgo', glyph: '♍︎', name: 'Virgo' },
  { id: 'libra', glyph: '♎︎', name: 'Libra' },
  { id: 'scorpio', glyph: '♏︎', name: 'Scorpio' },
  { id: 'sagittarius', glyph: '♐︎', name: 'Sagittarius' },
  { id: 'capricorn', glyph: '♑︎', name: 'Capricorn' },
  { id: 'aquarius', glyph: '♒︎', name: 'Aquarius' },
  { id: 'pisces', glyph: '♓︎', name: 'Pisces' },
] as const;

export type SymbolFamily = (typeof symbols)[number]['id'];
export type SymbolTag = { family: SymbolFamily; raw: string; start: number; end: number };

// Offsets are UTF-16, matching TextInput selection. Raw sequences are never normalized.
export function recognizeSymbols(text: string): SymbolTag[] {
  const tags: SymbolTag[] = [];
  const pattern = /:([a-z]+):|([\u2648-\u2653])([\uFE0E\uFE0F]?)/giu;
  for (const match of text.matchAll(pattern)) {
    const symbol = match[1]
      ? symbols.find((item) => item.id === match[1].toLowerCase())
      : symbols[match[2].charCodeAt(0) - 0x2648];
    if (symbol) tags.push({ family: symbol.id, raw: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tags;
}

export function familiesIn(text: string): SymbolFamily[] {
  return [...new Set(recognizeSymbols(text).map((tag) => tag.family))];
}

export function shortcodeAt(text: string, selection: { start: number; end: number }) {
  if (selection.start !== selection.end) return null;
  const before = text.slice(0, selection.start);
  const match = /:([a-z]*):?$/i.exec(before);
  if (!match) return null;
  const query = match[1].toLowerCase();
  // A caret inside an unfinished token replaces its suffix too, including the closing colon.
  const suffix = match[0].endsWith(':') && match[0].length > 1 ? '' : /^[a-z]*:?/i.exec(text.slice(selection.start))?.[0] ?? '';
  return { start: match.index, end: selection.start + suffix.length, query, options: symbols.filter((s) => s.id.startsWith(query)) };
}

export function replaceRange(text: string, start: number, end: number, replacement: string) {
  if (start < 0 || end < start || end > text.length) throw new RangeError('Invalid text selection');
  return { text: text.slice(0, start) + replacement + text.slice(end), caret: start + replacement.length };
}
