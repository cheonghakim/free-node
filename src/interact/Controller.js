import { hitTestNode, portRect } from "../render/hitTest.js";

export class Controller {
  constructor({ graph, renderer, hooks }) {
    this.graph = graph;
    this.renderer = renderer;
    this.hooks = hooks;

    this.selection = new Set();
    this.dragging = null; // { nodeId, dx, dy }
    this.connecting = null; // { fromNode, fromPort, x(screen), y(screen) }
    this.panning = null; // { x(screen), y(screen) }

    this._cursor = "default";

    this._bindEvents();
  }

  _bindEvents() {
    const c = this.renderer.canvas;
    c.addEventListener("mousedown", (e) => this._onDown(e));
    window.addEventListener("mousemove", (e) => this._onMove(e));
    window.addEventListener("mouseup", (e) => this._onUp(e));
    // 더블클릭으로 노드 생성하지 않음 (요청 사항)
    // c.addEventListener("dblclick", (e) => this._onDbl(e));
    c.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });

    // 필요 시 우클릭 패닝을 원하면 이걸 켜세요.
    // c.addEventListener("contextmenu", e => e.preventDefault());
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
    const factor = Math.pow(1.0015, -e.deltaY); // smooth zoom
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

    // 0) MMB(휠 버튼) 드래그는 항상 패닝
    if (e.button === 1) {
      this.panning = { x: s.x, y: s.y };
      return;
    }

    // 1) 포트(OUT) 위 좌클릭이면 연결 시작
    const port = this._findPortAtWorld(w.x, w.y);
    if (e.button === 0 && port && port.dir === "out") {
      const outR = portRect(port.node, port.port, port.idx, "out");
      const screenFrom = this.renderer.worldToScreen(outR.x, outR.y + 7);
      this.connecting = {
        fromNode: port.node.id,
        fromPort: port.port.id,
        x: screenFrom.x,
        y: screenFrom.y,
      };
      return;
    }

    if (e.button === 0 && port && port.dir === "in") {
      const incoming = this._findIncomingEdge(port.node.id, port.port.id);
      if (incoming) {
        // 원래 소스 쪽에서 다시 끌어오도록, 엣지를 임시 삭제
        const { edge, id } = incoming;
        this.graph.edges.delete(id);
        const outR = portRect(
          this.graph.nodes.get(edge.fromNode),
          this.graph.nodes
            .get(edge.fromNode)
            .outputs.find((p) => p.id === edge.fromPort),
          this.graph.nodes
            .get(edge.fromNode)
            .outputs.findIndex((p) => p.id === edge.fromPort),
          "out"
        );
        const screenFrom = this.renderer.worldToScreen(outR.x, outR.y + 7);
        this.connecting = {
          fromNode: edge.fromNode,
          fromPort: edge.fromPort,
          x: screenFrom.x,
          y: screenFrom.y,
          // 표시용: 끊어낸 대상 인풋
          _rewireFromEdgeId: id,
        };
        this.render();
        return;
      }
      // 들어오는 엣지가 없으면 그냥 무시
    }

    // 2) 노드 위 좌클릭이면 선택 전환 + 드래그 시작
    const node = this._findNodeAtWorld(w.x, w.y);
    if (e.button === 0 && node) {
      if (!e.shiftKey) this.selection.clear();
      this.selection.add(node.id);
      this.dragging = {
        nodeId: node.id,
        dx: w.x - node.pos.x,
        dy: w.y - node.pos.y,
      };
      this.render();
      return;
    }

    // 3) 빈 공간 좌클릭이면: 선택 해제 + 패닝 시작
    if (e.button === 0) {
      if (this.selection.size) this.selection.clear();
      this.panning = { x: s.x, y: s.y };
      this.render();
      return;
    }

    // 기타는 무시
  }

  _onMove(e) {
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
      this.hooks?.emit("node:move", n);
      this.render();
      return;
    }

    // 연결 드래그 프리뷰: 화면 좌표로 저장
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
    const s = this._posScreen(e);
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
    const tEdge = this.connecting
      ? (() => {
          const a = this._portAnchorScreen(
            this.connecting.fromNode,
            this.connecting.fromPort
          ); // {x,y}
          const b = { x: this.connecting.x, y: this.connecting.y }; // {x,y}
          return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; // 명시적으로 x1,y1,x2,y2 구성
        })()
      : null;

    this.renderer.draw(this.graph, {
      selection: this.selection,
      tempEdge: tEdge, // 그대로 전달
    });
  }

  _portAnchorScreen(nodeId, portId) {
    const n = this.graph.nodes.get(nodeId);
    const iOut = n.outputs.findIndex((p) => p.id === portId);
    const r = portRect(n, null, iOut, "out"); // world rect
    return this.renderer.worldToScreen(r.x, r.y + 7); // -> screen point
  }
}

function rectHas(r, x, y) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
