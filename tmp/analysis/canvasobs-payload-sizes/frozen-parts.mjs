// tmp/analysis/canvasobs-payload-sizes/frozen/shared/format/PromptCanvasObservation.ts
function buildPromptCanvasObservation(observation) {
  return {
    version: 1,
    pageId: observation.pageId,
    coordinateSpace: "prompt/action coordinates",
    objectCount: observation.objectCount,
    objects: observation.objects.map((object) => {
      const isOffscreen = object.visibility === "offscreen-near" || object.visibility === "offscreen-far";
      return {
        id: object.id,
        type: object.type,
        subtype: object.subtype,
        text: object.text,
        note: object.note,
        actionBounds: isOffscreen ? { ...object.promptBounds } : void 0,
        rotationDegrees: roundDegrees(object.rotation * 180 / Math.PI),
        zIndex: object.zIndex,
        parentId: object.parentId,
        groupId: object.groupId,
        frameId: object.frameId,
        style: { ...object.style },
        flags: { ...object.flags },
        visibility: object.visibility,
        detailLevel: object.detailLevel
      };
    }),
    relations: observation.relations.map((relation) => ({
      ...relation,
      measurements: relation.measurements ? { ...relation.measurements } : void 0
    }))
  };
}
function roundDegrees(value) {
  return Math.round(value * 100) / 100;
}

