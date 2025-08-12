import { randomUUID } from "../utils/utils.js";

// src/core/Node.js
export class Node {
  constructor({ id, type, title, x = 0, y = 0, width = 160, height = 60 }) {
    this.id = id ?? randomUUID();
    this.type = type;
    this.title = title ?? type;
    this.pos = { x, y };
    this.size = { width, height };
    this.inputs = []; // {id,name,datatype}
    this.outputs = []; // {id,name,datatype}
    this.state = {}; // 사용자 상태
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
