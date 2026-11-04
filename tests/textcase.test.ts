import { describe, expect, it } from 'vitest';
import { displayCase } from '../src/ui/textcase';

describe('display case for the title face', () => {
  it('turns capitalised UI strings into title case', () => {
    expect(displayCase('QUIT TO TITLE (SAVED)')).toBe('Quit to Title (Saved)');
    expect(displayCase('NEW BROADCAST')).toBe('New Broadcast');
    expect(displayCase('THE PRODUCER — DEAD AIR')).toBe('The Producer — Dead Air');
    expect(displayCase('HANG UP')).toBe('Hang Up');
    expect(displayCase('HOLD SPACE (OR THE LEVER) TO SPIN')).toBe('Hold Space (or the Lever) to Spin');
  });
  it('capitalises the first word and sentence starts; a number counts as the first word', () => {
    expect(displayCase('1-3 OR CLICK')).toBe('1-3 or Click');
    expect(displayCase('ADD A BANKRUPT. A NEW WEDGE')).toBe('Add a Bankrupt. A New Wedge');
  });
  it('keeps numbers, symbols, keys and initialisms', () => {
    expect(displayCase('TRAY $1250 ×1.75')).toBe('Tray $1250 ×1.75');
    expect(displayCase('D3/8')).toBe('D3/8');
    expect(displayCase('PRESS E TO PEEK · ESC PAUSE')).toBe('Press E to Peek · ESC Pause');
    expect(displayCase('OFL-1.1')).toBe('OFL-1.1');
    expect(displayCase("DON'T HANG UP")).toBe("Don't Hang Up");
  });
  it('leaves strings that already use lowercase alone', () => {
    expect(displayCase('Pick a package! Any package!')).toBe('Pick a package! Any package!');
    expect(displayCase('6 SPINS · +4 TOKENS. A quick one.')).toBe('6 SPINS · +4 TOKENS. A quick one.');
  });
});
