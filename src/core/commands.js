// Find an edge id by its endpoints (fallback for undo)
function findEdgeId(graph, a, b, c, d) {
  for (const [id, e] of graph.edges) {
    if (
      e.fromNode === a &&
      e.fromPort === b &&
      e.toNode === c &&
      e.toPort === d
    )
      return id;
  }
  return null;
}

export function MoveNodeCmd(node, fromPos, toPos) {
  return {
    do() {
      node.pos = { ...toPos };
    },
    undo() {
      node.pos = { ...fromPos };
    },
  };
}

export function AddEdgeCmd(graph, fromNode, fromPort, toNode, toPort) {
  let addedId = null;
  return {
    do() {
      graph.addEdge(fromNode, fromPort, toNode, toPort);
      addedId = findEdgeId(graph, fromNode, fromPort, toNode, toPort);
    },
    undo() {
      const id =
        addedId ?? findEdgeId(graph, fromNode, fromPort, toNode, toPort);
      if (id != null) graph.edges.delete(id);
    },
  };
}

export function RemoveEdgeCmd(graph, edgeId) {
  const e = graph.edges.get(edgeId);
  if (!e) return null;
  // capture for undo
  const { fromNode, fromPort, toNode, toPort } = e;
  return {
    do() {
      graph.edges.delete(edgeId);
    },
    undo() {
      graph.addEdge(fromNode, fromPort, toNode, toPort);
    },
  };
}

// Optional: group multiple commands as one (used for "rewire")
export function CompoundCmd(cmds) {
  return {
    do() {
      cmds.forEach((c) => c?.do());
    },
    undo() {
      [...cmds].reverse().forEach((c) => c?.undo());
    },
  };
}

export function RemoveNodeCmd(graph, node) {
  let removedNode = null;
  let removedEdges = [];

  return {
    do() {
      // Store the node and its connected edges for undo
      removedNode = node;
      removedEdges = graph.edges
        ? [...graph.edges.values()].filter((e) => {
            console.log(e);
            return e.fromNode === node.id || e.toNode === node.id;
          })
        : [];

      // Remove edges first
      for (const edge of removedEdges) {
        graph.edges.delete(edge.id);
      }
      // Remove the node
      graph.nodes.delete(node.id);
    },

    undo() {
      // Restore node
      if (removedNode) {
        graph.nodes.set(removedNode.id, removedNode);
      }
      // Restore edges
      for (const edge of removedEdges) {
        graph.edges.set(edge.id, edge);
      }
    },
  };
}

export function ResizeNodeCmd(node, fromSize, toSize) {
  return {
    do() {
      node.size.width = toSize.w;
      node.size.height = toSize.h;
    },
    undo() {
      node.size.width = fromSize.w;
      node.size.height = fromSize.h;
    },
  };
}
