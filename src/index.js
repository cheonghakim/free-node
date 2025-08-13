import { Registry } from "./core/Registry.js";
import { createHooks } from "./core/Hooks.js";
import { Graph } from "./core/Graph.js";
import { CanvasRenderer } from "./render/CanvasRenderer.js";
import { Controller } from "./interact/Controller.js";
import { Runner } from "./core/Runner.js";

export function createGraphEditor(
  canvas,
  { theme, hooks: customHooks, autorun = true } = {}
) {
  const hooks =
    customHooks ??
    createHooks([
      "node:create",
      "node:move",
      "edge:create",
      "edge:delete",
      "graph:serialize",
      "error",
      "runner:tick",
      "runner:start",
      "runner:stop",
    ]);
  const registry = new Registry();
  const graph = new Graph({ hooks, registry });
  const renderer = new CanvasRenderer(canvas, { theme, registry });
  const controller = new Controller({ graph, renderer, hooks });
  const runner = new Runner({ graph, registry, hooks });

  hooks.on("runner:tick", ({ time, dt }) => {
    renderer.draw(graph, {
      selection: controller.selection,
      tempEdge: controller.connecting ? controller.renderTempEdge() : null, // 필요시 helper
      running: true,
      time,
      dt,
    });
  });
  hooks.on("runner:start", () => {
    // 첫 프레임 즉시 렌더
    renderer.draw(graph, {
      selection: controller.selection,
      tempEdge: controller.connecting ? controller.renderTempEdge() : null,
      running: true,
      time: performance.now(),
      dt: 0,
    });
  });
  hooks.on("runner:stop", () => {
    // 정지 프레임
    renderer.draw(graph, {
      selection: controller.selection,
      tempEdge: controller.connecting ? controller.renderTempEdge() : null,
      running: false,
      time: performance.now(),
      dt: 0,
    });
  });

  // default node
  registry.register("core/Note", {
    title: "Note",
    size: { w: 180, h: 80 },
    inputs: [{ name: "in", datatype: "any" }],
    outputs: [{ name: "out", datatype: "any" }],
    onCreate(node) {
      node.state.text = "hello";
    },
    onExecute(node, { dt, getInput, setOutput }) {
      // Simple passthrough with uppercase and a heartbeat value
      const incoming = getInput("in");
      const out = (incoming ?? node.state.text ?? "").toString().toUpperCase();
      setOutput(
        "out",
        out + ` · ${Math.floor((performance.now() / 1000) % 100)}`
      );
    },
    onDraw(node, { ctx, theme }) {
      const pr = 8;
      const { x, y } = node.pos;
      const { width: w } = node.size;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const screenPos = renderer.worldToScreen(x + pr, y + 20);
      ctx.fillStyle = theme.text;
      ctx.font = "11px system-ui";
      // ctx.fillText(node.state.text ?? "hello", x + pr, y + 40);
      ctx.fillText(
        node.state.text ?? "hello",
        screenPos.x + pr,
        screenPos.y + 20
      );
      ctx.restore();
    },
  });

  // initial render & resize

  renderer.resize(canvas.clientWidth, canvas.clientHeight);
  controller.render();

  const ro = new ResizeObserver(() => {
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
    controller.render();
  });
  ro.observe(canvas);

  const api = {
    graph,
    renderer,
    controller,
    hooks,
    registry,
    runner,
    addNode: (...args) => graph.addNode(...args),
    toJSON: () => graph.toJSON(),
    fromJSON: (data) => Graph.fromJSON(data, { hooks, registry }),
    resize: (w, h) => renderer.resize(w, h),
    render: () => controller.render(),
    start: () => runner.start(),
    stop: () => runner.stop(),
    destroy: () => {
      runner.stop();
      ro.disconnect();
    },
  };

  if (autorun) runner.start();
  return api;
}
