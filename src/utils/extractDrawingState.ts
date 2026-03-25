import { applyPatch } from 'fast-json-patch';
import { TLEditorSnapshot } from 'tldraw';
import { TrrackedProvenance } from '../store/types';

export type TLDrawState = {
  state: TLEditorSnapshot | null;
  tool: string;
  color: string;
  penSize: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findNearestNonNullCheckpoint(node: any, nodes: Record<string, any>): any | null {
  // Walk up the parent chain until we find a checkpoint with a non-null drawing state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursor: any = node;
  while (cursor) {
    if (cursor.state?.type === 'checkpoint' && cursor.state?.val?.state != null) {
      return cursor;
    }
    cursor = cursor.parent ? nodes[cursor.parent] : null;
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStateAtNode(nodeId: string, nodes: Record<string, any>): TLDrawState | null {
  const node = nodes[nodeId];
  if (!node) return null;

  if (node.state.type === 'checkpoint') {
    return node.state.val as TLDrawState;
  }

  // Find nearest ancestor checkpoint that already has a valid (non-null) drawing state
  const baseNode = findNearestNonNullCheckpoint(node, nodes);
  if (!baseNode) return null;

  // Collect patch nodes between baseNode and target
  const pathIds: string[] = [];
  let cursor = node;
  while (cursor.id !== baseNode.id) {
    pathIds.unshift(cursor.id);
    if (!cursor.parent || !nodes[cursor.parent]) break;
    cursor = nodes[cursor.parent];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allPatches: any[] = pathIds.flatMap((id) => {
    const n = nodes[id];
    return n.state.type === 'patch' ? n.state.val : [];
  });

  if (allPatches.length === 0) return baseNode.state.val as TLDrawState;

  try {
    const clonedState = JSON.parse(JSON.stringify(baseNode.state.val)) as TLDrawState;
    const clonedPatches = JSON.parse(JSON.stringify(allPatches));
    const result = applyPatch(clonedState, clonedPatches, false, false);
    return result.newDocument;
  } catch {
    return null;
  }
}

export type TimedSnapshot = {
  nodeId: string;
  timestamp: number; // epoch ms from node.createdOn
  snapshot: TLEditorSnapshot | null;
};

/** Extract N evenly-spaced snapshots from throughout the drawing session. */
export function extractTimedSnapshots(
  provenanceGraph: TrrackedProvenance,
  count: number = 4,
): TimedSnapshot[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes = provenanceGraph.nodes as Record<string, any>;

  // Candidate nodes: drawing-labelled nodes sorted chronologically
  const drawingNodes = Object.values(nodes)
    .filter((n) => ['drawing', 'draw', 'drawEnd'].includes(n.label))
    .sort((a, b) => a.createdOn - b.createdOn);

  // Fall back to all nodes if no drawing-labelled ones found
  const candidates = drawingNodes.length > 0
    ? drawingNodes
    : Object.values(nodes).sort((a, b) => a.createdOn - b.createdOn);

  if (candidates.length === 0) return [];

  // Sample evenly across [0, length-1]
  const indices = new Set<number>();
  const n = Math.min(count, candidates.length);
  for (let i = 0; i < n; i += 1) {
    indices.add(n === 1 ? 0 : Math.round((i / (n - 1)) * (candidates.length - 1)));
  }

  const results: TimedSnapshot[] = [];
  Array.from(indices).sort((a, b) => a - b).forEach((idx) => {
    const node = candidates[idx];
    const state = getStateAtNode(node.id, nodes);
    if (state?.state != null) {
      results.push({
        nodeId: node.id as string,
        timestamp: node.createdOn as number,
        snapshot: state.state,
      });
    }
  });

  // If we got nothing (no reconstructable intermediate states), return just the final snapshot
  if (results.length === 0) {
    const finalNode = nodes[provenanceGraph.current as string];
    const finalState = finalNode ? getStateAtNode(provenanceGraph.current as string, nodes) : null;
    if (finalState?.state) {
      results.push({
        nodeId: provenanceGraph.current as string,
        timestamp: finalNode?.createdOn ?? 0,
        snapshot: finalState.state,
      });
    }
  }

  return results;
}

export function isDrawingTask(provenanceGraph: TrrackedProvenance | undefined): boolean {
  if (!provenanceGraph) return false;
  return Object.values(provenanceGraph.nodes).some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (node: any) => ['drawing', 'drawEnd', 'draw', 'clearing'].includes(node.label),
  );
}

export function extractFinalDrawingSnapshot(provenanceGraph: TrrackedProvenance): TLEditorSnapshot | null {
  const { nodes, current } = provenanceGraph;
  if (!current || !nodes[current]) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = getStateAtNode(current, nodes as Record<string, any>);
  return state?.state ?? null;
}
