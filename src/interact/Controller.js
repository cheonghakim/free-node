import { hitTestNode, portRect } from "../render/hitTest.js";
import {
  MoveNodeCmd,
  AddEdgeCmd,
  RemoveEdgeCmd,
  CompoundCmd,
  RemoveNodeCmd,
  ResizeNodeCmd,
} from "../core/commands.js";
import { CommandStack } from "../core/CommandStack.js";

export class Controller {

  static MIN_NODE_WIDTH = 80;
  static MIN_NODE_HEIGHT = 60;

  constructor({ graph, renderer, hooks }) {
    this.graph = graph;
    this.renderer = renderer;
    this.hooks = hooks;

    this.stack = new CommandStack();
    this.selection = new Set();
    this.dragging = null; // { nodeId, dx, dy }
    this.connecting = null; // { fromNode, fromPort, x(screen), y(screen) }
    this.panning = null; // { x(screen), y(screen) }
    this.resizing = null;

    this._cursor = "default";

    this._onKeyPressEvt = this._onKeyPress.bind(this);
    this._onDownEvt = this._onDown.bind(this);
    this._onWheelEvt = this._onWheel.bind(this);
    this._onMoveEvt = this._onMove.bind(this);
    this._onUpEvt = this._onUp.bind(this);

    this._bindEvents();
  }

  destructor() {
    const c = this.renderer.canvas;
    c.removeEventListener("mousedown", this._onDownEvt);
    c.removeEventListener("wheel", this._onWheelEvt, { passive: false });
    window.removeEventListener("mousemove", this._onMoveEvt);
    window.removeEventListener("mouseup", this._onUpEvt);
    window.removeEventListener("keydown", this._onKeyPressEvt);
  }

  _bindEvents() {
    const c = this.renderer.canvas;
    c.addEventListener("mousedown", this._onDownEvt);
    c.addEventListener("wheel", this._onWheelEvt, { passive: false });
    window.addEventListener("mousemove", this._onMoveEvt);
    window.addEventListener("mouseup", this._onUpEvt);
    window.addEventListener("keydown", this._onKeyPressEvt);
  }

  _onKeyPress(e) {
    // Undo: Ctrl/Cmd + Z  (Shift+Z → Redo)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) this.stack.redo();
      else this.stack.undo();
      this.render();
      return;
    }

    // Redo: Ctrl/Cmd + Y
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      this.stack.redo();
      this.render();
      return;
    }

    // remove the selected nodes
    if (e.key === "Delete") {
      [...this.selection].forEach((node) => {
        const nodeObj = this.graph.getNodeById(node);
        this.stack.exec(RemoveNodeCmd(this.graph, nodeObj));
        this.graph.removeNode(node);
      });

      this.render();
    }
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

  _resizeHandleRect(node) {
    const s = 10; // handle size (world units)
    return {
      x: node.pos.x + node.size.width - s,
      y: node.pos.y + node.size.height - s,
      w: s,
      h: s,
    };
  }

  _hitResizeHandle(node, wx, wy) {
    const r = this._resizeHandleRect(node);
    return wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h;
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
        const { edge, id } = incoming;

        // remove as command (즉시 실행 → 미리보기에서도 사라짐)
        const rm = RemoveEdgeCmd(this.graph, id);
        if (rm) this.stack.exec(rm);

        const outNode = this.graph.nodes.get(edge.fromNode);
        const iOut = outNode.outputs.findIndex((p) => p.id === edge.fromPort);
        const outR = portRect(outNode, outNode.outputs[iOut], iOut, "out");
        const screenFrom = this.renderer.worldToScreen(outR.x, outR.y + 7);

        this.connecting = {
          fromNode: edge.fromNode,
          fromPort: edge.fromPort,
          x: screenFrom.x,
          y: screenFrom.y,
          _removedEdge: { id, edge }, // 참고용 메모 (이미 제거됨)
        };
        this.render();
        return;
      }
      // 들어오는 엣지가 없으면 그냥 무시
    }

    const node = this._findNodeAtWorld(w.x, w.y);
    // 먼저 리사이즈 핸들 클릭인지 확인
    if (e.button === 0 && node && this._hitResizeHandle(node, w.x, w.y)) {
      this.resizing = {
        nodeId: node.id,
        startW: node.size.width,
        startH: node.size.height,
        startX: w.x,
        startY: w.y,
      };
      if (!e.shiftKey) this.selection.clear();
      this.selection.add(node.id);
      this._setCursor("se-resize");
      this.render();
      return;
    }

    // 2) 노드 위 좌클릭이면 선택 전환 + 드래그 시작
    if (e.button === 0 && node) {
      if (!e.shiftKey) this.selection.clear();
      this.selection.add(node.id);
      this.dragging = {
        nodeId: node.id,
        dx: w.x - node.pos.x,
        dy: w.y - node.pos.y,
        startPos: { x: node.pos.x, y: node.pos.y }, // 원위치 저장
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

    if (this.resizing) {
      const n = this.graph.nodes.get(this.resizing.nodeId);
      const dx = w.x - this.resizing.startX;
      const dy = w.y - this.resizing.startY;

      const minW = Controller.MIN_NODE_WIDTH;
      const minH = Controller.MIN_NODE_HEIGHT; // 최소 크기 (원하면 조정)
      n.size.width = Math.max(minW, this.resizing.startW + dx);
      n.size.height = Math.max(minH, this.resizing.startH + dy);

      this.hooks?.emit("node:resize", n);
      this._setCursor("se-resize");
      this.render();
      return;
    }

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

    const node = this._findNodeAtWorld(w.x, w.y);
    if (node && this._hitResizeHandle(node, w.x, w.y)) {
      this._setCursor("se-resize");
      this.render();
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
        // AddEdge as command
        this.stack.exec(
          AddEdgeCmd(
            this.graph,
            from.fromNode,
            from.fromPort,
            portIn.node.id,
            portIn.port.id
          )
        );
      }
      // else: 빈 곳에 놓으면 이미 RemoveEdgeCmd 실행된 상태 → "해제" 완료

      this.connecting = null;
      this.render();
    }

    if (this.resizing) {
      const n = this.graph.nodes.get(this.resizing.nodeId);
      const from = { w: this.resizing.startW, h: this.resizing.startH };
      const to = { w: n.size.width, h: n.size.height };
      if (from.w !== to.w || from.h !== to.h) {
        this.stack.exec(ResizeNodeCmd(n, from, to));
      }
      this.resizing = null;
      this._setCursor("default");
      // render()는 위에서 이미 호출하고 있으면 생략 가능
    }

    if (this.dragging) {
      const n = this.graph.nodes.get(this.dragging.nodeId);
      const start = this.dragging.startPos;
      const end = { x: n.pos.x, y: n.pos.y };
      // 위치가 바뀐 경우만 커밋
      if (start.x !== end.x || start.y !== end.y) {
        this.stack.exec(MoveNodeCmd(n, start, end));
      }
      this.dragging = null;
    }

    this.dragging = null;
  }

  render() {
    const tEdge = this.renderTempEdge();

    this.renderer.draw(this.graph, {
      selection: this.selection,
      tempEdge: tEdge, // 그대로 전달
    });
  }

  renderTempEdge() {
    if (!this.connecting) return null;
    const a = this._portAnchorScreen(
      this.connecting.fromNode,
      this.connecting.fromPort
    ); // {x,y}
    return {
      x1: a.x,
      y1: a.y,
      x2: this.connecting.x,
      y2: this.connecting.y,
    };
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
