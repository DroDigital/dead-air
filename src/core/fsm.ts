/**
 * Explicit finite-state machine with a declared transition table.
 * Illegal transitions throw in dev so flow bugs surface immediately.
 */

export type AppState =
  | 'Boot'
  | 'Menu'
  | 'DeadlineIntro'
  | 'PackageSelect'
  | 'AwaitAction'
  | 'Spinning'
  | 'Resolving'
  | 'DeadlineEnd'
  | 'Conversion'
  | 'Shop'
  | 'PhoneCall'
  | 'GameOver'
  | 'Victory';

export const APP_TRANSITIONS: Record<AppState, readonly AppState[]> = {
  Boot: ['Menu'],
  Menu: ['DeadlineIntro', 'PackageSelect', 'AwaitAction', 'Conversion', 'Shop', 'PhoneCall', 'DeadlineEnd', 'Menu'],
  DeadlineIntro: ['PackageSelect', 'Menu'],
  PackageSelect: ['AwaitAction', 'Menu'],
  AwaitAction: ['Spinning', 'DeadlineEnd', 'PhoneCall', 'Menu', 'AwaitAction', 'Resolving'],
  Spinning: ['Resolving', 'Menu'],
  Resolving: ['AwaitAction', 'DeadlineEnd', 'PhoneCall', 'Menu', 'Resolving'],
  DeadlineEnd: ['Conversion', 'GameOver', 'Victory', 'Menu'],
  Conversion: ['Shop', 'Menu'],
  Shop: ['PhoneCall', 'DeadlineIntro', 'Menu', 'Shop'],
  PhoneCall: ['DeadlineIntro', 'AwaitAction', 'Shop', 'Menu', 'Resolving'],
  GameOver: ['Menu'],
  Victory: ['Menu', 'DeadlineIntro'],
};

export class Fsm<S extends string> {
  private _state: S;
  private listeners = new Set<(to: S, from: S) => void>();
  readonly history: S[] = [];

  constructor(
    initial: S,
    private readonly table: Record<S, readonly S[]>,
    private readonly strict = true,
  ) {
    this._state = initial;
  }

  get state(): S {
    return this._state;
  }

  is(...states: S[]): boolean {
    return states.includes(this._state);
  }

  can(to: S): boolean {
    return this.table[this._state]?.includes(to) ?? false;
  }

  go(to: S): void {
    if (!this.can(to)) {
      const msg = `FSM: illegal transition ${this._state} -> ${to}`;
      if (this.strict) throw new Error(msg);
      console.warn(msg);
    }
    const from = this._state;
    this._state = to;
    this.history.push(to);
    if (this.history.length > 64) this.history.shift();
    for (const l of [...this.listeners]) l(to, from);
  }

  /** Force a state (used when restoring a save). */
  force(to: S): void {
    const from = this._state;
    this._state = to;
    for (const l of [...this.listeners]) l(to, from);
  }

  onChange(fn: (to: S, from: S) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
