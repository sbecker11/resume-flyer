import { describe, it, expect } from 'vitest';
import { parsePaletteBundleFromImageMetadataJsonl } from './paletteBundleFromImageMetadata.mjs';

describe('paletteBundleFromImageMetadata', () => {
  describe('parsePaletteBundleFromImageMetadataJsonl', () => {
    it('parses valid single-line jsonl', () => {
      const line =
        '{"paletteName":"jungle","colorPalette":["#3f0948","#0c2836","#a62278"],"imagePublicUrl":"https://example.com/1.jpg"}';
      const result = parsePaletteBundleFromImageMetadataJsonl(line);
      expect(result.version).toBe(2);
      expect(result.palettes).toHaveLength(1);
      expect(result.palettes[0]).toEqual({
        name: 'jungle',
        colors: ['#3f0948', '#0c2836', '#a62278'],
        imagePublicUrl: 'https://example.com/1.jpg',
      });
    });

    it('parses multiple lines and skips empty lines', () => {
      const input = `
{"paletteName":"a","colorPalette":["#111"]}

{"paletteName":"b","colorPalette":["#222","#333"]}
`;
      const result = parsePaletteBundleFromImageMetadataJsonl(input);
      expect(result.palettes).toHaveLength(2);
      expect(result.palettes[0].name).toBe('a');
      expect(result.palettes[0].colors).toEqual(['#111']);
      expect(result.palettes[1].name).toBe('b');
      expect(result.palettes[1].colors).toEqual(['#222', '#333']);
    });

    it('includes backgroundSwatchIndex when present', () => {
      const line =
        '{"paletteName":"foo","colorPalette":["#aaa","#bbb"],"backgroundSwatchIndex":1}';
      const result = parsePaletteBundleFromImageMetadataJsonl(line);
      expect(result.palettes[0].backgroundSwatchIndex).toBe(1);
    });

    it('normalizes colors (trim, filter empty)', () => {
      const line = '{"paletteName":"x","colorPalette":["  #fff  ","","#000"]}';
      const result = parsePaletteBundleFromImageMetadataJsonl(line);
      expect(result.palettes[0].colors).toEqual(['#fff', '#000']);
    });

    it('skips lines without paletteName', () => {
      const input =
        '{"colorPalette":["#111"]}\n{"paletteName":"ok","colorPalette":["#222"]}';
      const result = parsePaletteBundleFromImageMetadataJsonl(input);
      expect(result.palettes).toHaveLength(1);
      expect(result.palettes[0].name).toBe('ok');
    });

    it('skips lines without valid colorPalette', () => {
      const input =
        '{"paletteName":"bad","colorPalette":[]}\n{"paletteName":"ok","colorPalette":["#111"]}';
      const result = parsePaletteBundleFromImageMetadataJsonl(input);
      expect(result.palettes).toHaveLength(1);
    });

    it('throws on invalid JSON', () => {
      expect(() =>
        parsePaletteBundleFromImageMetadataJsonl('{invalid}')
      ).toThrow(/line 1: invalid JSON/);
    });

    it('throws when no valid palettes remain', () => {
      expect(() =>
        parsePaletteBundleFromImageMetadataJsonl('{"paletteName":"","colorPalette":[]}')
      ).toThrow(/No valid palettes/);
    });

    it('uses last entry for duplicate paletteName', () => {
      const input =
        '{"paletteName":"dup","colorPalette":["#111"]}\n{"paletteName":"dup","colorPalette":["#222","#333"]}';
      const result = parsePaletteBundleFromImageMetadataJsonl(input);
      expect(result.palettes).toHaveLength(1);
      expect(result.palettes[0].colors).toEqual(['#222', '#333']);
    });
  });
});
