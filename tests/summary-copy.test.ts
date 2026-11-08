import { describe, expect, it } from 'vitest';
import { summaryDescription } from '../src/ui/menus';

describe('end-of-run summary', () => {
  it('identifies a fatal gunshot while preserving the usual loss and win copy', () => {
    expect(summaryDescription(false, 4, 'gun')).toBe('The chamber was loaded at Deadline 4.');
    expect(summaryDescription(false, 4)).toBe('The floor opened at Deadline 4.');
    expect(summaryDescription(true, 8)).toContain('All eight Deadlines paid');
  });
});
