import {
  Excalidraw, CaptureUpdateAction, MainMenu,
} from '@excalidraw/excalidraw';
// The stylesheet uses package exports, which ESLint's legacy resolver cannot resolve.
// eslint-disable-next-line import/no-unresolved, import/extensions
import '@excalidraw/excalidraw/index.css';
import './ExcalidrawEditor.css';
import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  DrawingAPI, DrawingChangeHandler, DrawingSnapshot, ExcalidrawSnapshot,
  DRAWING_COLORS, DRAWING_WIDTHS,
} from '../../../utils/drawingState';
import { toExcalidrawSnapshot } from '../../../utils/legacyTldrawToExcalidraw';

export default function ExcalidrawEditor({
  snapshot, color, drawingTool, size, onDraw, readOnly, persistenceKey,
}: {
  snapshot: DrawingSnapshot | null | undefined;
  color: string;
  drawingTool: string;
  size: string;
  onDraw: (scene: ExcalidrawSnapshot) => void;
  readOnly: boolean;
  persistenceKey: string;
}) {
  const [api, setApi] = useState<DrawingAPI | null>(null);
  const [ready, setReady] = useState(false);
  const lastElements = useRef('');
  const restoring = useRef(false);
  const initialData = useMemo(() => {
    if (readOnly || snapshot !== null) return toExcalidrawSnapshot(snapshot ?? null);
    try {
      const saved = localStorage.getItem(persistenceKey);
      if (saved) return toExcalidrawSnapshot(JSON.parse(saved));
    } catch { /* Browser persistence is optional. */ }
    return toExcalidrawSnapshot(null);
  // initialData is only read on mount. Subsequent snapshots use updateScene.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!api || !ready || (!readOnly && snapshot === null)) return undefined;
    const scene = toExcalidrawSnapshot(snapshot ?? null);
    restoring.current = true;
    lastElements.current = JSON.stringify(scene.elements);
    api.addFiles(Object.values(scene.files));
    api.updateScene({
      elements: scene.elements,
      appState: { ...scene.appState, selectedElementIds: {} },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    if (!readOnly) {
      try { localStorage.setItem(persistenceKey, JSON.stringify(scene)); } catch { /* Browser persistence is optional. */ }
    }
    // onChange is delivered after React commits the scene update.
    const frame = requestAnimationFrame(() => {
      lastElements.current = JSON.stringify(api.getSceneElementsIncludingDeleted());
      restoring.current = false;
    });
    return () => { cancelAnimationFrame(frame); restoring.current = false; };
  }, [api, ready, readOnly, snapshot, persistenceKey]);

  useEffect(() => {
    if (!api || !ready) return;
    api.setActiveTool({ type: drawingTool === 'eraser' ? 'eraser' : 'freedraw' });
    api.updateScene({
      appState: {
        currentItemStrokeColor: DRAWING_COLORS[color] ?? color,
        currentItemStrokeWidth: DRAWING_WIDTHS[size] ?? DRAWING_WIDTHS.m,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, [api, ready, color, drawingTool, size]);

  const handleChange: DrawingChangeHandler = (elements, appState, files) => {
    if (!ready) {
      lastElements.current = JSON.stringify(elements);
      setReady(true);
      return;
    }
    if (readOnly || restoring.current) return;
    const serialized = JSON.stringify(elements);
    if (serialized === lastElements.current) return;
    lastElements.current = serialized;
    const scene: ExcalidrawSnapshot = {
      format: 'excalidraw',
      elements: structuredClone(elements),
      appState: {
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: { ...appState.zoom },
        viewBackgroundColor: appState.viewBackgroundColor,
      },
      files: structuredClone(files),
    };
    try { localStorage.setItem(persistenceKey, JSON.stringify(scene)); } catch { /* Storage may be full. */ }
    onDraw(scene);
  };

  return (
    <div className="revisit-drawing-canvas" style={{ width: '100%', height: '100%' }}>
      <Excalidraw
        excalidrawAPI={setApi}
        initialData={initialData}
        onChange={handleChange}
        viewModeEnabled={readOnly}
        zenModeEnabled
        UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, export: false } }}
      >
        {/* Override the default menu so none of its actions are mounted. */}
        <MainMenu />
      </Excalidraw>
    </div>
  );
}
