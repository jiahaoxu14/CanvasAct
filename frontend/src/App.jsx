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
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import { StickyNoteNode, TextLabelNode } from "./whiteboardNodes";

const nodeTypes = {
  stickyNote: StickyNoteNode,
  textLabel: TextLabelNode,
};

const historyLimit = 100;

const nodeTemplates = {
  stickyNote: {
    width: 220,
    height: 156,
    label: "Capture a quick idea.",
  },
  textLabel: {
    width: 250,
    height: 84,
    label: "Short annotation or heading",
  },
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

const emptyReferenceResolution = {
  resolvedReferences: [],
  ambiguousReferences: [],
  unresolvedReferences: [],
};

const textLabelAutoSize = {
  minWidth: 170,
  maxWidth: 460,
  minHeight: 58,
  paddingX: 36,
  paddingY: 28,
  lineHeight: 28,
  charWidth: 9.5,
};

function roundNumber(value) {
  return Math.round(value * 100) / 100;
}

function cloneSnapshotData(value) {
  return JSON.parse(JSON.stringify(value));
}

function getTextLabelSizeForText(text) {
  const textValue = typeof text === "string" ? text : "";
  const paragraphs = textValue ? textValue.split("\n") : [""];
  const longestLineChars = paragraphs.reduce(
    (currentMax, paragraph) => Math.max(currentMax, Math.max(paragraph.length, 1)),
    1,
  );
  const minContentWidth = textLabelAutoSize.minWidth - textLabelAutoSize.paddingX;
  const maxContentWidth = textLabelAutoSize.maxWidth - textLabelAutoSize.paddingX;
  const naturalContentWidth = Math.ceil(
    longestLineChars * textLabelAutoSize.charWidth,
  );
  const contentWidth = Math.max(
    minContentWidth,
    Math.min(maxContentWidth, naturalContentWidth),
  );
  const lineCount = paragraphs.reduce(
    (total, paragraph) =>
      total +
      Math.max(
        1,
        Math.ceil(
          (Math.max(paragraph.length, 1) * textLabelAutoSize.charWidth) /
            contentWidth,
        ),
      ),
    0,
  );

  return {
    width: contentWidth + textLabelAutoSize.paddingX,
    height: Math.max(
      textLabelAutoSize.minHeight,
      Math.ceil(
        lineCount * textLabelAutoSize.lineHeight + textLabelAutoSize.paddingY,
      ),
    ),
  };
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
  const label = overrides.data?.label ?? template.label;
  const hasExplicitSize =
    typeof overrides.style?.width === "number" &&
    typeof overrides.style?.height === "number";
  const autoSizedTextLabel =
    type === "textLabel" && !hasExplicitSize
      ? getTextLabelSizeForText(label)
      : null;

  return {
    id,
    type,
    position,
    data: {
      label: template.label,
      ...overrides.data,
    },
    style: {
      width: autoSizedTextLabel?.width ?? template.width,
      height: autoSizedTextLabel?.height ?? template.height,
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

function getHandlePoint(node, handleId, role) {
  const { width, height } = getNodeSize(node);
  const resolvedHandle = handleId ?? (role === "source" ? "right" : "left");

  switch (resolvedHandle) {
    case "left":
      return {
        x: roundNumber(node.position.x),
        y: roundNumber(node.position.y + height / 2),
      };
    case "top":
      return {
        x: roundNumber(node.position.x + width / 2),
        y: roundNumber(node.position.y),
      };
    case "bottom":
      return {
        x: roundNumber(node.position.x + width / 2),
        y: roundNumber(node.position.y + height),
      };
    case "right":
    default:
      return {
        x: roundNumber(node.position.x + width),
        y: roundNumber(node.position.y + height / 2),
      };
  }
}

function buildSceneGraph(nodes, edges, viewport) {
  const lookup = new Map(nodes.map((node) => [node.id, node]));

  const objects = nodes.map((node) => {
    const size = getNodeSize(node);
    return {
      id: node.id,
      type: node.type === "stickyNote" ? "sticky-note" : "text-label",
      content: {
        text: node.data.label,
      },
      geometry: {
        x: roundNumber(node.position.x),
        y: roundNumber(node.position.y),
        w: roundNumber(size.width),
        h: roundNumber(size.height),
      },
    };
  });

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
              ),
              targetPoint: getHandlePoint(
                targetNode,
                edge.targetHandle,
                "target",
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
    connectors,
    viewport: {
      x: roundNumber(viewport.x),
      y: roundNumber(viewport.y),
      zoom: roundNumber(viewport.zoom),
    },
    selection,
  };
}

function getNumericSuffix(id) {
  const match = /(\d+)$/.exec(id);
  return match ? Number(match[1]) : 0;
}

function getNextSequenceValueFromSceneGraph(sceneGraph) {
  const ids = [
    ...sceneGraph.objects.map((object) => object.id),
    ...sceneGraph.connectors.map((connector) => connector.id),
  ];
  const maxSuffix = ids.reduce(
    (currentMax, id) => Math.max(currentMax, getNumericSuffix(id)),
    0,
  );

  return maxSuffix + 1;
}

function buildFlowGraphFromSceneGraph(sceneGraph) {
  const selection = new Set(sceneGraph.selection ?? []);

  const nodes = sceneGraph.objects.map((object) =>
    buildNode(
      object.type === "sticky-note" ? "stickyNote" : "textLabel",
      object.id,
      {
        x: object.geometry.x,
        y: object.geometry.y,
      },
      {
        data: {
          label: object.content?.text ?? "",
        },
        style: {
          width: object.geometry.w,
          height: object.geometry.h,
        },
        selected: selection.has(object.id),
      },
    ),
  );

  const edges = sceneGraph.connectors.map((connector) => ({
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle: connector.sourceHandle ?? "right",
    targetHandle: connector.targetHandle ?? "left",
    label: connector.content?.label ?? "",
    selected: selection.has(connector.id),
    ...defaultEdgeOptions,
  }));

  return {
    nodes,
    edges,
    nextId: getNextSequenceValueFromSceneGraph(sceneGraph),
    viewport: sceneGraph.viewport ?? { x: 0, y: 0, zoom: 1 },
  };
}

function buildParsedIntent(prompt, canvasState, subgoalCount) {
  const selectionCount = canvasState.selection.length;
  const scope = selectionCount
    ? `${selectionCount} selected item(s)`
    : "the current canvas";

  return `Apply "${prompt}" to ${scope}. ${subgoalCount} subgoal(s) proposed.`;
}

function describeAction(action) {
  switch (action.op) {
    case "Create":
      return `Create ${action.object_type} ${action.id}`;
    case "Select":
      return `Select ${action.targets.join(", ")}`;
    case "Move":
      return `Move ${action.targets.join(", ")} by (${action.delta.dx}, ${action.delta.dy})`;
    case "Resize":
      return `Resize ${action.target} to ${action.geometry.w} × ${action.geometry.h}`;
    case "Connect":
      return `Connect ${action.source} to ${action.target}`;
    case "Annotate":
      return `Annotate ${action.target}`;
    case "Delete":
      return `Delete ${action.targets.join(", ")}`;
    default:
      return action.op;
  }
}

function getActionReferenceIds(action) {
  const ids = new Set();

  if (Array.isArray(action.targets)) {
    for (const id of action.targets) {
      ids.add(id);
    }
  }

  for (const key of ["id", "target", "source"]) {
    if (typeof action[key] === "string") {
      ids.add(action[key]);
    }
  }

  return [...ids];
}

const initialNodes = [
  buildNode("stickyNote", "node-1", { x: 86, y: 132 }, {
    data: {
      label: "Destination: Tokyo.\nPurpose: 5-day spring trip with 2 days of sightseeing and 1 day at DisneySea.",
    },
    style: {
      width: 216,
      height: 142,
    },
  }),
  buildNode("stickyNote", "node-2", { x: 334, y: 132 }, {
    data: {
      label: "Travel dates: April 10 to April 15.\nCherry blossom season means higher hotel demand.",
    },
    style: {
      width: 216,
      height: 138,
    },
  }),
  buildNode("stickyNote", "node-3", { x: 582, y: 132 }, {
    data: {
      label: "Budget target: keep total spend under $2,400 including flights, hotel, park ticket, and food.",
    },
    style: {
      width: 216,
      height: 144,
    },
  }),
  buildNode("stickyNote", "node-4", { x: 830, y: 132 }, {
    data: {
      label: "Compare nonstop flight from LAX vs cheaper 1-stop option.\nAirport train into central Tokyo takes about 1 hour.",
    },
    style: {
      width: 216,
      height: 146,
    },
  }),
  buildNode("stickyNote", "node-5", { x: 86, y: 292 }, {
    data: {
      label: "Stay 3 nights in Shinjuku and 2 nights near Maihama to make DisneySea day easier.",
    },
    style: {
      width: 216,
      height: 138,
    },
  }),
  buildNode("stickyNote", "node-6", { x: 334, y: 292 }, {
    data: {
      label: "Use Suica card for trains.\nNo rental car needed inside Tokyo.",
    },
    style: {
      width: 216,
      height: 126,
    },
  }),
  buildNode("stickyNote", "node-7", { x: 582, y: 292 }, {
    data: {
      label: "Day 1 arrival.\nDay 2 Asakusa + Ueno.\nDay 3 Shibuya + Harajuku.\nDay 4 DisneySea.\nDay 5 departure.",
    },
    style: {
      width: 216,
      height: 152,
    },
  }),
  buildNode("stickyNote", "node-8", { x: 830, y: 292 }, {
    data: {
      label: "Must-see: Tokyo DisneySea, teamLab Planets, Senso-ji, Shibuya Sky, and late-night ramen in Shinjuku.",
    },
    style: {
      width: 216,
      height: 148,
    },
  }),
  buildNode("stickyNote", "node-9", { x: 86, y: 452 }, {
    data: {
      label: "Book one sushi dinner, keep 2 flexible nights for izakaya hopping, and try convenience-store breakfast once.",
    },
    style: {
      width: 216,
      height: 148,
    },
  }),
  buildNode("stickyNote", "node-10", { x: 334, y: 452 }, {
    data: {
      label: "Need park ticket, Shibuya Sky reservation, and airport transfer booked at least 3 weeks ahead.",
    },
    style: {
      width: 216,
      height: 144,
    },
  }),
  buildNode("stickyNote", "node-11", { x: 582, y: 452 }, {
    data: {
      label: "Pack light jacket, portable charger, walking shoes, passport copy, and one empty tote for shopping.",
    },
    style: {
      width: 216,
      height: 144,
    },
  }),
  buildNode("stickyNote", "node-12", { x: 830, y: 452 }, {
    data: {
      label: "April is mild but can be rainy.\nBring layers for cool evenings and a compact umbrella.",
    },
    style: {
      width: 216,
      height: 138,
    },
  }),
  buildNode("stickyNote", "node-13", { x: 210, y: 612 }, {
    data: {
      label: "Traveling with one friend who wants shopping time and one who cares most about food and DisneySea.",
    },
    style: {
      width: 216,
      height: 146,
    },
  }),
  buildNode("stickyNote", "node-14", { x: 514, y: 612 }, {
    data: {
      label: "If rain hits DisneySea day, swap with museum day and keep one indoor backup list ready.",
    },
    style: {
      width: 216,
      height: 140,
    },
  }),
];

const initialEdges = [];

function Whiteboard() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [mode, setMode] = useState("select");
  const [chatPrompt, setChatPrompt] = useState("");
  const [plannerState, setPlannerState] = useState({
    status: "idle",
    message: "Describe a task to preview subgoals and atomic actions.",
  });
  const [planPreview, setPlanPreview] = useState(null);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [editedActionsJson, setEditedActionsJson] = useState("");
  const [actionHistory, setActionHistory] = useState([]);
  const [hoveredReferenceIds, setHoveredReferenceIds] = useState([]);
  const [syncState, setSyncState] = useState({
    status: "idle",
    message: "Scene graph has not been sent yet.",
  });
  const [, setHistoryVersion] = useState(0);

  const nextIdRef = useRef(15);
  const historyRef = useRef({
    past: [],
    future: [],
  });
  const interactionSnapshotRef = useRef(null);
  const aiActionHistoryIdRef = useRef(1);
  const reactFlow = useReactFlow();
  const viewport = useViewport();

  const selectedNodes = nodes.filter((node) => node.selected);
  const selectedEdges = edges.filter((edge) => edge.selected);
  const selectedNode =
    selectedNodes.length === 1 && selectedEdges.length === 0
      ? selectedNodes[0]
      : null;
  const selectedEdge =
    selectedEdges.length === 1 && selectedNodes.length === 0
      ? selectedEdges[0]
      : null;
  const canDelete = selectedNodes.length > 0 || selectedEdges.length > 0;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const isPlanning = plannerState.status === "planning";
  const isExecuting = plannerState.status === "executing";
  const sceneGraph = buildSceneGraph(nodes, edges, viewport);
  const sceneGraphJson = JSON.stringify(sceneGraph, null, 2);
  const sceneGraphSignature = JSON.stringify(sceneGraph);
  const flattenedPlanActions = planPreview
    ? planPreview.steps.flatMap((step) => step.actions)
    : [];
  const targetInspectorEntries = planPreview
    ? planPreview.steps.flatMap((step, stepIndex) => [
        ...step.referenceResolution.resolvedReferences.map((entry) => ({
          ...entry,
          kind: "resolved",
          stepId: step.id,
          stepIndex,
        })),
        ...step.referenceResolution.ambiguousReferences.map((entry) => ({
          ...entry,
          kind: "ambiguous",
          stepId: step.id,
          stepIndex,
        })),
        ...step.referenceResolution.unresolvedReferences.map((entry) => ({
          ...entry,
          kind: "unresolved",
          stepId: step.id,
          stepIndex,
        })),
      ])
    : [];
  const latestExecutedAiEntry = actionHistory.find(
    (entry) => entry.status === "executed" && !entry.undone,
  );
  const canUndoLastAiAction =
    !!latestExecutedAiEntry &&
    !isExecuting &&
    sceneGraphSignature === JSON.stringify(latestExecutedAiEntry.canvasStateAfter);

  function snapshotFromState(nextNodes = nodes, nextEdges = edges) {
    return createSnapshot(nextNodes, nextEdges, nextIdRef.current);
  }

  function pushSnapshotToHistory(snapshot) {
    const history = historyRef.current;
    const lastSnapshot = history.past[history.past.length - 1];
    if (lastSnapshot && snapshotSignature(lastSnapshot) === snapshotSignature(snapshot)) {
      return;
    }

    history.past.push(snapshot);
    if (history.past.length > historyLimit) {
      history.past.shift();
    }
    history.future = [];
    setHistoryVersion((value) => value + 1);
  }

  function replaceFlowState(snapshot) {
    setNodes(cloneSnapshotData(snapshot.nodes));
    setEdges(cloneSnapshotData(snapshot.edges));
    nextIdRef.current = snapshot.nextId;
  }

  function applyCanvasState(canvasState) {
    const flowGraph = buildFlowGraphFromSceneGraph(canvasState);
    setNodes(flowGraph.nodes);
    setEdges(flowGraph.edges);
    nextIdRef.current = flowGraph.nextId;
    reactFlow.setViewport(flowGraph.viewport, { duration: 0 });
  }

  function logAiHistory(entry) {
    const timestamp = new Intl.DateTimeFormat([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());

    setActionHistory((current) => [
      {
        id: `ai-history-${aiActionHistoryIdRef.current++}`,
        timestamp,
        undone: false,
        ...entry,
      },
      ...current,
    ].slice(0, 24));
  }

  function captureInteractionStart() {
    interactionSnapshotRef.current = snapshotFromState();
  }

  function commitInteraction(nextNodes = nodes, nextEdges = edges) {
    const initialSnapshot = interactionSnapshotRef.current;
    interactionSnapshotRef.current = null;
    if (!initialSnapshot) {
      return;
    }

    const currentSnapshot = createSnapshot(
      nextNodes,
      nextEdges,
      nextIdRef.current,
    );
    if (snapshotSignature(initialSnapshot) === snapshotSignature(currentSnapshot)) {
      return;
    }

    pushSnapshotToHistory(initialSnapshot);
  }

  function undo() {
    const history = historyRef.current;
    if (!history.past.length) {
      return;
    }

    const currentSnapshot = snapshotFromState();
    const previousSnapshot = history.past.pop();
    history.future.push(currentSnapshot);
    replaceFlowState(previousSnapshot);
    setHistoryVersion((value) => value + 1);
  }

  function redo() {
    const history = historyRef.current;
    if (!history.future.length) {
      return;
    }

    const currentSnapshot = snapshotFromState();
    const nextSnapshot = history.future.pop();
    history.past.push(currentSnapshot);
    replaceFlowState(nextSnapshot);
    setHistoryVersion((value) => value + 1);
  }

  function nextId(prefix) {
    const id = `${prefix}-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return id;
  }

  function createCanvasNode(type) {
    pushSnapshotToHistory(snapshotFromState());
    const center = reactFlow.screenToFlowPosition({
      x: window.innerWidth * 0.52,
      y: window.innerHeight * 0.5,
    });
    const template = nodeTemplates[type];
    const autoSizedTextLabel =
      type === "textLabel" ? getTextLabelSizeForText(template.label) : null;
    const nodeWidth = autoSizedTextLabel?.width ?? template.width;
    const nodeHeight = autoSizedTextLabel?.height ?? template.height;
    const offset = (nextIdRef.current % 4) * 24;
    const node = buildNode(
      type,
      nextId("node"),
      {
        x: center.x - nodeWidth / 2 + offset,
        y: center.y - nodeHeight / 2 + offset,
      },
      {
        ...(autoSizedTextLabel
          ? {
              style: {
                width: autoSizedTextLabel.width,
                height: autoSizedTextLabel.height,
              },
            }
          : {}),
        selected: true,
      },
    );

    setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
    setNodes((current) => [
      ...current.map((item) => ({ ...item, selected: false })),
      node,
    ]);
    setMode("select");
  }

  function deleteSelectedItems() {
    if (!canDelete) {
      return;
    }

    pushSnapshotToHistory(snapshotFromState());
    const selectedNodeIds = new Set(selectedNodes.map((node) => node.id));
    const selectedEdgeIds = new Set(selectedEdges.map((edge) => edge.id));

    setEdges((current) =>
      current.filter(
        (edge) =>
          !selectedEdgeIds.has(edge.id) &&
          !selectedNodeIds.has(edge.source) &&
          !selectedNodeIds.has(edge.target),
      ),
    );
    setNodes((current) =>
      current.filter((node) => !selectedNodeIds.has(node.id)),
    );
  }

  function handleAnnotationChange(value) {
    if (!selectedNode && !selectedEdge) {
      return;
    }

    if (selectedNode) {
      setNodes((current) =>
        current.map((node) =>
          node.id === selectedNode.id
            ? {
                ...node,
                data: {
                  ...node.data,
                  label: value,
                },
                ...(node.type === "textLabel"
                  ? {
                      style: {
                        ...node.style,
                        ...getTextLabelSizeForText(value),
                      },
                    }
                  : {}),
              }
            : node,
        ),
      );
      return;
    }

    setEdges((current) =>
      current.map((edge) =>
        edge.id === selectedEdge.id
          ? {
              ...edge,
              label: value,
            }
          : edge,
      ),
    );
  }

  async function postJson(url, payload, fallbackMessage) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message ?? fallbackMessage);
    }
    return data;
  }

  async function persistCanvasState(
    canvasState = sceneGraph,
    sendingMessage = "Sending canvas state to backend...",
  ) {
    setSyncState({
      status: "sending",
      message: sendingMessage,
    });

    const payload = await postJson(
      "/api/canvas-state",
      canvasState,
      "Backend rejected canvas state.",
    );

    setSyncState({
      status: "success",
      message: `Saved ${payload.counts.objects} object(s) and ${payload.counts.connectors} connector(s).`,
    });

    return payload;
  }

  async function handleSendSceneGraph() {
    try {
      await persistCanvasState(sceneGraph);
    } catch (error) {
      setSyncState({
        status: "error",
        message: error.message,
      });
    }
  }

  function downloadSceneGraph() {
    const blob = new Blob([sceneGraphJson], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "canvas-state.json";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function clearPlan() {
    setPlanPreview(null);
    setIsEditingPlan(false);
    setEditedActionsJson("");
    setHoveredReferenceIds([]);
    setPlannerState({
      status: "idle",
      message: "Plan cleared. Enter a new command to inspect the next AI run.",
    });
  }

  function togglePlanEditing() {
    if (!planPreview) {
      return;
    }

    if (isEditingPlan) {
      setIsEditingPlan(false);
      return;
    }

    setEditedActionsJson(JSON.stringify(flattenedPlanActions, null, 2));
    setIsEditingPlan(true);
  }

  function getPlannedActionsForExecution() {
    if (!planPreview) {
      return [];
    }

    if (!isEditingPlan) {
      return flattenedPlanActions;
    }

    let parsed;
    try {
      parsed = JSON.parse(editedActionsJson);
    } catch (error) {
      throw new Error(`Edited actions must be valid JSON: ${error.message}`);
    }

    if (!Array.isArray(parsed)) {
      throw new Error("Edited actions must be a JSON array.");
    }

    return parsed;
  }

  async function executePlan() {
    if (!planPreview) {
      return;
    }

    let actions;
    try {
      actions = getPlannedActionsForExecution();
    } catch (error) {
      setPlannerState({
        status: "error",
        message: error.message,
      });
      return;
    }

    if (!actions.length) {
      setPlannerState({
        status: "error",
        message: "Nothing to execute. The action list is empty.",
      });
      return;
    }

    const beforeCanvasState = cloneSnapshotData(sceneGraph);
    pushSnapshotToHistory(snapshotFromState());
    setPlannerState({
      status: "executing",
      message: `Executing ${actions.length} atomic action(s)...`,
    });

    try {
      const payload = await postJson(
        "/api/canvas-actions",
        {
          actions,
          canvasState: beforeCanvasState,
        },
        "Failed to execute atomic actions.",
      );

      applyCanvasState(payload.canvasState);
      logAiHistory({
        status: "executed",
        prompt: planPreview.prompt,
        parsedIntent: planPreview.parsedIntent,
        subgoalCount: planPreview.steps.length,
        actionCount: actions.length,
        actions: cloneSnapshotData(actions),
        canvasStateBefore: beforeCanvasState,
        canvasStateAfter: cloneSnapshotData(payload.canvasState),
      });
      setPlanPreview(null);
      setIsEditingPlan(false);
      setEditedActionsJson("");
      setHoveredReferenceIds([]);
      setChatPrompt("");
      setPlannerState({
        status: "success",
        message: `Executed ${actions.length} action(s). Review the action history to undo the AI batch if needed.`,
      });

      try {
        await persistCanvasState(
          payload.canvasState,
          "Persisting executed AI result...",
        );
      } catch (error) {
        setSyncState({
          status: "error",
          message: error.message,
        });
      }
    } catch (error) {
      logAiHistory({
        status: "failed",
        prompt: planPreview.prompt,
        parsedIntent: planPreview.parsedIntent,
        subgoalCount: planPreview.steps.length,
        actionCount: actions.length,
        actions: cloneSnapshotData(actions),
        error: error.message,
      });
      setPlannerState({
        status: "error",
        message: error.message,
      });
    }
  }

  async function undoLastAiAction() {
    if (!latestExecutedAiEntry || !canUndoLastAiAction) {
      return;
    }

    pushSnapshotToHistory(snapshotFromState());
    setPlannerState({
      status: "executing",
      message: `Undoing AI batch from ${latestExecutedAiEntry.timestamp}...`,
    });

    try {
      applyCanvasState(latestExecutedAiEntry.canvasStateBefore);
      setActionHistory((current) =>
        current.map((entry) =>
          entry.id === latestExecutedAiEntry.id
            ? {
                ...entry,
                undone: true,
              }
            : entry,
        ),
      );
      setPlannerState({
        status: "success",
        message: "Undid the last executed AI batch.",
      });

      try {
        await persistCanvasState(
          latestExecutedAiEntry.canvasStateBefore,
          "Persisting AI undo...",
        );
      } catch (error) {
        setSyncState({
          status: "error",
          message: error.message,
        });
      }
    } catch (error) {
      setPlannerState({
        status: "error",
        message: error.message,
      });
    }
  }

  async function handlePromptSubmit(event) {
    event.preventDefault();
    const prompt = chatPrompt.trim();
    if (!prompt) {
      return;
    }

    setPlannerState({
      status: "planning",
      message: "Decomposing prompt into subgoals...",
    });
    setPlanPreview(null);
    setIsEditingPlan(false);
    setEditedActionsJson("");
    setHoveredReferenceIds([]);

    try {
      let workingCanvasState = cloneSnapshotData(sceneGraph);
      const subgoalPayload = await postJson(
        "/api/llm/subgoals",
        {
          prompt,
          canvasState: workingCanvasState,
        },
        "Failed to generate subgoals.",
      );

      const steps = [];
      for (const [index, subgoalEntry] of subgoalPayload.subgoals.entries()) {
        setPlannerState({
          status: "planning",
          message: `Planning actions for subgoal ${index + 1} of ${subgoalPayload.subgoals.length}...`,
        });

        const actionPayload = await postJson(
          "/api/llm/actions",
          {
            subgoal: subgoalEntry.subgoal,
            canvasState: workingCanvasState,
          },
          "Failed to generate atomic actions.",
        );

        const simulationPayload = await postJson(
          "/api/canvas-actions",
          {
            actions: actionPayload.actions,
            dry_run: true,
            canvasState: workingCanvasState,
          },
          "Failed to simulate planned actions.",
        );

        steps.push({
          id: `plan-step-${index + 1}`,
          subgoal: subgoalEntry.subgoal,
          actions: actionPayload.actions,
          referenceResolution:
            actionPayload.referenceResolution ?? emptyReferenceResolution,
          failureLog: actionPayload.failureLog ?? [],
        });
        workingCanvasState = simulationPayload.canvasState;
      }

      const totalActions = steps.reduce(
        (count, step) => count + step.actions.length,
        0,
      );

      setPlanPreview({
        prompt,
        parsedIntent: buildParsedIntent(
          prompt,
          sceneGraph,
          subgoalPayload.subgoals.length,
        ),
        steps,
        finalCanvasState: workingCanvasState,
        totalActions,
      });
      setPlannerState({
        status: "success",
        message: `Planned ${steps.length} subgoal(s) and ${totalActions} action(s). Review the preview before execution.`,
      });
    } catch (error) {
      logAiHistory({
        status: "failed",
        prompt,
        parsedIntent: prompt,
        subgoalCount: 0,
        actionCount: 0,
        actions: [],
        error: error.message,
      });
      setPlannerState({
        status: "error",
        message: error.message,
      });
    }
  }

  function handleConnect(connection) {
    if (mode !== "connect" || !connection.source || !connection.target) {
      return;
    }

    pushSnapshotToHistory(snapshotFromState());
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: nextId("edge"),
          label: "",
          sourceHandle: connection.sourceHandle ?? "right",
          targetHandle: connection.targetHandle ?? "left",
          selected: true,
          ...defaultEdgeOptions,
        },
        current.map((edge) => ({ ...edge, selected: false })),
      ),
    );
    setNodes((current) => current.map((node) => ({ ...node, selected: false })));
    setMode("select");
  }

  useEffect(() => {
    if (!planPreview && hoveredReferenceIds.length > 0) {
      setHoveredReferenceIds([]);
    }
  }, [planPreview, hoveredReferenceIds.length]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (isTextEditingTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;

      if (hasModifier && key === "z" && !event.altKey) {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (hasModifier && key === "y" && !event.altKey) {
        event.preventDefault();
        redo();
        return;
      }

      if ((event.key === "Backspace" || event.key === "Delete") && canDelete) {
        event.preventDefault();
        deleteSelectedItems();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canDelete]);

  const decoratedNodes = nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      isAiHighlighted: hoveredReferenceIds.includes(node.id),
      onResizeStart: captureInteractionStart,
      onResizeEnd: () => {
        requestAnimationFrame(() => {
          commitInteraction();
        });
      },
    },
  }));

  const decoratedEdges = edges.map((edge) => ({
    ...edge,
    className: hoveredReferenceIds.includes(edge.id) ? "ai-highlighted-edge" : "",
  }));

  return (
    <div className="whiteboard-shell" data-mode={mode}>
      <ReactFlow
        nodes={decoratedNodes}
        edges={decoratedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeDragStart={captureInteractionStart}
        onNodeDragStop={() => commitInteraction()}
        onSelectionDragStart={captureInteractionStart}
        onSelectionDragStop={() => commitInteraction()}
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
        panOnDrag={false}
        panActivationKeyCode="Space"
        selectionOnDrag={mode === "select"}
        selectionMode={SelectionMode.Partial}
        isValidConnection={(connection) => connection.source !== connection.target}
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
            The scene graph is explicit: stable ids, content, geometry, viewport,
            selection, objects, and connectors.
          </p>

          <section className="panel-section">
            <div className="section-label">Create</div>
            <div className="button-row">
              <button type="button" onClick={() => createCanvasNode("stickyNote")}>
                Sticky note
              </button>
              <button type="button" onClick={() => createCanvasNode("textLabel")}>
                Text label
              </button>
            </div>
          </section>

          <section className="panel-section">
            <div className="section-label">Atomic Actions</div>
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
              <button type="button" disabled={!canDelete} onClick={deleteSelectedItems}>
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
              Drag notes to move them. Drag on empty canvas to box-select. Hold
              <code> Space </code>
              and drag to pan. Undo and redo use
              <code> Cmd/Ctrl+Z </code>
              and
              <code> Shift+Cmd/Ctrl+Z</code>.
            </p>
          </section>

          <section className="panel-section">
            <div className="section-label">Scene Graph</div>
            <div className="button-row">
              <button type="button" onClick={downloadSceneGraph}>
                Export JSON
              </button>
              <button
                type="button"
                className={syncState.status === "sending" ? "is-active" : ""}
                onClick={handleSendSceneGraph}
              >
                Send To Backend
              </button>
            </div>
            <div className={`sync-status sync-status-${syncState.status}`}>
              {syncState.message}
            </div>
          </section>
        </Panel>

        <Panel position="top-right" className="flow-panel inspector-panel">
          <div className="section-label">Annotate</div>

          {selectedNode ? (
            <>
              <div className="selection-title">
                {selectedNode.type === "stickyNote" ? "Sticky note" : "Text label"}
              </div>
              <textarea
                value={selectedNode.data.label}
                rows={selectedNode.type === "textLabel" ? 3 : 6}
                onFocus={captureInteractionStart}
                onBlur={() => commitInteraction()}
                onChange={(event) => handleAnnotationChange(event.target.value)}
              />
            </>
          ) : null}

          {selectedEdge ? (
            <>
              <div className="selection-title">Connector</div>
              <textarea
                value={selectedEdge.label ?? ""}
                rows={3}
                onFocus={captureInteractionStart}
                onBlur={() => commitInteraction()}
                onChange={(event) => handleAnnotationChange(event.target.value)}
              />
            </>
          ) : null}

          {!selectedNode && !selectedEdge ? (
            <p className="panel-copy muted">
              Select one object or connector to edit its annotation.
            </p>
          ) : null}

          <div className="selection-stats">
            <span>{sceneGraph.objects.length} object(s)</span>
            <span>{sceneGraph.connectors.length} connector(s)</span>
          </div>

          <section className="panel-section">
            <div className="section-label">Selection / Targets</div>
            <p className="panel-copy compact">
              Hover a resolved reference to see which objects the AI is grounding.
            </p>

            <div
              className="reference-item current-selection"
              onMouseEnter={() => setHoveredReferenceIds(sceneGraph.selection)}
              onMouseLeave={() => setHoveredReferenceIds([])}
            >
              <div className="reference-item-header">
                <span className="mode-pill">Selection</span>
                <span className="plan-step-meta">
                  {sceneGraph.selection.length} id(s)
                </span>
              </div>
              <div className="reference-item-copy">
                {sceneGraph.selection.length
                  ? sceneGraph.selection.join(", ")
                  : "Nothing selected"}
              </div>
            </div>

            <div className="reference-list">
              {targetInspectorEntries.length ? (
                targetInspectorEntries.map((entry) => (
                  <article
                    key={`${entry.stepId}-${entry.kind}-${entry.surfaceText}-${entry.rule}`}
                    className={`reference-item reference-item-${entry.kind}`}
                    onMouseEnter={() =>
                      setHoveredReferenceIds(entry.candidateIds ?? [])
                    }
                    onMouseLeave={() => setHoveredReferenceIds([])}
                  >
                    <div className="reference-item-header">
                      <span className="mode-pill">Step {entry.stepIndex + 1}</span>
                      <span className="plan-step-meta">{entry.kind}</span>
                    </div>
                    <div className="reference-item-copy">
                      <code>{entry.surfaceText}</code>
                      {" -> "}
                      {entry.candidateIds?.length ? (
                        <code>{entry.candidateIds.join(", ")}</code>
                      ) : (
                        <span>No resolved ids</span>
                      )}
                    </div>
                    <div className="reference-item-rule">{entry.rule}</div>
                  </article>
                ))
              ) : (
                <p className="panel-copy muted">
                  Plan a command to inspect grounded references like
                  <code> these notes </code>
                  or
                  <code> leftmost note </code>
                  before execution.
                </p>
              )}
            </div>
          </section>
        </Panel>

        <Panel position="bottom-left" className="flow-panel history-panel">
          <div className="section-label">Action History</div>
          <div className="button-row">
            <button
              type="button"
              disabled={!canUndoLastAiAction}
              onClick={undoLastAiAction}
            >
              Undo Last AI Action
            </button>
          </div>
          <p className="panel-copy compact">
            AI execution stays inspectable here. Manual whiteboard undo/redo is
            still available in the toolbar.
          </p>

          <div className="history-list">
            {actionHistory.length ? (
              actionHistory.map((entry) => (
                <article
                  key={entry.id}
                  className={`history-entry history-entry-${entry.status}`}
                >
                  <div className="history-entry-header">
                    <span className="mode-pill">
                      {entry.status === "executed" ? "Executed" : "Failed"}
                    </span>
                    <span className="plan-step-meta">{entry.timestamp}</span>
                  </div>
                  <div className="history-entry-copy">{entry.prompt}</div>
                  <div className="history-entry-meta">
                    <span>{entry.subgoalCount} subgoal(s)</span>
                    <span>{entry.actionCount} action(s)</span>
                    {entry.undone ? <span>undone</span> : null}
                  </div>

                  {entry.actions.length ? (
                    <div className="history-entry-actions">
                      {entry.actions.map((action, index) => (
                        <div
                          key={`${entry.id}-${index}-${action.op}`}
                          className="history-entry-action"
                        >
                          <span className="mode-pill">{action.op}</span>
                          <span>{describeAction(action)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {entry.error ? (
                    <div className="history-entry-error">{entry.error}</div>
                  ) : null}
                </article>
              ))
            ) : (
              <p className="panel-copy muted">
                Planned AI runs will appear here after execution or failure.
              </p>
            )}
          </div>
        </Panel>

        <Panel position="bottom-center" className="flow-panel prompt-panel">
          <div className="section-label">Command Box</div>
          <form className="prompt-form" onSubmit={handlePromptSubmit}>
            <input
              type="text"
              value={chatPrompt}
              onChange={(event) => setChatPrompt(event.target.value)}
              placeholder='Try "organize selected notes by topic"'
              aria-label="Chat prompt"
            />
            <button type="submit" disabled={isPlanning || isExecuting || !chatPrompt.trim()}>
              {isPlanning ? "Planning..." : "Plan"}
            </button>
          </form>
          <div
            className={`sync-status sync-status-${
              isPlanning || isExecuting ? "sending" : plannerState.status
            }`}
          >
            {plannerState.message}
          </div>
          <p className="panel-copy compact">
            Type a command, inspect the parsed plan, then execute, edit, or cancel
            it explicitly.
          </p>
        </Panel>

        <Panel position="bottom-right" className="flow-panel plan-panel">
          <div className="plan-preview-header">
            <div className="section-label">Plan Panel</div>
            {planPreview ? (
              <div className="scene-meta">
                <span>{planPreview.steps.length} subgoal(s)</span>
                <span>{planPreview.totalActions} action(s)</span>
              </div>
            ) : null}
          </div>

          {planPreview ? (
            <>
              <section className="panel-section">
                <div className="section-label">Parsed Intent</div>
                <p className="panel-copy compact">{planPreview.parsedIntent}</p>
              </section>

              <section className="panel-section">
                <div className="section-label">Subgoals</div>
                <div className="plan-step-list">
                  {planPreview.steps.map((step, stepIndex) => (
                    <article key={step.id} className="plan-step">
                      <div className="plan-step-header">
                        <span className="mode-pill">Subgoal {stepIndex + 1}</span>
                        <span className="plan-step-meta">
                          {step.actions.length} action(s)
                        </span>
                      </div>
                      <div className="plan-step-copy">{step.subgoal}</div>

                      {step.referenceResolution.ambiguousReferences.length > 0 ? (
                        <div className="plan-step-warning">
                          Ambiguous references:{" "}
                          {step.referenceResolution.ambiguousReferences
                            .map((entry) => entry.surfaceText)
                            .join(", ")}
                        </div>
                      ) : null}

                      <div className="action-list">
                        {step.actions.map((action, actionIndex) => (
                          <article
                            key={`${step.id}-${actionIndex}-${action.op}`}
                            className="action-item"
                            onMouseEnter={() =>
                              setHoveredReferenceIds(getActionReferenceIds(action))
                            }
                            onMouseLeave={() => setHoveredReferenceIds([])}
                          >
                            <div className="action-item-header">
                              <span className="mode-pill">{action.op}</span>
                              <span className="plan-step-meta">
                                Action {actionIndex + 1}
                              </span>
                            </div>
                            <div className="action-item-copy">
                              {describeAction(action)}
                            </div>
                            <code className="action-item-json">
                              {JSON.stringify(action)}
                            </code>
                          </article>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel-section">
                <div className="button-row">
                  <button type="button" disabled={isPlanning || isExecuting} onClick={executePlan}>
                    Execute
                  </button>
                  <button type="button" disabled={isPlanning || isExecuting} onClick={togglePlanEditing}>
                    {isEditingPlan ? "Stop Editing" : "Edit JSON"}
                  </button>
                  <button type="button" disabled={isPlanning || isExecuting} onClick={clearPlan}>
                    Cancel
                  </button>
                </div>
              </section>

              {isEditingPlan ? (
                <section className="panel-section">
                  <div className="section-label">Editable Actions</div>
                  <textarea
                    className="plan-editor"
                    value={editedActionsJson}
                    rows={14}
                    spellCheck={false}
                    onChange={(event) => setEditedActionsJson(event.target.value)}
                  />
                </section>
              ) : null}
            </>
          ) : (
            <>
              <p className="panel-copy compact">
                The AI plan becomes visible here before anything is executed.
              </p>
              <div className="scene-meta">
                <span>Selection: {sceneGraph.selection.length}</span>
                <span>
                  Viewport: {sceneGraph.viewport.x}, {sceneGraph.viewport.y},{" "}
                  {sceneGraph.viewport.zoom}x
                </span>
              </div>
              <pre className="scene-preview">{sceneGraphJson}</pre>
            </>
          )}
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
