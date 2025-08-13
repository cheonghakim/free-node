// src/core/Registry.js
export class Registry {
  constructor() {
    this.types = new Map();
  }
  register(type, def) {
    // def: {title?, size?, inputs?, outputs?, onCreate?, onExecute?, onDraw?}
    if (this.types.has(type)) throw new Error(`Node type exists: ${type}`);
    this.types.set(type, def);
  }
  unregister(type) {
    if (this.types.has(type)) throw new Error(`Node type exists: ${type}`);
    this.types.delete(type);
  }
  removeAll() {
    this.types.clear();
    this.types = new Map();
  }
  createInstance(type) {
    const def = this.types.get(type);
    if (!def) throw new Error(`Unknown node type: ${type}`);
    return def;
  }
}
