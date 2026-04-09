import { useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  getNodesBounds,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import {
  FrameNode,
  StickyNoteNode,
  TextLabelNode,
} from "./whiteboardNodes";

const nodeTypes = {
  stickyNote: StickyNoteNode,
  textLabel: TextLabelNode,
  frame: FrameNode,
};

const nodeTemplates = {
  stickyNote: {
    width: 220,
    height: 168,
    label: "Capture a quick idea.\nAnnotate it from the panel.",
  },
  textLabel: {
    width: 250,
    height: 86,
    label: "Short annotation or heading",
  },
  frame: {
    width: 320,
    height: 240,
    label: "New frame",
  },
};

const framePadding = {
  x: 28,
  top: 56,
  bottom: 28,
};

const defaultEdgeOptions = {
  type: "smoothstep",
  deletable: true,
  reconnectable: false,
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: "#314b6b",
  },
  style: {
    stroke: "#314b6b",
    strokeWidth: 2.25,
  },
  labelBgPadding: [10, 4],
  labelBgBorderRadius: 999,
  labelBgStyle: {
    fill: "rgba(255, 250, 242, 0.94)",
  },
  labelStyle: {
    fill: "#30404f",
    fontSize: 12,
    fontWeight: 700,
  },
};

function buildNode(type, id, position, overrides = {}) {
  const template = nodeTemplates[type];

  return {
    id,
    type,
    position,
    data: {
      label: template.label,
      ...overrides.data,
    },
    style: {
      width: template.width,
      height: template.height,
      ...overrides.style,
    },
    ...overrides,
  };
}

function getNodeSize(node) {
  const template = nodeTemplates[node.type] ?? nodeTemplates.stickyNote;

  return {
    width:
      node.width ??
      node.measured?.width ??
      (typeof node.style?.width === "number" ? node.style.width : template.width),
    height:
      node.height ??
      node.measured?.height ??
      (typeof node.style?.height === "number"
        ? node.style.height
        : template.height),
  };
}

function getAbsolutePosition(node, lookup) {
  if (!node.parentId) {
    return node.position;
  }

  const parent = lookup.get(node.parentId);
  if (!parent) {
    return node.position;
  }

  const parentPosition = getAbsolutePosition(parent, lookup);

  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  };
}

function sortNodesByHierarchy(nodes) {
  const originalOrder = new Map(
    nodes.map((node, index) => [node.id, index]),
  );
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const depthCache = new Map();

  function getDepth(node) {
    if (depthCache.has(node.id)) {
      return depthCache.get(node.id);
    }

    if (!node.parentId) {
      depthCache.set(node.id, 0);
      return 0;
    }

    const parent = lookup.get(node.parentId);
    const depth = parent ? getDepth(parent) + 1 : 0;
    depthCache.set(node.id, depth);
    return depth;
  }

  return [...nodes].sort((left, right) => {
    const depthDelta = getDepth(left) - getDepth(right);
    if (depthDelta !== 0) {
      return depthDelta;
    }

    return originalOrder.get(left.id) - originalOrder.get(right.id);
  });
}

function collectDescendantIds(nodes, ids) {
  const selectedIds = new Set(ids);
  let changed = true;

  while (changed) {
    changed = false;

    for (const node of nodes) {
      if (node.parentId && selectedIds.has(node.parentId) && !selectedIds.has(node.id)) {
        selectedIds.add(node.id);
        changed = true;
      }
    }
  }

  return selectedIds;
}

const initialNodes = sortNodesByHierarchy([
  buildNode("stickyNote", "node-1", { x: 86, y: 132 }, {
    data: {
      label: "Sticky notes are for compact ideas.\nDrag them anywhere on the board.",
    },
  }),
  buildNode("textLabel", "node-2", { x: 392, y: 140 }, {
    data: {
      label: "CanvasAct whiteboard",
    },
    style: {
      width: 260,
      height: 92,
    },
  }),
  buildNode("frame", "node-3", { x: 702, y: 102 }, {
    data: {
      label: "Delivery lane",
    },
    style: {
      width: 344,
      height: 260,
    },
  }),
  buildNode("textLabel", "node-4", { x: 34, y: 26 }, {
    parentId: "node-3",
    extent: "parent",
    data: {
      label: "Frames can collect related objects",
    },
    style: {
      width: 238,
      height: 78,
    },
  }),
  buildNode("stickyNote", "node-5", { x: 48, y: 102 }, {
    parentId: "node-3",
    extent: "parent",
    data: {
      label: "Select notes and click Group Into Frame.",
    },
    style: {
      width: 214,
      height: 146,
    },
  }),
]);

