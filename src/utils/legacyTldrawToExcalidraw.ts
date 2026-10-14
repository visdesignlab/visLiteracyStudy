import { b64Vecs } from '@tldraw/tlschema';
import type { TLEditorSnapshot } from 'tldraw';
import {
  DRAWING_COLORS, DRAWING_WIDTHS, DrawingElement, DrawingSnapshot, ExcalidrawSnapshot,
} from './drawingState';

type LegacyPoint = { x: number; y: number; z?: number };
type LegacyShape = {
  id: string;
  typeName: 'shape';
  type: string;
  x: number;
  y: number;
  rotation?: number;
  index: string;
  parentId: string;
  opacity?: number;
  props: {
    color: string;
    size: string;
    scale?: number;
    scaleX?: number;
    scaleY?: number;
    isPen?: boolean;
    segments: Array<{ type: string; path?: string; points?: LegacyPoint[] }>;
  };
};

/** Read old point arrays and newer encoded paths without mounting tldraw. */
function getShapePoints(shape: LegacyShape): LegacyPoint[] {
  return shape.props.segments.flatMap((segment) => {
    const points = segment.points ?? (segment.path ? b64Vecs.decodePoints(segment.path) : []);
    const scaled = points.map((point) => ({
      x: point.x * (shape.props.scaleX ?? 1),
      y: point.y * (shape.props.scaleY ?? 1),
      z: point.z ?? 0.5,
    }));
    if (segment.type !== 'straight' || scaled.length < 2) return scaled;
    const [start, end] = scaled;
    const count = Math.max(4, Math.floor(Math.hypot(end.x - start.x, end.y - start.y) / 16));
    return Array.from({ length: count + 1 }, (_, i) => ({
      x: start.x + ((end.x - start.x) * i) / count,
      y: start.y + ((end.y - start.y) * i) / count,
      z: start.z + ((end.z - start.z) * i) / count,
    }));
  });
}

/** Convert at display time, retaining the archived graph and stable shape IDs. */
export function legacyTldrawSnapshotToExcalidraw(snapshot: TLEditorSnapshot | null): DrawingElement[] {
  if (!snapshot) return [];
  const records: unknown[] = Object.values(snapshot.document.store);
  const pageId = snapshot.session.currentPageId;
  const shapes = records.filter((record): record is LegacyShape => (
    typeof record === 'object' && record !== null
    && (record as LegacyShape).typeName === 'shape'
    && (!pageId || (record as LegacyShape).parentId === pageId)
  )).sort((a, b) => (a.index < b.index ? -1 : Number(a.index > b.index)));

  return shapes.flatMap((shape): DrawingElement[] => {
    if (shape.type !== 'draw') throw new Error(`Unsupported legacy drawing shape: ${shape.type}`);
    const rawPoints = getShapePoints(shape);
    if (rawPoints.length === 0) return [];
    const angle = shape.rotation ?? 0;
    const rotated = rawPoints.map((p) => ({
      x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
      y: p.x * Math.sin(angle) + p.y * Math.cos(angle),
      z: p.z ?? 0.5,
    }));
    const origin = rotated[0];
    const points = rotated.map((p) => [p.x - origin.x, p.y - origin.y] as [number, number]);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return [{
      id: shape.id,
      type: 'freedraw',
      x: shape.x + origin.x,
      y: shape.y + origin.y,
      points: points as Extract<DrawingElement, { type: 'freedraw' }>['points'],
      pressures: rotated.map((p) => p.z),
      simulatePressure: !shape.props.isPen,
      lastCommittedPoint: null,
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      strokeColor: DRAWING_COLORS[shape.props.color] ?? shape.props.color,
      strokeWidth: (DRAWING_WIDTHS[shape.props.size] ?? DRAWING_WIDTHS.m) * (shape.props.scale ?? 1),
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeStyle: 'solid',
      roughness: 0,
      opacity: Math.round((shape.opacity ?? 1) * 100),
      angle: 0 as DrawingElement['angle'],
      seed: 1,
      version: 1,
      versionNonce: 0,
      roundness: null,
      index: null,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: 0,
      link: null,
      locked: false,
      customData: { legacyTldrawShapeId: shape.id },
    } as DrawingElement];
  });
}

export function toExcalidrawSnapshot(snapshot: DrawingSnapshot | null): ExcalidrawSnapshot {
  if (snapshot && 'format' in snapshot) return snapshot;
  const camera = snapshot?.session.pageStates?.find((page) => page.pageId === snapshot.session.currentPageId)?.camera;
  return {
    format: 'excalidraw',
    elements: legacyTldrawSnapshotToExcalidraw(snapshot),
    appState: {
      scrollX: camera?.x ?? 0,
      scrollY: camera?.y ?? 0,
      zoom: { value: (camera?.z ?? 1) as ExcalidrawSnapshot['appState']['zoom']['value'] },
      viewBackgroundColor: '#ffffff',
    },
    files: {},
  };
}