// tmp/analysis/canvasobs-payload-sizes/frozen/shared/schema/PromptPartDefinitions.ts
var BlurryShapesPartDefinition = {
  type: "blurryShapes",
  priority: -70,
  buildContent: ({ shapes }) => {
    if (shapes.length === 0) return ["There are no shapes in your view at the moment."];
    return [`These are the shapes you can currently see:`, JSON.stringify(shapes)];
  }
};
var CanvasLintsPartDefinition = {
  type: "canvasLints",
  priority: -50,
  buildContent({ lints }) {
    if (!lints || lints.length === 0) {
      return [];
    }
    const messages = [];
    const growYLints = lints.filter((l) => l.type === "growY-on-shape");
    const overlappingTextLints = lints.filter((l) => l.type === "overlapping-text");
    const friendlessArrowLints = lints.filter((l) => l.type === "friendless-arrow");
    messages.push(
      "[LINTER]: The following potential visual problems have been detected in the canvas. You should decide if you want to address them. Defer to your view of the canvas to decide if you need to make changes; it's very possible that you don't need to make any changes."
    );
    if (growYLints.length > 0) {
      const shapeIds = growYLints.flatMap((l) => l.shapeIds);
      const lines = [
        "Text overflow: These shapes have text that caused their containers to grow past the size that they were intended to be, potentially breaking out of their container. If you decide to fix: you need to set the height back to what you originally intended after increasing the width.",
        ...shapeIds.map((id) => `  - ${id}`)
      ];
      messages.push(lines.join("\n"));
    }
    if (overlappingTextLints.length > 0) {
      const lines = [
        "Overlapping text: The shapes in each group have text and overlap each other, which may make text hard to read. If you decide to fix this, you may need to increase the size of any shapes containing the text.",
        ...overlappingTextLints.map((lint) => `  - ${lint.shapeIds.join(", ")}`)
      ];
      messages.push(lines.join("\n"));
    }
    if (friendlessArrowLints.length > 0) {
      const shapeIds = friendlessArrowLints.flatMap((l) => l.shapeIds);
      const lines = [
        "Unconnected arrows: These arrows aren't fully connected to other shapes.",
        ...shapeIds.map((id) => `  - ${id}`)
      ];
      messages.push(lines.join("\n"));
    }
    return messages;
  }
};
var CanvasObservationPartDefinition = {
  type: "canvasObservation",
  priority: -72,
  buildContent: ({ observation }) => {
    const promptObservation = buildPromptCanvasObservation(observation);
    return [
      "[CANVAS OBSERVATION]: This compact semantic overlay augments the legacy canvas context with stable object ids, state, and explicit relations. Continue to use the legacy shape summaries for the objects they already describe. Offscreen objects may include actionBounds; every actionBounds value uses prompt/action coordinates\u2014the same coordinate space expected by action x/y fields\u2014and its x/y is the top-left of the object bounds. Do not treat screenshot pixels or raw page coordinates as action coordinates.",
      JSON.stringify(promptObservation)
    ];
  }
};
var CHAT_HISTORY_PRIORITY = -Infinity;
var ChatHistoryPartDefinition = {
  type: "chatHistory",
  priority: CHAT_HISTORY_PRIORITY,
  buildMessages: ({ history }) => {
    if (history.length === 0) return [];
    const messages = [];
    const lastIndex = history.length - 1;
    let end = history.length;
    if (end > 0 && history[lastIndex].type === "prompt") {
      end = lastIndex;
    }
    for (let i = 0; i < end; i++) {
      const item = history[i];
      const message = buildHistoryItemMessage(item, CHAT_HISTORY_PRIORITY);
      if (message) messages.push(message);
    }
    return messages;
  }
};
function buildHistoryItemMessage(item, priority) {
  switch (item.type) {
    case "prompt": {
      const content = [];
      if (item.agentFacingMessage.trim() !== "") {
        content.push({
          type: "text",
          text: item.agentFacingMessage
        });
      }
      if (item.contextItems.length > 0) {
        for (const contextItem of item.contextItems) {
          switch (contextItem.type) {
            case "shape": {
              const focusedShape = contextItem.shape;
              content.push({
                type: "text",
                text: `[CONTEXT]: ${JSON.stringify(focusedShape)}`
              });
              break;
            }
            case "shapes": {
              const focusedShapes = contextItem.shapes;
              content.push({
                type: "text",
                text: `[CONTEXT]: ${JSON.stringify(focusedShapes)}`
              });
              break;
            }
            default: {
              content.push({
                type: "text",
                text: `[CONTEXT]: ${JSON.stringify(contextItem)}`
              });
              break;
            }
          }
        }
      }
      if (content.length === 0) {
        return null;
      }
      const role = item.promptSource === "user" || item.promptSource === "other-agent" ? "user" : "assistant";
      return {
        role,
        content,
        priority
      };
    }
    case "continuation": {
      if (item.data.length === 0) {
        return null;
      }
      const text = `[DATA RETRIEVED]: ${JSON.stringify(item.data)}`;
      return {
        role: "assistant",
        content: [{ type: "text", text }],
        priority
      };
    }
    case "action": {
      const { action } = item;
      let text;
      switch (action._type) {
        case "message": {
          text = action.text || "<message data lost>";
          break;
        }
        case "think": {
          text = "[THOUGHT]: " + (action.text || "<thought data lost>");
          break;
        }
        default: {
          const { complete: _complete, time: _time, ...rawAction } = action || {};
          text = "[ACTION]: " + JSON.stringify(rawAction);
          break;
        }
      }
      return {
        role: "assistant",
        content: [{ type: "text", text }],
        priority
      };
    }
  }
}
var ContextItemsPartDefinition = {
  type: "contextItems",
  priority: -55,
  // context items in middle
  buildContent: ({ items, requestSource }) => {
    const messages = [];
    const shapeItems = items.filter((item) => item.type === "shape");
    const shapesItems = items.filter((item) => item.type === "shapes");
    const areaItems = items.filter((item) => item.type === "area");
    const pointItems = items.filter((item) => item.type === "point");
    if (areaItems.length > 0) {
      const isSelf = requestSource === "self";
      const areas = areaItems.map((item) => item.bounds);
      messages.push(
        isSelf ? "You have decided to focus your view on the following area. Make sure to focus your task here." : `The user has specifically brought your attention to the following areas in this request. The user might refer to them as the "area(s)" or perhaps "here" or "there", but either way, it's implied that you should focus on these areas in both your reasoning and actions. Make sure to focus your task on these areas:`
      );
      for (const area of areas) {
        messages.push(JSON.stringify(area));
      }
    }
    if (pointItems.length > 0) {
      const points = pointItems.map((item) => item.point);
      messages.push(
        `The user has specifically brought your attention to the following points in this request. The user might refer to them as the "point(s)" or perhaps "here" or "there", but either way, it's implied that you should focus on these points in both your reasoning and actions. Make sure to focus your task on these points:`
      );
      for (const point of points) {
        messages.push(JSON.stringify(point));
      }
    }
    if (shapeItems.length > 0) {
      const shapes = shapeItems.map((item) => item.shape);
      messages.push(
        `The user has specifically brought your attention to these ${shapes.length} shapes individually in this request. Make sure to focus your task on these shapes where applicable:`
      );
      for (const shape of shapes) {
        messages.push(JSON.stringify(shape));
      }
    }
    for (const contextItem of shapesItems) {
      const shapes = contextItem.shapes;
      if (shapes.length > 0) {
        messages.push(
          `The user has specifically brought your attention to the following group of ${shapes.length} shapes in this request. Make sure to focus your task on these shapes where applicable:`
        );
        messages.push(shapes.map((shape) => JSON.stringify(shape)).join("\n"));
      }
    }
    return messages;
  }
};
var DataPartDefinition = {
  type: "data",
  priority: 200,
  // API data should come right before the user message but after most other parts
  buildContent: ({ data }) => {
    if (data.length === 0) return [];
    const formattedData = data.map((item) => {
      return `${JSON.stringify(item)}`;
    });
    return ["Here's the data you requested:", ...formattedData];
  }
};
var MessagesPartDefinition = {
  type: "messages",
  priority: Infinity,
  // user message should be last (highest priority)
  buildContent: ({ agentMessages, requestSource }) => {
    switch (requestSource) {
      // we treat all sources the same for the messages part, but you don't have to!
      case "user":
      case "self":
      case "other-agent":
        return agentMessages;
    }
  }
};
var ModelNamePartDefinition = {
  type: "modelName",
  getModelName: (part) => {
    return part.modelName;
  }
};
var PeripheralShapesPartDefinition = {
  type: "peripheralShapes",
  priority: -65,
  // peripheral content after viewport shapes
  buildContent: ({ clusters }) => {
    if (clusters.length === 0) {
      return [];
    }
    return [
      "There are some groups of shapes in your peripheral vision, outside the your main view. You can't make out their details or content. If you want to see their content, you need to get closer. The groups are as follows",
      JSON.stringify(clusters)
    ];
  }
};
var ScreenshotPartDefinition = {
  type: "screenshot",
  priority: -40,
  // screenshot after text content
  buildContent: ({ screenshot }) => {
    if (screenshot === "") return [];
    return [
      "Here is the part of the canvas that you can currently see at this moment. It is not a reference image.",
      screenshot
    ];
  }
};
var SelectedShapesPartDefinition = {
  type: "selectedShapes",
  priority: -55,
  buildContent({ shapeIds }) {
    if (!shapeIds || shapeIds.length === 0) {
      return [];
    }
    if (shapeIds.length === 1) {
      return [`The user has this shape selected: ${shapeIds[0]}`];
    }
    return [`The user has these shapes selected: ${shapeIds.join(", ")}`];
  }
};
var TimePartDefinition = {
  type: "time",
  priority: -100,
  buildContent({ time }) {
    return [`The user's current time is: ${time}`];
  }
};
var TodoListPartDefinition = {
  type: "todoList",
  priority: 10,
  buildContent: ({ items }) => {
    if (items.length === 0) return ["You have no todos yet."];
    return [`Here is your current todo list:`, JSON.stringify(items)];
  }
};
var UserActionHistoryPartDefinition = {
  type: "userActionHistory",
  priority: -40,
  buildContent: (part) => {
    const { updated, removed, added } = part;
    if (updated.length === 0 && removed.length === 0 && added.length === 0) {
      return [];
    }
    return [
      "Since the previous request, the user has made the following changes to the canvas:",
      JSON.stringify(part)
    ];
  }
};
var UserViewportBoundsPartDefinition = {
  type: "userViewportBounds",
  priority: -80,
  buildContent({ userBounds }) {
    if (!userBounds) {
      return [];
    }
    const cx = userBounds.x + userBounds.w / 2;
    const cy = userBounds.y + userBounds.h / 2;
    return [`The user's view is centered at (${cx}, ${cy}).`];
  }
};
var AgentViewportBoundsPartDefinition = {
  type: "agentViewportBounds",
  priority: -80,
  buildContent({ agentBounds }) {
    if (!agentBounds) {
      return [];
    }
    return [
      `The bounds of the part of the canvas that you can currently see are: ${JSON.stringify(agentBounds)}`
    ];
  }
};
var ModePartDefinition = {
  type: "mode"
  // No buildContent - this is metadata for the worker, not prompt content for the model
};
var DebugPartDefinition = {
  type: "debug"
  // No buildContent - this is metadata for the worker, not prompt content for the model
};
export {
  AgentViewportBoundsPartDefinition,
  BlurryShapesPartDefinition,
  CanvasLintsPartDefinition,
  CanvasObservationPartDefinition,
  ChatHistoryPartDefinition,
  ContextItemsPartDefinition,
  DataPartDefinition,
  DebugPartDefinition,
  MessagesPartDefinition,
  ModePartDefinition,
  ModelNamePartDefinition,
  PeripheralShapesPartDefinition,
  ScreenshotPartDefinition,
  SelectedShapesPartDefinition,
  TimePartDefinition,
  TodoListPartDefinition,
  UserActionHistoryPartDefinition,
  UserViewportBoundsPartDefinition
};