const initialEdges = [
  {
    id: "edge-1",
    source: "node-1",
    target: "node-2",
    label: "context",
    ...defaultEdgeOptions,
  },
  {
    id: "edge-2",
    source: "node-2",
    target: "node-5",
    label: "handoff",
    ...defaultEdgeOptions,
  },
];

function Whiteboard() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [mode, setMode] = useState("select");
  const nextIdRef = useRef(6);
  const reactFlow = useReactFlow();

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const selectedFrames = selectedNodes.filter((node) => node.type === "frame");
  const selectedContentNodes = selectedNodes.filter((node) => node.type !== "frame");
  const selectedNode = selectedNodes.length === 1 && selectedEdges.length === 0
    ? selectedNodes[0]
    : null;
  const selectedEdge = selectedEdges.length === 1 && selectedNodes.length === 0
    ? selectedEdges[0]
    : null;
  const canDelete = selectedNodes.length > 0 || selectedEdges.length > 0;
  const canGroup =
    selectedContentNodes.length > 0 && selectedFrames.length <= 1;

  function nextId(prefix) {
    const id = `${prefix}-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return id;
  }

  function createNode(type) {
    const center = reactFlow.screenToFlowPosition({
      x: window.innerWidth * 0.52,
      y: window.innerHeight * 0.5,
    });
    const offset = (nextIdRef.current % 4) * 24;
    const id = nextId("node");
    const newNode = buildNode(type, id, {
      x: center.x - nodeTemplates[type].width / 2 + offset,
      y: center.y - nodeTemplates[type].height / 2 + offset,
    }, {
      selected: true,
    });

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({ ...edge, selected: false })),
    );
    setNodes((currentNodes) =>
      sortNodesByHierarchy([
        ...currentNodes.map((node) => ({ ...node, selected: false })),
        newNode,
      ]),
    );
    setMode("select");
  }

  function deleteSelection() {
    const nodeIdsToDelete = collectDescendantIds(
      nodes,
      selectedNodes.map((node) => node.id),
    );
    const edgeIdsToDelete = new Set(selectedEdges.map((edge) => edge.id));

    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) =>
          !edgeIdsToDelete.has(edge.id) &&
          !nodeIdsToDelete.has(edge.source) &&
          !nodeIdsToDelete.has(edge.target),
      ),
    );
    setNodes((currentNodes) =>
      currentNodes.filter((node) => !nodeIdsToDelete.has(node.id)),
    );
  }

  function annotateSelection(value) {
    if (selectedNode) {
      setNodes((currentNodes) =>
        currentNodes.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: value,
                },
              }
            : node,
        ),
      );
    }

    if (selectedEdge) {
      setEdges((currentEdges) =>
        currentEdges.map((edge) =>
          edge.id === selectedEdge.id
            ? {
                ...edge,
                label: value,
              }
            : edge,
        ),
      );
    }
  }

  function groupIntoFrame() {
    if (!canGroup) {
      return;
    }

    const selectedFrame = selectedFrames[0] ?? null;

    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({ ...edge, selected: false })),
    );
    setNodes((currentNodes) => {
      const nodesById = new Map(currentNodes.map((node) => [node.id, node]));
      const candidates = currentNodes.filter((node) =>
        selectedContentNodes.some((selected) => selected.id === node.id),
      );
      const measuredNodes = candidates.map((node) => {
        const size = getNodeSize(node);

        return {
          ...node,
          position: getAbsolutePosition(node, nodesById),
          width: size.width,
          height: size.height,
        };
      });

      let frameId = selectedFrame?.id;
      let nextNodes = currentNodes.map((node) => ({ ...node, selected: false }));

      if (!frameId) {
        const bounds = getNodesBounds(measuredNodes);
        const newFrame = buildNode(
          "frame",
          nextId("frame"),
          {
            x: bounds.x - framePadding.x,
            y: bounds.y - framePadding.top,
          },
          {
            data: {
              label: `Frame ${nextNodes.filter((node) => node.type === "frame").length + 1}`,
            },
            style: {
              width: Math.max(280, bounds.width + framePadding.x * 2),
              height: Math.max(
                190,
                bounds.height + framePadding.top + framePadding.bottom,
              ),
            },
            selected: true,
          },
        );

        frameId = newFrame.id;
        nextNodes = [...nextNodes, newFrame];
      }

      const latestLookup = new Map(nextNodes.map((node) => [node.id, node]));
      const frameNode = latestLookup.get(frameId);
      const frameAbsolutePosition = getAbsolutePosition(frameNode, latestLookup);

      nextNodes = nextNodes.map((node) => {
        if (!selectedContentNodes.some((selected) => selected.id === node.id)) {
          if (node.id === frameId) {
            return { ...node, selected: true };
          }

          return node;
        }

        const absolutePosition = getAbsolutePosition(node, nodesById);

        return {
          ...node,
          parentId: frameId,
          extent: "parent",
          position: {
            x: Math.max(16, absolutePosition.x - frameAbsolutePosition.x),
            y: Math.max(44, absolutePosition.y - frameAbsolutePosition.y),
          },
          selected: false,
        };
      });

      return sortNodesByHierarchy(nextNodes);
    });
    setMode("select");
  }

  function handleConnect(connection) {
    if (mode !== "connect" || !connection.source || !connection.target) {
      return;
    }

    setEdges((currentEdges) =>
      addEdge(
        {
          ...connection,
          id: nextId("edge"),
          label: "link",
          ...defaultEdgeOptions,
        },
        currentEdges.map((edge) => ({ ...edge, selected: false })),
      ),
    );
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, selected: false })),
    );
    setMode("select");
  }

  return (
    <div className="whiteboard-shell" data-mode={mode}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesConnectable={mode === "connect"}
        nodesDraggable={mode === "select"}
        elementsSelectable
        edgesFocusable
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.8}
        panOnDrag={mode === "select"}
        selectionOnDrag={mode === "select"}
        isValidConnection={(connection) =>
          connection.source !== connection.target
        }
      >
        <Background
          color="#c0cad6"
          gap={24}
          size={1.1}
          variant={BackgroundVariant.Dots}
        />

        <Panel position="top-left" className="flow-panel toolbar-panel">
          <div className="panel-kicker">CanvasAct</div>
          <h1>Whiteboard</h1>
          <p className="panel-copy">
            Only sticky notes, text labels, frames, and arrow connectors.
          </p>

          <section className="panel-section">
            <div className="section-label">Create</div>
            <div className="button-row">
              <button type="button" onClick={() => createNode("stickyNote")}>
                Sticky note
              </button>
              <button type="button" onClick={() => createNode("textLabel")}>
                Text label
              </button>
              <button type="button" onClick={() => createNode("frame")}>
                Frame
              </button>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-label">Atomic actions</div>
            <div className="button-row">
              <button
                type="button"
                className={mode === "select" ? "is-active" : ""}
                onClick={() => setMode("select")}
              >
                Select
              </button>
              <button
                type="button"
                className={mode === "connect" ? "is-active" : ""}
                onClick={() => setMode("connect")}
              >
                Connect
              </button>
              <button
                type="button"
                disabled={!canGroup}
                onClick={groupIntoFrame}
              >
                Group Into Frame
              </button>
              <button
                type="button"
                disabled={!canDelete}
                onClick={deleteSelection}
              >
                Delete
              </button>
            </div>
            <p className="panel-hint">
              Move by dragging. Resize with the handles that appear on the
              selected node.
            </p>
          </section>
        </Panel>

        <Panel position="top-right" className="flow-panel inspector-panel">
          <div className="section-label">Annotate</div>

          {selectedNode ? (
            <>
              <div className="selection-title">
                {selectedNode.type === "stickyNote" && "Sticky note"}
                {selectedNode.type === "textLabel" && "Text label"}
                {selectedNode.type === "frame" && "Frame"}
              </div>
              <textarea
                value={selectedNode.data.label}
                onChange={(event) => annotateSelection(event.target.value)}
                rows={selectedNode.type === "textLabel" ? 3 : 6}
              />
            </>
          ) : null}

          {selectedEdge ? (
            <>
              <div className="selection-title">Connector</div>
              <textarea
                value={selectedEdge.label ?? ""}
                onChange={(event) => annotateSelection(event.target.value)}
                rows={3}
              />
            </>
          ) : null}

          {!selectedNode && !selectedEdge ? (
            <p className="panel-copy muted">
              Select one object to annotate it. Connector captions are edited
              here too.
            </p>
          ) : null}

          <div className="selection-stats">
            <span>{selectedNodes.length} node(s) selected</span>
            <span>{selectedEdges.length} connector(s) selected</span>
          </div>
        </Panel>

        <Panel position="bottom-left" className="flow-panel status-panel">
          <div className="mode-pill">
            {mode === "connect" ? "Connect mode" : "Select mode"}
          </div>
          <p className="panel-copy compact">
            Shift-click multiple nodes, then use <strong>Group Into Frame</strong>.
            In connect mode, drag from one handle to another to create an arrow.
          </p>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Whiteboard />
    </ReactFlowProvider>
  );
}
