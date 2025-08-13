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

  // 외부에서 실행 중인지 확인
  isRunning() {
    return this.running;
  }

  // 실행 도중에도 CPS 변경 가능
  setCyclesPerFrame(n) {
    this.cyclesPerFrame = Math.max(1, n | 0);
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
            this.hooks?.emit?.("error", err);
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
    this._last = 0;
    this.hooks?.emit?.("runner:start");

    const loop = (t) => {
      if (!this.running) return;
      const dtMs = this._last ? t - this._last : 0;
      this._last = t;
      const dt = dtMs / 1000; // seconds

      // 1) 스텝 실행
      this.step(this.cyclesPerFrame, dt);

      // 2) 프레임 훅 (렌더러/컨트롤러는 여기서 running, time, dt를 받아 표현 업데이트)
      this.hooks?.emit?.("runner:tick", {
        time: t,
        dt,
        running: true,
        cps: this.cyclesPerFrame,
      });

      this._raf = requestAnimationFrame(loop);
    };

    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._last = 0;
    this.hooks?.emit?.("runner:stop");
  }
}
