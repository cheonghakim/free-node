# Free Node

**Free Node** is a customizable, LiteGraph-style node editor library.  
It uses **Canvas rendering** for fast performance and supports node type registration, execution cycle control, custom drawing, and more.

---

## ✨ Features
- **Canvas-based** fast rendering
- Flexible **node type registration** via `registry.register`
- Automatic or manual execution modes
- Graph serialization/deserialization (`toJSON`, `fromJSON`)
- Mouse-based **zoom, pan, and node dragging**
- Per-node **custom drawing** with `onDraw`
- Simple execution control (`runner.start()`, `runner.stop()`)

---

## 📦 build

```bash
npm run build

```

## Quick start

```js
import { createGraphEditor } from "free-node";

const canvasElement = document.getElementById("canvasElement");

// Create the editor
const editor = createGraphEditor(canvasElement, { autorun: false });

const {
  graph,
  renderer,
  controller,
  hooks,
  registry,
  runner,
  addNode,
  toJSON,
  fromJSON,
  resize,
  render,
  start,
  stop,
  destroy
} = editor;

// Register a custom node type
registry.register("core/Test", {
  title: "Test",
  size: { w: 180, h: 80 },
  inputs: [{ name: "in", datatype: "any" }],
  outputs: [{ name: "out", datatype: "any" }],
  
  onCreate(node) {
    node.state.text = "hello";
  },

  onExecute(node, { dt, getInput, setOutput }) {
    const incoming = getInput("in");
    const out = (incoming ?? node.state.text ?? "").toString().toUpperCase();
    setOutput("out", out + ` · ${Math.floor((performance.now() / 1000) % 100)}`);
  },

  onDraw(node, { ctx, theme }) {
    const pr = 8;
    const { x, y } = node.pos;
    ctx.fillStyle = theme.text;
    ctx.font = "11px system-ui";
    ctx.fillText(node.state.text ?? "hello", x + pr, y + 40);
  },
});

// Add a node
addNode("core/Test", { x: 100, y: 100 });

// Render manually
render();

```