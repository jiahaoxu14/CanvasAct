import { useEffect, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  getNodesBounds,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
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

const historyLimit = 100;

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

const frameInteriorPadding = {
  left: 16,
  top: 44,
  right: 16,
  bottom: 16,
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

function roundNumber(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function cloneSnapshotData(value) {
  return JSON.parse(JSON.stringify(value));
}

function createSnapshot(nodes, edges, nextId) {
  return {
    nodes: cloneSnapshotData(nodes),
    edges: cloneSnapshotData(edges),
    nextId,
  };
}

function snapshotSignature(snapshot) {
  return JSON.stringify(snapshot);
}

function isTextEditingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    target.isContentEditable
  );
}

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

function getHandlePoint(node, handleId, role, lookup) {
  const absolutePosition = getAbsolutePosition(node, lookup);
  const { width, height } = getNodeSize(node);
  const resolvedHandle = handleId ?? (role === "source" ? "right" : "left");

  switch (resolvedHandle) {
    case "left":
      return {
        x: roundNumber(absolutePosition.x),
        y: roundNumber(absolutePosition.y + height / 2),
      };
    case "top":
      return {
        x: roundNumber(absolutePosition.x + width / 2),
        y: roundNumber(absolutePosition.y),
      };
    case "bottom":
      return {
        x: roundNumber(absolutePosition.x + width / 2),
        y: roundNumber(absolutePosition.y + height),
      };
    case "right":
    default:
      return {
        x: roundNumber(absolutePosition.x + width),
        y: roundNumber(absolutePosition.y + height / 2),
      };
  }
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

function getFrameInteriorBounds(frame, lookup) {
  const absolutePosition = getAbsolutePosition(frame, lookup);
  const { width, height } = getNodeSize(frame);

  return {
    absolutePosition,
    width,
    height,
    left: absolutePosition.x + frameInteriorPadding.left,
    top: absolutePosition.y + frameInteriorPadding.top,
    right: absolutePosition.x + width - frameInteriorPadding.right,
    bottom: absolutePosition.y + height - frameInteriorPadding.bottom,
  };
}

function findBestFrameForNode(node, frames, lookup) {
  const absolutePosition = getAbsolutePosition(node, lookup);
  const { width, height } = getNodeSize(node);
  const center = {
    x: absolutePosition.x + width / 2,
    y: absolutePosition.y + height / 2,
  };

  return (
    frames
      .filter((frame) => frame.id !== node.id)
      .filter((frame) => {
        const bounds = getFrameInteriorBounds(frame, lookup);

        return (
          center.x >= bounds.left &&
          center.x <= bounds.right &&
          center.y >= bounds.top &&
          center.y <= bounds.bottom
        );
      })
      .sort((left, right) => {
        const leftSize = getNodeSize(left);
        const rightSize = getNodeSize(right);

        return (
          leftSize.width * leftSize.height - rightSize.width * rightSize.height
        );
      })[0] ?? null
  );
}

function mergeDraggedNodes(currentNodes, draggedNodes) {
  const draggedLookup = new Map(draggedNodes.map((node) => [node.id, node]));

  return currentNodes.map((node) => {
    const draggedNode = draggedLookup.get(node.id);
    if (!draggedNode) {
      return node;
    }

    return {
      ...node,
      position: draggedNode.position,
      selected: draggedNode.selected ?? node.selected,
    };
  });
}

function getDropTargetFrameId(currentNodes, draggedNodeIds) {
  const lookup = new Map(currentNodes.map((node) => [node.id, node]));
  const frames = currentNodes.filter((node) => node.type === "frame");
  const targets = currentNodes
    .filter((node) => draggedNodeIds.includes(node.id) && node.type !== "frame")
    .map((node) => findBestFrameForNode(node, frames, lookup)?.id ?? null)
    .filter(Boolean);

  if (!targets.length) {
    return null;
  }

  return targets.every((id) => id === targets[0]) ? targets[0] : null;
}

function placeNodesIntoFrames(currentNodes, draggedNodeIds) {
  const lookup = new Map(currentNodes.map((node) => [node.id, node]));
  const frames = currentNodes.filter((node) => node.type === "frame");
  const draggedNodeSet = new Set(draggedNodeIds);
  let changed = false;

  const nextNodes = currentNodes.map((node) => {
    if (!draggedNodeSet.has(node.id) || node.type === "frame") {
      return node;
    }

    const targetFrame = findBestFrameForNode(node, frames, lookup);
    if (!targetFrame || targetFrame.id === node.parentId) {
      return node;
    }

    const absolutePosition = getAbsolutePosition(node, lookup);
    const { width, height } = getNodeSize(node);
    const targetBounds = getFrameInteriorBounds(targetFrame, lookup);
    changed = true;

    return {
      ...node,
      parentId: targetFrame.id,
      extent: "parent",
      position: {
        x: clamp(
          absolutePosition.x - targetBounds.absolutePosition.x,
          frameInteriorPadding.left,
          Math.max(
            frameInteriorPadding.left,
            targetBounds.width - width - frameInteriorPadding.right,
          ),
        ),
        y: clamp(
          absolutePosition.y - targetBounds.absolutePosition.y,
          frameInteriorPadding.top,
          Math.max(
            frameInteriorPadding.top,
            targetBounds.height - height - frameInteriorPadding.bottom,
          ),
        ),
      },
    };
  });

  return changed ? sortNodesByHierarchy(nextNodes) : currentNodes;
}

function buildSceneGraph(nodes, edges, viewport) {
  const lookup = new Map(nodes.map((node) => [node.id, node]));
  const childMap = new Map();

  for (const node of nodes) {
    if (!node.parentId) {
      continue;
    }

    const childIds = childMap.get(node.parentId) ?? [];
    childIds.push(node.id);
    childMap.set(node.parentId, childIds);
  }

  const objects = [];
  const frames = [];

  for (const node of sortNodesByHierarchy(nodes)) {
    const absolutePosition = getAbsolutePosition(node, lookup);
    const size = getNodeSize(node);
    const geometry = {
      x: roundNumber(absolutePosition.x),
      y: roundNumber(absolutePosition.y),
      w: roundNumber(size.width),
      h: roundNumber(size.height),
    };

    if (node.type === "frame") {
      frames.push({
        id: node.id,
        type: "frame",
        content: {
          title: node.data.label,
        },
        geometry,
        childIds: childMap.get(node.id) ?? [],
      });
      continue;
    }

    objects.push({
      id: node.id,
      type: node.type === "stickyNote" ? "sticky-note" : "text-label",
      content: {
        text: node.data.label,
      },
      geometry,
      parentFrameId: node.parentId ?? null,
    });
  }

  const connectors = edges.map((edge) => {
    const sourceNode = lookup.get(edge.source);
    const targetNode = lookup.get(edge.target);

    return {
      id: edge.id,
      type: "connector",
      content: {
        label: edge.label ?? "",
      },
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? "right",
      targetHandle: edge.targetHandle ?? "left",
      geometry:
        sourceNode && targetNode
          ? {
              sourcePoint: getHandlePoint(
                sourceNode,
                edge.sourceHandle,
                "source",
                lookup,
              ),
              targetPoint: getHandlePoint(
                targetNode,
                edge.targetHandle,
                "target",
                lookup,
              ),
            }
          : null,
    };
  });

  const selection = [
    ...nodes.filter((node) => node.selected).map((node) => node.id),
    ...edges.filter((edge) => edge.selected).map((edge) => edge.id),
  ];

  return {
    objects,
    frames,
    connectors,
    viewport: {
      x: roundNumber(viewport.x),
      y: roundNumber(viewport.y),
      zoom: roundNumber(viewport.zoom),
    },
    selection,
  };
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
      label: "Drag a note over a frame to drop it inside.",
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
    sourceHandle: "right",
    targetHandle: "left",
    label: "context",
    ...defaultEdgeOptions,
  },
  {
    id: "edge-2",
    source: "node-2",
    target: "node-5",
    sourceHandle: "right",
    targetHandle: "left",
    label: "handoff",
    ...defaultEdgeOptions,
  },
];

function Whiteboard() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [mode, setMode] = useState("select");
  const [chatPrompt, setChatPrompt] = useState("");
  const [syncState, setSyncState] = useState({
    status: "idle",
    message: "Scene graph has not been sent yet.",
  });
  const [dropTargetFrameId, setDropTargetFrameId] = useState(null);
  const [, setHistoryVersion] = useState(0);
  const nextIdRef = useRef(6);
  const historyRef = useRef({
    past: [],
    future: [],
  });
  const interactionSnapshotRef = useRef(null);
  const reactFlow = useReactFlow();
  const viewport = useViewport();

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const selectedFrames = selectedNodes.filter((node) => node.type === "frame");
  const selectedContentNodes = selectedNodes.filter((node) => node.type !== "frame");
  const selectedNode =
    selectedNodes.length === 1 && selectedEdges.length === 0
      ? selectedNodes[0]
      : null;
  const selectedEdge =
    selectedEdges.length === 1 && selectedNodes.length === 0
      ? selectedEdges[0]
      : null;
  const canDelete = selectedNodes.length > 0 || selectedEdges.length > 0;
  const canGroup =
    selectedContentNodes.length > 0 && selectedFrames.length <= 1;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const sceneGraph = buildSceneGraph(nodes, edges, viewport);
  const sceneGraphJson = JSON.stringify(sceneGraph, null, 2);

  const flowNodes = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isDropTarget: dropTargetFrameId === node.id,
      onResizeStart: beginInteraction,
      onResizeEnd: () => {
        requestAnimationFrame(() => {
          finalizeInteraction();
        });
      },
    },
  }));

  function snapshotCurrent(currentNodes = nodes, currentEdges = edges) {
    return createSnapshot(currentNodes, currentEdges, nextIdRef.current);
  }

  function pushHistorySnapshot(snapshot) {
    const history = historyRef.current;
    const lastSnapshot = history.past[history.past.length - 1];

    if (
      lastSnapshot &&
      snapshotSignature(lastSnapshot) === snapshotSignature(snapshot)
    ) {
      return;
    }

    history.past.push(snapshot);
    if (history.past.length > historyLimit) {
      history.past.shift();
    }
    history.future = [];
    setHistoryVersion((version) => version + 1);
  }

  function applySnapshot(snapshot) {
    setNodes(cloneSnapshotData(snapshot.nodes));
    setEdges(cloneSnapshotData(snapshot.edges));
    nextIdRef.current = snapshot.nextId;
    setDropTargetFrameId(null);
  }

  function beginInteraction() {
    interactionSnapshotRef.current = snapshotCurrent();
  }

  function finalizeInteraction(currentNodes = nodes, currentEdges = edges) {
    const interactionSnapshot = interactionSnapshotRef.current;
    interactionSnapshotRef.current = null;

    if (!interactionSnapshot) {
      return;
    }

    const currentSnapshot = createSnapshot(
      currentNodes,
      currentEdges,
      nextIdRef.current,
    );

    if (
      snapshotSignature(interactionSnapshot) ===
      snapshotSignature(currentSnapshot)
    ) {
      return;
    }

    const history = historyRef.current;
    const lastSnapshot = history.past[history.past.length - 1];

    if (
      !lastSnapshot ||
      snapshotSignature(lastSnapshot) !== snapshotSignature(interactionSnapshot)
    ) {
      history.past.push(interactionSnapshot);
      if (history.past.length > historyLimit) {
        history.past.shift();
      }
    }

    history.future = [];
    setHistoryVersion((version) => version + 1);
  }

  function undo() {
    const history = historyRef.current;
    if (!history.past.length) {
      return;
    }

    const currentSnapshot = snapshotCurrent();
    const previousSnapshot = history.past.pop();
    history.future.push(currentSnapshot);
    applySnapshot(previousSnapshot);
    setHistoryVersion((version) => version + 1);
  }

  function redo() {
    const history = historyRef.current;
    if (!history.future.length) {
      return;
    }

    const currentSnapshot = snapshotCurrent();
    const nextSnapshot = history.future.pop();
    history.past.push(currentSnapshot);
    applySnapshot(nextSnapshot);
    setHistoryVersion((version) => version + 1);
  }

  function nextId(prefix) {
    const id = `${prefix}-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return id;
  }

  function updateDropTarget(draggedNodes) {
    const mergedNodes = mergeDraggedNodes(nodes, draggedNodes);
    const draggedIds = draggedNodes.map((node) => node.id);
    setDropTargetFrameId(getDropTargetFrameId(mergedNodes, draggedIds));
  }

  function finalizeDraggedNodes(draggedNodes) {
    const mergedNodes = mergeDraggedNodes(nodes, draggedNodes);
    const draggedIds = draggedNodes.map((node) => node.id);
    const nextNodes = placeNodesIntoFrames(mergedNodes, draggedIds);

    setNodes(nextNodes);
    setDropTargetFrameId(null);
    finalizeInteraction(nextNodes, edges);
  }

  function createNode(type) {
    pushHistorySnapshot(snapshotCurrent());

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
    if (!canDelete) {
      return;
    }

    pushHistorySnapshot(snapshotCurrent());

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
    if (selectedNode && selectedNode.data.label === value) {
      return;
    }

    if (selectedEdge && (selectedEdge.label ?? "") === value) {
      return;
    }

    pushHistorySnapshot(snapshotCurrent());

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

    pushHistorySnapshot(snapshotCurrent());

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

    pushHistorySnapshot(snapshotCurrent());

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

  function exportSceneGraph() {
    const blob = new Blob([sceneGraphJson], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "canvas-state.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function sendSceneGraph() {
    setSyncState({
      status: "sending",
      message: "Sending canvas state to backend...",
    });

    try {
      const response = await fetch("/api/canvas-state", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: sceneGraphJson,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? "Backend rejected canvas state.");
      }

      setSyncState({
        status: "success",
        message: `Saved ${payload.counts.objects} object(s), ${payload.counts.frames} frame(s), and ${payload.counts.connectors} connector(s).`,
      });
    } catch (error) {
      setSyncState({
        status: "error",
        message: error.message,
      });
    }
  }

  function handlePromptSubmit(event) {
    event.preventDefault();
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (isTextEditingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const isMetaKey = event.metaKey || event.ctrlKey;

      if (isMetaKey && key === "z" && !event.altKey) {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (isMetaKey && key === "y" && !event.altKey) {
        event.preventDefault();
        redo();
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && canDelete) {
        event.preventDefault();
        deleteSelection();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canDelete, deleteSelection, redo, undo]);

  return (
    <div className="whiteboard-shell" data-mode={mode}>
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStart={() => beginInteraction()}
        onNodeDrag={(_event, node) => updateDropTarget([node])}
        onNodeDragStop={(_event, node) => {
          if (node.selected && selectedNodes.length > 1) {
            return;
          }

          finalizeDraggedNodes([node]);
        }}
        onSelectionDragStart={() => beginInteraction()}
        onSelectionDrag={(_event, draggedNodes) => updateDropTarget(draggedNodes)}
        onSelectionDragStop={(_event, draggedNodes) =>
          finalizeDraggedNodes(draggedNodes)
        }
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesConnectable={mode === "connect"}
        nodesDraggable={mode === "select"}
        elementsSelectable
        edgesFocusable
        deleteKeyCode={null}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.35}
        maxZoom={1.8}
        panOnDrag={mode === "select"}
        selectionOnDrag={mode === "select"}
        selectionMode={SelectionMode.Partial}
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
            The scene graph is explicit: stable ids, content, geometry,
            viewport, selection, frames, and connectors.
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
            <div className="button-row history-row">
              <button type="button" disabled={!canUndo} onClick={undo}>
                Undo
              </button>
              <button type="button" disabled={!canRedo} onClick={redo}>
                Redo
              </button>
            </div>
            <p className="panel-hint">
              Drag notes directly onto frames. Undo and redo use
              <code> Cmd/Ctrl+Z </code>
              and
              <code> Shift+Cmd/Ctrl+Z</code>.
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
              Select one node or connector to edit its annotation.
            </p>
          ) : null}

          <div className="selection-stats">
            <span>{sceneGraph.objects.length} object(s)</span>
            <span>{sceneGraph.frames.length} frame(s)</span>
            <span>{sceneGraph.connectors.length} connector(s)</span>
          </div>
        </Panel>

        <Panel position="bottom-left" className="flow-panel status-panel">
          <div className="mode-pill">
            {mode === "connect" ? "Connect mode" : "Select mode"}
          </div>
          <p className="panel-copy compact">
            Box-select with Shift-drag or multi-select with Cmd/Ctrl-click, then
            move the notes together or drop them into a frame.
          </p>
        </Panel>

        <Panel position="bottom-center" className="flow-panel prompt-panel">
          <div className="section-label">Chat Prompt</div>
          <form className="prompt-form" onSubmit={handlePromptSubmit}>
            <input
              type="text"
              value={chatPrompt}
              onChange={(event) => setChatPrompt(event.target.value)}
              placeholder="Describe the next whiteboard action..."
              aria-label="Chat prompt"
            />
            <button type="submit">Send</button>
          </form>
        </Panel>

        <Panel position="bottom-right" className="flow-panel scene-panel">
          <div className="section-label">Scene Graph</div>
          <div className="scene-meta">
            <span>Selection: {sceneGraph.selection.length}</span>
            <span>
              Viewport: {sceneGraph.viewport.x}, {sceneGraph.viewport.y},{" "}
              {sceneGraph.viewport.zoom}x
            </span>
          </div>
          <div className="button-row">
            <button type="button" onClick={exportSceneGraph}>
              Export JSON
            </button>
            <button
              type="button"
              className={syncState.status === "sending" ? "is-active" : ""}
              onClick={sendSceneGraph}
            >
              Send To Backend
            </button>
          </div>
          <div className={`sync-status sync-status-${syncState.status}`}>
            {syncState.message}
          </div>
          <pre className="scene-preview">{sceneGraphJson}</pre>
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
