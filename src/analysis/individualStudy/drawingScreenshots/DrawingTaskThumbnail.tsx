import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import {
  Box, Center, Loader, Text,
} from '@mantine/core';
import {
  Tldraw, TLEditorSnapshot, loadSnapshot, useEditor,
} from 'tldraw';
import 'tldraw/tldraw.css';
import { resizeIfNeeded } from './exportUtils';

const TLDRAW_LICENSE = 'tldraw-2026-06-25/WyI1bktYT3dGViIsWyIqIl0sMTYsIjIwMjYtMDYtMjUiXQ.UrWL3HlGLXoS7r3gjJr2PYToH/vHGO+Uk/ZsbRBcGkO9PeQ6srAgGu1G04zCHnuHZ0MZeXhNPRRP2276VyQFgg';

function TldrawExporter({
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
      if (!snapshot) {
        onExport(null);
        return;
      }

      loadSnapshot(editor.store, snapshot);
      // Allow shapes to settle before exporting
      await new Promise((resolve) => { setTimeout(resolve, 300); });

      const shapeIds = Array.from(editor.getCurrentPageShapeIds());
      if (shapeIds.length === 0) {
        onExport(null);
        return;
      }

      try {
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

export function DrawingTaskThumbnail({
  snapshot,
  taskName,
  width = 200,
  height = 150,
  onImageReady,
}: {
  snapshot: TLEditorSnapshot | null;
  taskName: string;
  width?: number;
  height?: number;
  onImageReady?: (url: string | null) => void;
}) {
  // undefined = loading, null = empty drawing, string = image URL
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined);

  const handleExport = useCallback((url: string | null) => {
    setImageUrl(url);
    onImageReady?.(url);
  }, [onImageReady]);

  return (
    <Box style={{ width, position: 'relative' }}>
      {/* Off-screen tldraw instance used only for image export */}
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
        <Tldraw key={taskName} licenseKey={TLDRAW_LICENSE} hideUi>
          <TldrawExporter snapshot={snapshot} onExport={handleExport} />
        </Tldraw>
      </Box>

      {/* Visible preview */}
      <Box
        style={{
          width,
          height,
          border: '1px solid #dee2e6',
          borderRadius: 4,
          overflow: 'hidden',
          backgroundColor: '#fff',
        }}
      >
        {imageUrl === undefined ? (
          <Center style={{ height: '100%' }}>
            <Loader size="sm" />
          </Center>
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={taskName}
            style={{
              width: '100%', height: '100%', objectFit: 'contain',
            }}
          />
        ) : (
          <Center style={{ height: '100%' }}>
            <Text size="xs" c="dimmed">Empty drawing</Text>
          </Center>
        )}
      </Box>
    </Box>
  );
}
