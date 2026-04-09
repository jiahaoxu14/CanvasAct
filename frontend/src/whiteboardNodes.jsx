import { memo } from "react";
import { Handle, NodeResizer, Position } from "@xyflow/react";

function NodeHandles() {
  return (
    <>
      <Handle id="left" type="target" position={Position.Left} />
      <Handle id="top" type="target" position={Position.Top} />
      <Handle id="right" type="source" position={Position.Right} />
      <Handle id="bottom" type="source" position={Position.Bottom} />
    </>
  );
}

export const StickyNoteNode = memo(function StickyNoteNode({
  id,
  data,
  selected,
}) {
  return (
    <div className="whiteboard-node whiteboard-node-sticky">
      <NodeResizer
        isVisible={selected}
        minWidth={170}
        minHeight={130}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
        onResizeStart={() => data.onResizeStart?.(id)}
        onResizeEnd={() => data.onResizeEnd?.(id)}
      />
      <NodeHandles />
      <div className="node-meta">Sticky note</div>
      <div className="node-copy">{data.label}</div>
    </div>
  );
});

export const TextLabelNode = memo(function TextLabelNode({
  id,
  data,
  selected,
}) {
  return (
    <div className="whiteboard-node whiteboard-node-text">
      <NodeResizer
        isVisible={selected}
        minWidth={170}
        minHeight={58}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
        onResizeStart={() => data.onResizeStart?.(id)}
        onResizeEnd={() => data.onResizeEnd?.(id)}
      />
      <NodeHandles />
      <div className="text-label-copy">{data.label}</div>
    </div>
  );
});

export const FrameNode = memo(function FrameNode({ id, data, selected }) {
  return (
    <div
      className={`whiteboard-node whiteboard-node-frame${
        data.isDropTarget ? " is-drop-target" : ""
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={180}
        lineClassName="node-resizer-line"
        handleClassName="node-resizer-handle"
        onResizeStart={() => data.onResizeStart?.(id)}
        onResizeEnd={() => data.onResizeEnd?.(id)}
      />
      <NodeHandles />
      <div className="frame-node-header">
        <span className="frame-node-chip">Frame</span>
        <span className="frame-node-title">{data.label}</span>
      </div>
      <div className="frame-node-dropzone">Grouped objects stay inside this box.</div>
    </div>
  );
});
