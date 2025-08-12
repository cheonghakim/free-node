class Registry {
  constructor() {
    this.types = /* @__PURE__ */ new Map();
  }
  register(type, def) {
    if (this.types.has(type)) throw new Error(`Node type exists: ${type}`);
    this.types.set(type, def);
  }
  createInstance(type) {
    const def = this.types.get(type);
    if (!def) throw new Error(`Unknown node type: ${type}`);
    return def;
  }
}
function createHooks(names) {
  const map = Object.fromEntries(names.map((n) => [n, /* @__PURE__ */ new Set()]));
  return {
    on(name, fn) {
      map[name].add(fn);
      return () => map[name].delete(fn);
    },
    async emit(name, ...args) {
      for (const fn of map[name]) await fn(...args);
    }
  };
}
function randomUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"));
  return hex.slice(0, 4).join("") + "-" + hex.slice(4, 6).join("") + "-" + hex.slice(6, 8).join("") + "-" + hex.slice(8, 10).join("") + "-" + hex.slice(10).join("");
}
class Node {
  constructor({ id, type, title, x = 0, y = 0, width = 160, height = 60 }) {
    this.id = id ?? randomUUID();
    this.type = type;
    this.title = title ?? type;
    this.pos = { x, y };
    this.size = { width, height };
    this.inputs = [];
    this.outputs = [];
    this.state = {};
  }
  addInput(name, datatype = "any") {
    const port = { id: randomUUID(), name, datatype, dir: "in" };
    this.inputs.push(port);
    return port;
  }
  addOutput(name, datatype = "any") {
    const port = { id: randomUUID(), name, datatype, dir: "out" };
    this.outputs.push(port);
    return port;
  }
}
class Edge {
  constructor({ id, fromNode, fromPort, toNode, toPort }) {
    this.id = id ?? randomUUID();
    this.fromNode = fromNode;
    this.fromPort = fromPort;
    this.toNode = toNode;
    this.toPort = toPort;
  }
}
class Graph {
  constructor({ hooks, registry }) {
    this.nodes = /* @__PURE__ */ new Map();
    this.edges = /* @__PURE__ */ new Map();
    this.hooks = hooks;
    this.registry = registry;
    this._valuesA = /* @__PURE__ */ new Map();
    this._valuesB = /* @__PURE__ */ new Map();
    this._useAasCurrent = true;
  }
  addNode(type, opts = {}) {
    var _a, _b, _c, _d;
    const def = this.registry.types.get(type);
    if (!def) throw new Error(`Unknown node type: ${type}`);
    const node = new Node({
      type,
      title: def.title,
      width: (_a = def.size) == null ? void 0 : _a.w,
      height: (_b = def.size) == null ? void 0 : _b.h,
      ...opts
    });
    for (const i of def.inputs || []) node.addInput(i.name, i.datatype);
    for (const o of def.outputs || []) node.addOutput(o.name, o.datatype);
    (_c = def.onCreate) == null ? void 0 : _c.call(def, node);
    this.nodes.set(node.id, node);
    (_d = this.hooks) == null ? void 0 : _d.emit("node:create", node);
    return node;
  }
  removeNode(nodeId) {
    for (const [eid, e] of this.edges)
      if (e.fromNode === nodeId || e.toNode === nodeId) this.edges.delete(eid);
    this.nodes.delete(nodeId);
  }
  addEdge(fromNode, fromPort, toNode, toPort) {
    var _a;
    const e = new Edge({ fromNode, fromPort, toNode, toPort });
    this.edges.set(e.id, e);
    (_a = this.hooks) == null ? void 0 : _a.emit("edge:create", e);
    return e;
  }
  // buffer helpers
  _curBuf() {
    return this._useAasCurrent ? this._valuesA : this._valuesB;
  }
  _nextBuf() {
    return this._useAasCurrent ? this._valuesB : this._valuesA;
  }
  swapBuffers() {
    this._useAasCurrent = !this._useAasCurrent;
    this._nextBuf().clear();
  }
  // data helpers
  setOutput(nodeId, portId, value) {
    this._nextBuf().set(`${nodeId}:${portId}`, value);
  }
  getInput(nodeId, portId) {
    for (const e of this.edges.values()) {
      if (e.toNode === nodeId && e.toPort === portId) {
        return this._curBuf().get(`${e.fromNode}:${e.fromPort}`);
      }
    }
    return void 0;
  }
  toJSON() {
    var _a;
    const json = {
      nodes: [...this.nodes.values()].map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        x: n.pos.x,
        y: n.pos.y,
        w: n.size.width,
        h: n.size.height,
        inputs: n.inputs,
        outputs: n.outputs,
        state: n.state
      })),
      edges: [...this.edges.values()]
    };
    (_a = this.hooks) == null ? void 0 : _a.emit("graph:serialize", json);
    return json;
  }
  static fromJSON(json, { hooks, registry }) {
    const g = new Graph({ hooks, registry });
    for (const nd of json.nodes) {
      const node = new Node({
        id: nd.id,
        type: nd.type,
        title: nd.title,
        x: nd.x,
        y: nd.y,
        width: nd.w,
        height: nd.h
      });
      node.inputs = nd.inputs;
      node.outputs = nd.outputs;
      node.state = nd.state || {};
      g.nodes.set(node.id, node);
    }
    for (const ed of json.edges) g.edges.set(ed.id, new Edge(ed));
    return g;
  }
}
function hitTestNode(node, x, y) {
  const { x: nx, y: ny } = node.pos;
  const { width, height } = node.size;
  return x >= nx && x <= nx + width && y >= ny && y <= ny + height;
}
function portRect(node, port, idx, dir) {
  const pad = 8, row = 20;
  const y = node.pos.y + 28 + idx * row;
  if (dir === "in") return { x: node.pos.x - pad, y, w: pad, h: 14 };
  if (dir === "out")
    return { x: node.pos.x + node.size.width, y, w: pad, h: 14 };
}
class CanvasRenderer {
  constructor(canvas, { theme = {}, registry, edgeStyle = "orthogonal" } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.registry = registry;
    this.scale = 1;
    this.minScale = 0.25;
    this.maxScale = 3;
    this.offsetX = 0;
    this.offsetY = 0;
    this.edgeStyle = edgeStyle;
    this.theme = Object.assign(
      {
        bg: "#141417",
        grid: "#25252a",
        node: "#1e1e24",
        title: "#2a2a31",
        text: "#e9e9ef",
        port: "#8aa1ff",
        edge: "#7f8cff"
      },
      theme
    );
  }
  setEdgeStyle(style) {
    this.edgeStyle = style === "line" || style === "orthogonal" ? style : "bezier";
  }
  setRegistry(reg) {
    this.registry = reg;
  }
  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }
  setTransform({
    scale = this.scale,
    offsetX = this.offsetX,
    offsetY = this.offsetY
  } = {}) {
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, scale));
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }
  panBy(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
  }
  zoomAt(factor, cx, cy) {
    const prev = this.scale;
    const next = Math.min(
      this.maxScale,
      Math.max(this.minScale, prev * factor)
    );
    if (next === prev) return;
    const wx = (cx - this.offsetX) / prev;
    const wy = (cy - this.offsetY) / prev;
    this.offsetX = cx - wx * next;
    this.offsetY = cy - wy * next;
    this.scale = next;
  }
  _drawArrowhead(x1, y1, x2, y2, size = 10) {
    const { ctx } = this;
    const s = size / this.scale;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - s * Math.cos(ang - Math.PI / 6),
      y2 - s * Math.sin(ang - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - s * Math.cos(ang + Math.PI / 6),
      y2 - s * Math.sin(ang + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }
  screenToWorld(x, y) {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / this.scale
    };
  }
  worldToScreen(x, y) {
    return {
      x: x * this.scale + this.offsetX,
      y: y * this.scale + this.offsetY
    };
  }
  // ── Drawing ────────────────────────────────────────────────────────────────
  _applyTransform() {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
  }
  _resetTransform() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  drawGrid() {
    const { ctx, canvas, theme, scale, offsetX, offsetY } = this;
    this._resetTransform();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this._applyTransform();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1 / scale;
    const base = 20;
    const step = base;
    const x0 = -offsetX / scale;
    const y0 = -offsetY / scale;
    const x1 = (canvas.width - offsetX) / scale;
    const y1 = (canvas.height - offsetY) / scale;
    const startX = Math.floor(x0 / step) * step;
    const startY = Math.floor(y0 / step) * step;
    ctx.beginPath();
    for (let x = startX; x <= x1; x += step) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    for (let y = startY; y <= y1; y += step) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
    this._resetTransform();
  }
  draw(graph, { selection = /* @__PURE__ */ new Set(), tempEdge = null } = {}) {
    var _a, _b;
    this.drawGrid();
    console.log(tempEdge);
    const { ctx, theme } = this;
    this._applyTransform();
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 2 / this.scale;
    for (const e of graph.edges.values()) this._drawEdge(graph, e);
    if (tempEdge) {
      const a = this.screenToWorld(tempEdge.x1, tempEdge.y1);
      const b = this.screenToWorld(tempEdge.x2, tempEdge.y2);
      const prevDash = this.ctx.getLineDash();
      this.ctx.setLineDash([6 / this.scale, 6 / this.scale]);
      let ptsForArrow = null;
      if (this.edgeStyle === "line") {
        this._drawLine(a.x, a.y, b.x, b.y);
        ptsForArrow = [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y }
        ];
      } else if (this.edgeStyle === "orthogonal") {
        ptsForArrow = this._drawOrthogonal(a.x, a.y, b.x, b.y);
      } else {
        this._drawCurve(a.x, a.y, b.x, b.y);
        ptsForArrow = [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y }
        ];
      }
      this.ctx.setLineDash(prevDash);
      if (ptsForArrow && ptsForArrow.length >= 2) {
        const p1 = ptsForArrow[ptsForArrow.length - 2];
        const p2 = ptsForArrow[ptsForArrow.length - 1];
        this.ctx.fillStyle = this.theme.edge;
        this.ctx.strokeStyle = this.theme.edge;
        this._drawArrowhead(p1.x, p1.y, p2.x, p2.y, 12);
      }
    }
    for (const n of graph.nodes.values()) {
      const sel = selection.has(n.id);
      this._drawNode(n, sel);
      const def = (_b = (_a = this.registry) == null ? void 0 : _a.types) == null ? void 0 : _b.get(n.type);
      if (def == null ? void 0 : def.onDraw) def.onDraw(n, { ctx, theme });
    }
    this._resetTransform();
  }
  _drawNode(node, selected) {
    const { ctx, theme } = this;
    const r = 8;
    const { x, y } = node.pos;
    const { width: w, height: h } = node.size;
    ctx.fillStyle = theme.node;
    ctx.strokeStyle = selected ? "#6cf" : "#333";
    ctx.lineWidth = (selected ? 2 : 1.2) / this.scale;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.title;
    roundRect(ctx, x, y, w, 24, { tl: r, tr: r, br: 0, bl: 0 });
    ctx.fill();
    ctx.fillStyle = theme.text;
    ctx.font = `${12 / this.scale}px system-ui`;
    ctx.fillText(node.title, x + 8, y + 16 / 1);
    ctx.fillStyle = theme.port;
    node.inputs.forEach((p, i) => {
      const rct = portRect(node, p, i, "in");
      ctx.fillRect(rct.x, rct.y, rct.w, rct.h);
    });
    node.outputs.forEach((p, i) => {
      const rct = portRect(node, p, i, "out");
      ctx.fillRect(rct.x, rct.y, rct.w, rct.h);
    });
  }
  _drawEdge(graph, e) {
    const from = graph.nodes.get(e.fromNode);
    const to = graph.nodes.get(e.toNode);
    if (!from || !to) return;
    const iOut = from.outputs.findIndex((p) => p.id === e.fromPort);
    const iIn = to.inputs.findIndex((p) => p.id === e.toPort);
    const pr1 = portRect(from, null, iOut, "out");
    const pr2 = portRect(to, null, iIn, "in");
    const x1 = pr1.x, y1 = pr1.y + 7, x2 = pr2.x, y2 = pr2.y + 7;
    if (this.edgeStyle === "line") {
      this._drawLine(x1, y1, x2, y2);
    } else if (this.edgeStyle === "orthogonal") {
      this._drawOrthogonal(x1, y1, x2, y2);
    } else {
      this._drawCurve(x1, y1, x2, y2);
    }
  }
  _drawLine(x1, y1, x2, y2) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  _drawPolyline(points) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }
  _drawOrthogonal(x1, y1, x2, y2) {
    const midX = (x1 + x2) / 2;
    let pts;
    {
      pts = [
        { x: x1, y: y1 },
        { x: midX, y: y1 },
        { x: midX, y: y2 },
        { x: x2, y: y2 }
      ];
    }
    const { ctx } = this;
    const prevJoin = ctx.lineJoin, prevCap = ctx.lineCap;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    this._drawPolyline(pts);
    ctx.lineJoin = prevJoin;
    ctx.lineCap = prevCap;
    return pts;
  }
  _drawCurve(x1, y1, x2, y2) {
    const { ctx } = this;
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.4);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2);
    ctx.stroke();
  }
}
function roundRect(ctx, x, y, w, h, r = 6) {
  if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
  ctx.beginPath();
  ctx.moveTo(x + r.tl, y);
  ctx.lineTo(x + w - r.tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r.tr);
  ctx.lineTo(x + w, y + h - r.br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
  ctx.lineTo(x + r.bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r.bl);
  ctx.lineTo(x, y + r.tl);
  ctx.quadraticCurveTo(x, y, x + r.tl, y);
  ctx.closePath();
}
class Controller {
  constructor({ graph, renderer, hooks }) {
    this.graph = graph;
    this.renderer = renderer;
    this.hooks = hooks;
    this.selection = /* @__PURE__ */ new Set();
    this.dragging = null;
    this.connecting = null;
    this.panning = null;
    this._cursor = "default";
    this._bindEvents();
  }
  _bindEvents() {
    const c = this.renderer.canvas;
    c.addEventListener("mousedown", (e) => this._onDown(e));
    window.addEventListener("mousemove", (e) => this._onMove(e));
    window.addEventListener("mouseup", (e) => this._onUp(e));
    c.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
  }
  _setCursor(c) {
    if (this._cursor !== c) {
      this._cursor = c;
      this.renderer.canvas.style.cursor = c;
    }
  }
  _posScreen(e) {
    const r = this.renderer.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _posWorld(e) {
    const s = this._posScreen(e);
    return this.renderer.screenToWorld(s.x, s.y);
  }
  _findNodeAtWorld(x, y) {
    const list = [...this.graph.nodes.values()];
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      if (hitTestNode(n, x, y)) return n;
    }
    return null;
  }
  _findPortAtWorld(x, y) {
    for (const n of this.graph.nodes.values()) {
      for (let i = 0; i < n.inputs.length; i++) {
        const r = portRect(n, n.inputs[i], i, "in");
        if (rectHas(r, x, y))
          return { node: n, port: n.inputs[i], dir: "in", idx: i };
      }
      for (let i = 0; i < n.outputs.length; i++) {
        const r = portRect(n, n.outputs[i], i, "out");
        if (rectHas(r, x, y))
          return { node: n, port: n.outputs[i], dir: "out", idx: i };
      }
    }
    return null;
  }
  _onWheel(e) {
    e.preventDefault();
    const { x, y } = this._posScreen(e);
    const factor = Math.pow(1.0015, -e.deltaY);
    this.renderer.zoomAt(factor, x, y);
    this.render();
  }
  _findIncomingEdge(nodeId, portId) {
    for (const [eid, e] of this.graph.edges) {
      if (e.toNode === nodeId && e.toPort === portId) {
        return { id: eid, edge: e };
      }
    }
    return null;
  }
  _onDown(e) {
    const s = this._posScreen(e);
    const w = this._posWorld(e);
    if (e.button === 1) {
      this.panning = { x: s.x, y: s.y };
      return;
    }
    const port = this._findPortAtWorld(w.x, w.y);
    if (e.button === 0 && port && port.dir === "out") {
      const outR = portRect(port.node, port.port, port.idx, "out");
      const screenFrom = this.renderer.worldToScreen(outR.x, outR.y + 7);
      this.connecting = {
        fromNode: port.node.id,
        fromPort: port.port.id,
        x: screenFrom.x,
        y: screenFrom.y
      };
      return;
    }
    if (e.button === 0 && port && port.dir === "in") {
      const incoming = this._findIncomingEdge(port.node.id, port.port.id);
      if (incoming) {
        const { edge, id } = incoming;
        this.graph.edges.delete(id);
        const outR = portRect(
          this.graph.nodes.get(edge.fromNode),
          this.graph.nodes.get(edge.fromNode).outputs.find((p) => p.id === edge.fromPort),
          this.graph.nodes.get(edge.fromNode).outputs.findIndex((p) => p.id === edge.fromPort),
          "out"
        );
        const screenFrom = this.renderer.worldToScreen(outR.x, outR.y + 7);
        this.connecting = {
          fromNode: edge.fromNode,
          fromPort: edge.fromPort,
          x: screenFrom.x,
          y: screenFrom.y,
          // 표시용: 끊어낸 대상 인풋
          _rewireFromEdgeId: id
        };
        this.render();
        return;
      }
    }
    const node = this._findNodeAtWorld(w.x, w.y);
    if (e.button === 0 && node) {
      if (!e.shiftKey) this.selection.clear();
      this.selection.add(node.id);
      this.dragging = {
        nodeId: node.id,
        dx: w.x - node.pos.x,
        dy: w.y - node.pos.y
      };
      this.render();
      return;
    }
    if (e.button === 0) {
      if (this.selection.size) this.selection.clear();
      this.panning = { x: s.x, y: s.y };
      this.render();
      return;
    }
  }
  _onMove(e) {
    var _a;
    const s = this._posScreen(e);
    const w = this.renderer.screenToWorld(s.x, s.y);
    if (this.panning) {
      const dx = s.x - this.panning.x;
      const dy = s.y - this.panning.y;
      this.panning = { x: s.x, y: s.y };
      this.renderer.panBy(dx, dy);
      this.render();
      return;
    }
    if (this.dragging) {
      const n = this.graph.nodes.get(this.dragging.nodeId);
      n.pos.x = w.x - this.dragging.dx;
      n.pos.y = w.y - this.dragging.dy;
      (_a = this.hooks) == null ? void 0 : _a.emit("node:move", n);
      this.render();
      return;
    }
    if (this.connecting) {
      this.connecting.x = s.x;
      this.connecting.y = s.y;
      this.render();
    }
    const port = this._findPortAtWorld(w.x, w.y);
    if (port && (port.dir === "out" || port.dir === "in")) {
      this._setCursor("grabbing");
    } else {
      this._setCursor("default");
    }
  }
  _onUp(e) {
    this._posScreen(e);
    const w = this._posWorld(e);
    if (this.panning) {
      this.panning = null;
      return;
    }
    if (this.connecting) {
      const from = this.connecting;
      const portIn = this._findPortAtWorld(w.x, w.y);
      if (portIn && portIn.dir === "in") {
        this.graph.addEdge(
          from.fromNode,
          from.fromPort,
          portIn.node.id,
          portIn.port.id
        );
      }
      this.connecting = null;
      this.render();
    }
    this.dragging = null;
  }
  render() {
    const tEdge = this.connecting ? (() => {
      const a = this._portAnchorScreen(
        this.connecting.fromNode,
        this.connecting.fromPort
      );
      const b = { x: this.connecting.x, y: this.connecting.y };
      return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    })() : null;
    this.renderer.draw(this.graph, {
      selection: this.selection,
      tempEdge: tEdge
      // 그대로 전달
    });
  }
  _portAnchorScreen(nodeId, portId) {
    const n = this.graph.nodes.get(nodeId);
    const iOut = n.outputs.findIndex((p) => p.id === portId);
    const r = portRect(n, null, iOut, "out");
    return this.renderer.worldToScreen(r.x, r.y + 7);
  }
}
function rectHas(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
class Runner {
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
    var _a;
    const nCycles = Math.max(1, cycles | 0);
    for (let c = 0; c < nCycles; c++) {
      for (const node of this.graph.nodes.values()) {
        const def = this.registry.types.get(node.type);
        if (def == null ? void 0 : def.onExecute) {
          try {
            def.onExecute(node, {
              dt,
              graph: this.graph,
              getInput: (portName) => {
                const p = node.inputs.find((i) => i.name === portName) || node.inputs[0];
                return p ? this.graph.getInput(node.id, p.id) : void 0;
              },
              setOutput: (portName, value) => {
                const p = node.outputs.find((o) => o.name === portName) || node.outputs[0];
                if (p) this.graph.setOutput(node.id, p.id, value);
              }
            });
          } catch (err) {
            (_a = this.hooks) == null ? void 0 : _a.emit("error", err);
          }
        }
      }
      this.graph.swapBuffers();
    }
  }
  start() {
    if (this.running) return;
    this.running = true;
    const step = (t) => {
      if (!this.running) return;
      const dt = this._last ? (t - this._last) / 1e3 : 0;
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
function createGraphEditor(canvas, { theme, hooks: customHooks, autorun = true } = {}) {
  const hooks = customHooks ?? createHooks([
    "node:create",
    "node:move",
    "edge:create",
    "edge:delete",
    "graph:serialize",
    "error"
  ]);
  const registry = new Registry();
  const graph = new Graph({ hooks, registry });
  const renderer = new CanvasRenderer(canvas, { theme, registry });
  const controller = new Controller({ graph, renderer, hooks });
  const runner = new Runner({ graph, registry, hooks });
  registry.register("core/Note", {
    title: "Note",
    size: { w: 180, h: 80 },
    inputs: [{ name: "in", datatype: "any" }],
    outputs: [{ name: "out", datatype: "any" }],
    onCreate(node) {
      node.state.text = "hello";
    },
    onExecute(node, { dt, getInput, setOutput }) {
      const incoming = getInput("in");
      const out = (incoming ?? node.state.text ?? "").toString().toUpperCase();
      setOutput(
        "out",
        out + ` · ${Math.floor(performance.now() / 1e3 % 100)}`
      );
    },
    onDraw(node, { ctx, theme: theme2 }) {
      const pr = 8;
      const { x, y } = node.pos;
      const { width: w } = node.size;
      ctx.fillStyle = theme2.text;
      ctx.font = "11px system-ui";
      ctx.fillText(node.state.text ?? "hello", x + pr, y + 40);
    }
  });
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
    }
  };
  if (autorun) runner.start();
  return api;
}
export {
  createGraphEditor
};
//# sourceMappingURL=free-node.es.js.map
