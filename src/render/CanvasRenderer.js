import { hitTestNode, portRect } from "./hitTest.js";

export class CanvasRenderer {
  constructor(canvas, { theme = {}, registry, edgeStyle = "orthogonal" } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.registry = registry; // to call per-node onDraw

    // viewport transform
    this.scale = 1;
    this.minScale = 0.25;
    this.maxScale = 3;
    this.offsetX = 0;
    this.offsetY = 0;

    // 'bezier' | 'line' | 'orthogonal'
    this.edgeStyle = edgeStyle;

    this.theme = Object.assign(
      {
        bg: "#141417",
        grid: "#25252a",
        node: "#1e1e24",
        title: "#2a2a31",
        text: "#e9e9ef",
        port: "#8aa1ff",
        edge: "#7f8cff",
      },
      theme
    );
  }
  setEdgeStyle(style) {
    this.edgeStyle =
      style === "line" || style === "orthogonal" ? style : "bezier";
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
    offsetY = this.offsetY,
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
    // factor > 1 zoom in, < 1 zoom out, centered at screen point (cx, cy)
    const prev = this.scale;
    const next = Math.min(
      this.maxScale,
      Math.max(this.minScale, prev * factor)
    );
    if (next === prev) return;
    // keep the world point under cursor fixed: adjust offset
    const wx = (cx - this.offsetX) / prev;
    const wy = (cy - this.offsetY) / prev;
    this.offsetX = cx - wx * next;
    this.offsetY = cy - wy * next;
    this.scale = next;
  }
  _drawArrowhead(x1, y1, x2, y2, size = 10) {
    const { ctx } = this;
    const s = size / this.scale; // 줌에 따라 크기 보정
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
    ctx.fill(); // 선 색상과 동일한 fill이 자연스러움
  }

  screenToWorld(x, y) {
    return {
      x: (x - this.offsetX) / this.scale,
      y: (y - this.offsetY) / this.scale,
    };
  }
  worldToScreen(x, y) {
    return {
      x: x * this.scale + this.offsetX,
      y: y * this.scale + this.offsetY,
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

  _drawScreenText(
    text,
    lx,
    ly,
    {
      fontPx = 12,
      color = this.theme.text,
      align = "left",
      baseline = "alphabetic",
      dpr = 1, // 추후 devicePixelRatio 도입
    } = {}
  ) {
    const { ctx } = this;
    const { x: sx, y: sy } = this.worldToScreen(lx, ly);

    ctx.save();
    // 화면 좌표계(스케일=1)로 리셋
    this._resetTransform();

    // 픽셀 스냅(번짐 방지)
    const px = Math.round(sx) + 0.5;
    const py = Math.round(sy) + 0.5;

    ctx.font = `${fontPx * this.scale}px system-ui`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillText(text, px, py);
    ctx.restore();
  }

  drawGrid() {
    const { ctx, canvas, theme, scale, offsetX, offsetY } = this;
    // clear screen in screen space

    this._resetTransform();
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw grid in world space so it pans/zooms
    this._applyTransform();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1 / scale; // keep 1px apparent

    const base = 20; // world units
    const step = base;

    // visible world bounds
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

  draw(
    graph,
    {
      selection = new Set(),
      tempEdge = null,
      running = false,
      time = performance.now(),
      dt = 0,
    } = {}
  ) {
    this.drawGrid();
    const { ctx, theme } = this;
    this._applyTransform();

    ctx.save();
    if (running) {
      const speed = 120; // px/s
      const phase = (((time / 1000) * speed) / this.scale) % 12;
      ctx.setLineDash([6 / this.scale, 6 / this.scale]);
      ctx.lineDashOffset = -phase;
    } else {
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    // edges
    ctx.strokeStyle = theme.edge;
    ctx.lineWidth = 2 * this.scale;
    for (const e of graph.edges.values()) this._drawEdge(graph, e);

    // temp edge (given in screen coords); convert to world if needed
    // draw(graph, { selection, tempEdge }) 내부의 tempEdge 처리 구간만 교체
    if (tempEdge) {
      const a = this.screenToWorld(tempEdge.x1, tempEdge.y1);
      const b = this.screenToWorld(tempEdge.x2, tempEdge.y2);

      // 점선 프리뷰
      const prevDash = this.ctx.getLineDash();
      this.ctx.setLineDash([6 / this.scale, 6 / this.scale]);

      let ptsForArrow = null;
      if (this.edgeStyle === "line") {
        this._drawLine(a.x, a.y, b.x, b.y);
        ptsForArrow = [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y },
        ];
      } else if (this.edgeStyle === "orthogonal") {
        ptsForArrow = this._drawOrthogonal(a.x, a.y, b.x, b.y);
      } else {
        this._drawCurve(a.x, a.y, b.x, b.y);
        ptsForArrow = [
          { x: a.x, y: a.y },
          { x: b.x, y: b.y },
        ];
      }

      this.ctx.setLineDash(prevDash);

      // 화살표 표시: 마지막 세그먼트 방향 사용
      if (ptsForArrow && ptsForArrow.length >= 2) {
        const p1 = ptsForArrow[ptsForArrow.length - 2];
        const p2 = ptsForArrow[ptsForArrow.length - 1];
        this.ctx.fillStyle = this.theme.edge;
        this.ctx.strokeStyle = this.theme.edge;
        this._drawArrowhead(p1.x, p1.y, p2.x, p2.y, 12);
      }
    }
    ctx.restore();

    // nodes
    for (const n of graph.nodes.values()) {
      const sel = selection.has(n.id);
      this._drawNode(n, sel);
      const def = this.registry?.types?.get(n.type);
      if (def?.onDraw) def.onDraw(n, { ctx, theme });
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

    this._drawScreenText(node.title, x + 8, y + 12, {
      fontPx: 12,
      color: theme.text,
      baseline: "middle",
      align: "left",
    });
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
    const x1 = pr1.x,
      y1 = pr1.y + 7,
      x2 = pr2.x,
      y2 = pr2.y + 7;
    if (this.edgeStyle === "line") {
      this._drawLine(x1, y1, x2, y2);
    } else if (this.edgeStyle === "orthogonal") {
      this._drawOrthogonal(x1, y1, x2, y2);
    } else {
      this._drawCurve(x1, y1, x2, y2); // bezier (기존)
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
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    // 중간 축을 결정 (더 짧은 축을 가운데에 두면 보기 좋음)
    const useHVH = true; // 가로-세로-가로(HVH) vs 세로-가로-세로(VHV)
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    let pts;
    if (useHVH) {
      // x1,y1 → midX,y1 → midX,y2 → x2,y2
      pts = [
        { x: x1, y: y1 },
        { x: midX, y: y1 },
        { x: midX, y: y2 },
        { x: x2, y: y2 },
      ];
    }
    // else {
    //   // x1,y1 → x1,midY → x2,midY → x2,y2
    //   pts = [
    //     { x: x1, y: y1 },
    //     { x: x1, y: midY },
    //     { x: x2, y: midY },
    //     { x: x2, y: y2 },
    //   ];
    // }

    // 라운드 코너
    const { ctx } = this;
    const prevJoin = ctx.lineJoin,
      prevCap = ctx.lineCap;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    this._drawPolyline(pts);
    ctx.lineJoin = prevJoin;
    ctx.lineCap = prevCap;

    return pts; // 화살표 각도 계산에 사용
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
