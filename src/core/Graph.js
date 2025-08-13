import { Node } from "./Node.js";
import { Edge } from "./Edge.js";

export class Graph {
  constructor({ hooks, registry }) {
    this.nodes = new Map();
    this.edges = new Map();
    this.hooks = hooks;
    this.registry = registry;
    // double buffer for deterministic cycles
    this._valuesA = new Map(); // current
    this._valuesB = new Map(); // next
    this._useAasCurrent = true;
  }
  getNodeById(id) {
    for (let [_id, node] of this.nodes.entries()) {
      if (id === _id) {
        return node;
      }
    }

    return null;
  }
  addNode(type, opts = {}) {
    const def = this.registry.types.get(type);
    if (!def) throw new Error(`Unknown node type: ${type}`);
    const node = new Node({
      type,
      title: def.title,
      width: def.size?.w,
      height: def.size?.h,
      ...opts,
    });
    for (const i of def.inputs || []) node.addInput(i.name, i.datatype);
    for (const o of def.outputs || []) node.addOutput(o.name, o.datatype);
    def.onCreate?.(node);
    this.nodes.set(node.id, node);
    this.hooks?.emit("node:create", node);
    return node;
  }
  removeNode(nodeId) {
    for (const [eid, e] of this.edges)
      if (e.fromNode === nodeId || e.toNode === nodeId) this.edges.delete(eid);
    this.nodes.delete(nodeId);
  }
  addEdge(fromNode, fromPort, toNode, toPort) {
    const e = new Edge({ fromNode, fromPort, toNode, toPort });
    this.edges.set(e.id, e);
    this.hooks?.emit("edge:create", e);
    return e;
  }

  clear() {
    this.nodes?.clear();
    this.edges?.clear();
    this.nodes = new Map();
    this.edges = new Map();
  }

  // buffer helpers
  _curBuf() {
    return this._useAasCurrent ? this._valuesA : this._valuesB;
  }
  _nextBuf() {
    return this._useAasCurrent ? this._valuesB : this._valuesA;
  }
  swapBuffers() {
    // when moving to next cycle, promote next->current and clear next
    this._useAasCurrent = !this._useAasCurrent;
    this._nextBuf().clear();
  }
  // data helpers
  setOutput(nodeId, portId, value) {
    this._nextBuf().set(`${nodeId}:${portId}`, value);
  }
  getInput(nodeId, portId) {
    // find upstream edge feeding this input
    for (const e of this.edges.values()) {
      if (e.toNode === nodeId && e.toPort === portId) {
        return this._curBuf().get(`${e.fromNode}:${e.fromPort}`);
      }
    }
    return undefined;
  }
  toJSON() {
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
        state: n.state,
      })),
      edges: [...this.edges.values()],
    };
    this.hooks?.emit("graph:serialize", json);
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
        height: nd.h,
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
