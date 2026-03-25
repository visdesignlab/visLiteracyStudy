import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { Box } from '@mantine/core';
import {
  Tldraw, TLEditorSnapshot, loadSnapshot, useEditor,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { resizeIfNeeded } from './exportUtils';

const TLDRAW_LICENSE = 'tldraw-2026-06-25/WyI1bktYT3dGViIsWyIqIl0sMTYsIjIwMjYtMDYtMjUiXQ.UrWL3HlGLXoS7r3gjJr2PYToH/vHGO+Uk/ZsbRBcGkO9PeQ6srAgGu1G04zCHnuHZ0MZeXhNPRRP2276VyQFgg';

export type BatchItem = {
  id: string;
  snapshot: TLEditorSnapshot | null;
};

/**
 * Inner component: given a single snapshot, exports it once and calls onExport.
 * Mounted fresh per item so the editor state is always clean.
 */
function SingleExporter({
  snapshot,
  onExport,
}: {
  snapshot: TLEditorSnapshot | null;
  onExport: (url: string | null) => void;
}) {
  const editor = useEditor();
  const exported = useRef(false);

  useEffect(() => {
    if (exported.current) return;
    exported.current = true;

    async function doExport() {
      try {
        if (!snapshot) { onExport(null); return; }

        loadSnapshot(editor.store, snapshot);
        await new Promise((r) => { setTimeout(r, 300); });

        const shapeIds = Array.from(editor.getCurrentPageShapeIds());
        if (shapeIds.length === 0) { onExport(null); return; }

        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('export timeout')), 8000);
        });
        const result = await Promise.race([
          editor.toImageDataUrl(shapeIds, { format: 'png' }),
          timeout,
        ]);
        onExport(await resizeIfNeeded(result.url));
      } catch {
        onExport(null);
      }
    }

    doExport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * Processes BatchItem[] one at a time, mounting a fresh tldraw instance per item
 * so editor state never carries over between snapshots.
 * Key this component by participant ID to remount when the participant changes.
 */
export function TimelineBatchExporter({
  items,
  onItemReady,
}: {
  items: BatchItem[];
  onItemReady: (id: string, url: string | null) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const onItemReadyRef = useRef(onItemReady);
  useEffect(() => { onItemReadyRef.current = onItemReady; });

  // Prevent in-flight exports from a previous participant bleeding into new state
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);

  const handleExport = useCallback((url: string | null) => {
    if (cancelled.current) return;
    const item = items[currentIndex];
    if (item) onItemReadyRef.current(item.id, url);
    setCurrentIndex((i) => i + 1);
  }, [currentIndex, items]);

  if (currentIndex >= items.length) return null;

  const current = items[currentIndex];

  return (
    <Box
      style={{
        position: 'fixed',
        left: '-9999px',
        top: 0,
        width: 800,
        height: 600,
        pointerEvents: 'none',
        zIndex: -1,
      }}
    >
      {/* currentIndex in key guarantees a new tldraw mount for every item, even if IDs repeat */}
      <Tldraw key={`${currentIndex}-${current.id}`} licenseKey={TLDRAW_LICENSE} hideUi>
        <SingleExporter snapshot={current.snapshot} onExport={handleExport} />
      </Tldraw>
    </Box>
  );
}
