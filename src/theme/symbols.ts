export const symbolFonts = {
  symbols: 'ZojerSymbols-Regular',
  editor: 'JeraEditor-Regular',
} as const;

export const symbolFontMap = {
  [symbolFonts.symbols]: require('../../assets/fonts/ZojerSymbols-Regular.ttf'),
  [symbolFonts.editor]: require('../../assets/fonts/JeraEditor-Regular.otf'),
};
