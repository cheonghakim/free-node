export function createHooks(names) {
  const map = Object.fromEntries(names.map((n) => [n, new Set()]));
  return {
    on(name, fn) {
      map[name].add(fn);
      return () => map[name].delete(fn);
    },
    async emit(name, ...args) {
      for (const fn of map[name]) await fn(...args);
    },
  };
}
