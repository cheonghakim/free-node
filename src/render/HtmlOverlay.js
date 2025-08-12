// 캔버스 위에 붙는 DOM 오버레이. 캔버스의 scale/offset에 맞춰 CSS transform을 적용.
// 동기화 하기 까다로워서 아직 적용하지 않음
export class HtmlOverlay {
  /**
   * @param {HTMLElement} host  캔버스를 감싸는 래퍼( position: relative )
   * @param {CanvasRenderer} renderer
   * @param {Registry} registry
   */
  constructor(host, renderer, registry) {
    this.host = host;
    this.renderer = renderer;
    this.registry = registry;
    this.container = document.createElement("div");
    Object.assign(this.container.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none", // 기본은 통과
      zIndex: "10",
    });
    host.appendChild(this.container);

    /** @type {Map<string, HTMLElement>} */
    this.nodes = new Map();
  }

  /** 노드용 엘리먼트 생성(한 번만) */
  _ensureNodeElement(node, def) {
    let el = this.nodes.get(node.id);
    if (!el) {
      if (!def?.html?.render) return null; // 해당 타입은 HTML 없음
      el = def.html.render(node); // 사용자 제공: HTMLElement 반환
      if (!el) return null;
      el.style.position = "absolute";
      // 포커스/클릭이 필요하면 이 자식에 pointer-events 허용
      el.style.pointerEvents = "auto";
      this.container.appendChild(el);
      this.nodes.set(node.id, el);
    }
    return el;
  }

  /** 그래프와 변환 동기화하여 렌더링 */
  draw(graph, selection = new Set()) {
    // 컨테이너 전체에 월드 변환 적용 (CSS 픽셀 기준)
    const { scale, offsetX, offsetY } = this.renderer;
    this.container.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    this.container.style.transformOrigin = "0 0";

    const seen = new Set();

    for (const node of graph.nodes.values()) {
      const def =
        this.registry.get?.(node.type) || this.registry.types?.get?.(node.type);
      const hasHtml = !!def?.html?.render;
      if (!hasHtml) continue;

      const el = this._ensureNodeElement(node, def);
      if (!el) continue;

      // 노드 위치/크기 동기화 (월드 좌표 → 컨테이너 내부는 이미 scale/translate 적용)
      el.style.left = `${node.pos.x}px`;
      el.style.top = `${node.pos.y}px`;
      el.style.width = `${node.size.width}px`;
      el.style.height = `${node.size.height}px`;

      // 선택 상태 등 업데이트 훅
      if (def.html.update) {
        def.html.update(node, el, { selected: selection.has(node.id) });
      }

      seen.add(node.id);
    }

    // 없어진 노드 제거
    for (const [id, el] of this.nodes) {
      if (!seen.has(id)) {
        el.remove();
        this.nodes.delete(id);
      }
    }
  }

  destroy() {
    for (const [, el] of this.nodes) el.remove();
    this.nodes.clear();
    this.container.remove();
  }
}
