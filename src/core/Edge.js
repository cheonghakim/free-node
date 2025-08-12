import { randomUUID } from "../utils/utils.js";

// src/core/Edge.js
export class Edge {
  constructor({ id, fromNode, fromPort, toNode, toPort }) {
    this.id = id ?? randomUUID();
    this.fromNode = fromNode;
    this.fromPort = fromPort;
    this.toNode = toNode;
    this.toPort = toPort;
  }
}
