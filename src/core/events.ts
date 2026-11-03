/**
 * Tiny typed event bus. The rules core emits *presentation* events through one of these;
 * the renderer and audio subscribe and replay. Nothing in game/ depends on a listener existing.
 */

export type Listener<T> = (payload: T) => void;

export class EventBus<M extends Record<string, unknown>> {
  private map = new Map<keyof M, Set<Listener<never>>>();
  private anyListeners = new Set<(type: keyof M, payload: unknown) => void>();

  on<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => set!.delete(fn as Listener<never>);
  }

  once<K extends keyof M>(type: K, fn: Listener<M[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  onAny(fn: (type: keyof M, payload: unknown) => void): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) (fn as Listener<M[K]>)(payload);
    for (const fn of [...this.anyListeners]) fn(type, payload);
  }

  clear(): void {
    this.map.clear();
    this.anyListeners.clear();
  }
}
