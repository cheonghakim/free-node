// src/render/hitTest.js
export function hitTestNode(node, x, y) {
  const { x: nx, y: ny } = node.pos;
  const { width, height } = node.size;
  return x >= nx && x <= nx + width && y >= ny && y <= ny + height;
}
export function portRect(node, port, idx, dir) {
  const pad = 8,
    row = 20;
  const y = node.pos.y + 28 + idx * row;
  if (dir === "in") return { x: node.pos.x - pad, y, w: pad, h: 14 };
  if (dir === "out")
    return { x: node.pos.x + node.size.width, y, w: pad, h: 14 };
}
