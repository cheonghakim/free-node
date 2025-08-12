export class Runner {
  constructor({ graph, registry, hooks, cyclesPerFrame = 1 }) {
    this.graph = graph;
    this.registry = registry;
    this.hooks = hooks;
    this.running = false;
    this._raf = null;
    this._last = 0;
    this.cyclesPerFrame = Math.max(1, cyclesPerFrame | 0);
  }
  step(cycles = 1, dt = 0) {
    const nCycles = Math.max(1, cycles | 0);
    for (let c = 0; c < nCycles; c++) {
      for (const node of this.graph.nodes.values()) {
        const def = this.registry.types.get(node.type);
        if (def?.onExecute) {
          try {
            def.onExecute(node, {
              dt,
              graph: this.graph,
              getInput: (portName) => {
                const p =
                  node.inputs.find((i) => i.name === portName) ||
                  node.inputs[0];
                return p ? this.graph.getInput(node.id, p.id) : undefined;
              },
              setOutput: (portName, value) => {
                const p =
                  node.outputs.find((o) => o.name === portName) ||
                  node.outputs[0];
                if (p) this.graph.setOutput(node.id, p.id, value);
              },
            });
          } catch (err) {
            this.hooks?.emit("error", err);
          }
        }
      }
      // commit writes for this cycle
      this.graph.swapBuffers();
    }
  }
  start() {
    if (this.running) return;
    this.running = true;
    const step = (t) => {
      if (!this.running) return;
      const dt = this._last ? (t - this._last) / 1000 : 0; // seconds
      this._last = t;
      this.step(this.cyclesPerFrame, dt);
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._last = 0;
  }
}
