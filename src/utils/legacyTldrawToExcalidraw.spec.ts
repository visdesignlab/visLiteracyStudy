import { describe, expect, it } from 'vitest';
import { b64Vecs } from '@tldraw/tlschema';
import type { TLEditorSnapshot } from 'tldraw';
import { legacyTldrawSnapshotToExcalidraw, toExcalidrawSnapshot } from './legacyTldrawToExcalidraw';

function snapshotWith(store: Record<string, unknown>): TLEditorSnapshot {
  return {
    document: { store },
    session: { currentPageId: 'page:page', pageStates: [{ pageId: 'page:page', camera: { x: 12, y: -5, z: 2 } }] },
  } as unknown as TLEditorSnapshot;
}

function stroke(overrides = {}) {
  return {
    id: 'shape:test',
    typeName: 'shape',
    type: 'draw',
    parentId: 'page:page',
    index: 'a1',
    x: 198,
    y: 81.2,
    rotation: 0,
    opacity: 1,
    props: {
      color: 'red',
      size: 'm',
      isPen: false,
      scale: 1,
      segments: [{ type: 'free', points: [{ x: 0, y: 0, z: 0.5 }, { x: 10, y: 20, z: 0.6 }] }],
    },
    ...overrides,
  };
}

describe('legacyTldrawSnapshotToExcalidraw', () => {
  it('preserves legacy points, IDs, palette, pressure and position without mutation', () => {
    const snapshot = snapshotWith({ test: stroke() });
    const before = JSON.stringify(snapshot);
    const elements = legacyTldrawSnapshotToExcalidraw(snapshot);
    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      id: 'shape:test',
      type: 'freedraw',
      x: 198,
      y: 81.2,
      width: 10,
      height: 20,
      points: [[0, 0], [10, 20]],
      pressures: [0.5, 0.6],
      simulatePressure: true,
      strokeColor: '#ff6b6b',
      strokeWidth: 4.5 / 4.25,
    });
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(legacyTldrawSnapshotToExcalidraw(snapshot)).toEqual(elements);
  });

  it('decodes newer encoded paths and applies scale and rotation about the shape origin', () => {
    const path = b64Vecs.encodePoints([{ x: 2, y: 3, z: 0.5 }, { x: 12, y: 13, z: 0.75 }]);
    const snapshot = snapshotWith({
      test: stroke({
        rotation: Math.PI / 2,
        props: {
          color: 'blue', size: 'l', isPen: true, scale: 2, scaleX: 2, scaleY: 3, segments: [{ type: 'free', path }],
        },
      }),
    });
    const element = legacyTldrawSnapshotToExcalidraw(snapshot)[0];
    expect(element.x).toBeCloseTo(198 - 9);
    expect(element.y).toBeCloseTo(81.2 + 4);
    expect(element.strokeWidth * 4.25).toBeCloseTo(12);
    expect(element.type).toBe('freedraw');
    if (element.type !== 'freedraw') throw new Error('Expected freehand stroke');
    expect(element.points[1][0]).toBeCloseTo(-30);
    expect(element.points[1][1]).toBeCloseTo(20);
    expect(element.pressures).toEqual([0.5, 0.75]);
    expect(element.simulatePressure).toBe(false);
  });

  it('preserves stacking order and restricts rendering to the recorded current page', () => {
    const elements = legacyTldrawSnapshotToExcalidraw(snapshotWith({
      last: stroke({ id: 'shape:last', index: 'a2' }),
      otherPage: stroke({ id: 'shape:other', parentId: 'page:other' }),
      first: stroke({ id: 'shape:first' }),
    }));
    expect(elements.map((element) => element.id)).toEqual(['shape:first', 'shape:last']);
  });

  it.each([
    ['s', 3], ['m', 4.5], ['l', 6], ['xl', 11],
  ])('matches the original ink size for %s strokes after Excalidraw rendering', (size, pixelSize) => {
    const shape = stroke();
    shape.props.size = String(size);
    const element = legacyTldrawSnapshotToExcalidraw(snapshotWith({ test: shape }))[0];
    // Excalidraw applies this factor in getFreeDrawSvgPath; passing pixel
    // widths straight through made all archived strokes over four times wider.
    expect(element.strokeWidth * 4.25).toBeCloseTo(Number(pixelSize));
  });

  it('handles dots, empty/cleared scenes and unsupported shapes explicitly', () => {
    const dot = snapshotWith({ test: stroke({ props: { color: 'black', size: 'xl', segments: [{ type: 'free', points: [{ x: 0, y: 0 }] }] } }) });
    expect(legacyTldrawSnapshotToExcalidraw(dot)).toHaveLength(1);
    expect(legacyTldrawSnapshotToExcalidraw(null)).toEqual([]);
    expect(legacyTldrawSnapshotToExcalidraw(snapshotWith({}))).toEqual([]);
    expect(() => legacyTldrawSnapshotToExcalidraw(snapshotWith({ test: stroke({ type: 'text' }) }))).toThrow('Unsupported');
  });

  it('restores the recorded camera and accepts native Excalidraw scenes', () => {
    const scene = toExcalidrawSnapshot(snapshotWith({ test: stroke() }));
    expect(scene.appState).toMatchObject({ scrollX: 12, scrollY: -5, zoom: { value: 2 } });
    expect(toExcalidrawSnapshot(scene)).toBe(scene);
    expect(toExcalidrawSnapshot(null).elements).toEqual([]);
  });
});
