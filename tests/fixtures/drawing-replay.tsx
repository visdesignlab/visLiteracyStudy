import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { TLEditorSnapshot } from 'tldraw';
import ExcalidrawEditor from '../../src/public/demo-drawing/assets/ExcalidrawEditor';

function snapshot(pointCount: number): TLEditorSnapshot {
  return {
    document: {
      store: {
        stroke: {
          id: 'shape:fixture',
          typeName: 'shape',
          type: 'draw',
          parentId: 'page:page',
          index: 'a1',
          x: 100,
          y: 100,
          opacity: 1,
          props: {
            color: 'red',
            size: 'xl',
            isPen: false,
            segments: [{ type: 'free', points: Array.from({ length: pointCount }, (_, i) => ({ x: i * 5, y: i * 2, z: 0.5 })) }],
          },
        },
      },
    },
    session: { currentPageId: 'page:page' },
  } as unknown as TLEditorSnapshot;
}

const first = snapshot(5);
const last = snapshot(60);

function Fixture() {
  const [state, setState] = useState<TLEditorSnapshot | null>(first);
  const [drawCalls, setDrawCalls] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setState(first)}>First snapshot</button>
      <button type="button" onClick={() => setState(last)}>Last snapshot</button>
      <button type="button" onClick={() => setState(null)}>Clear snapshot</button>
      <output data-testid="draw-calls">{drawCalls}</output>
      <div style={{ width: 800, height: 600 }}>
        <ExcalidrawEditor
          snapshot={state}
          color="red"
          drawingTool="pen"
          size="xl"
          persistenceKey="drawing-replay-test"
          readOnly
          onDraw={() => setDrawCalls((count) => count + 1)}
        />
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
