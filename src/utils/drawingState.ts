import type { ComponentProps } from 'react';
import type { Excalidraw, restoreElements } from '@excalidraw/excalidraw';
import type { TLEditorSnapshot } from 'tldraw';

// Derive public types from root exports for the project's Node module resolution.
export type DrawingElement = NonNullable<Parameters<typeof restoreElements>[0]>[number];
export type DrawingChangeHandler = NonNullable<ComponentProps<typeof Excalidraw>['onChange']>;
export type DrawingAppState = Parameters<DrawingChangeHandler>[1];
export type DrawingFiles = Parameters<DrawingChangeHandler>[2];
export type DrawingAPI = Parameters<NonNullable<ComponentProps<typeof Excalidraw>['excalidrawAPI']>>[0];
export type ExcalidrawSnapshot = {
  format: 'excalidraw';
  elements: readonly DrawingElement[];
  appState: Pick<DrawingAppState, 'scrollX' | 'scrollY' | 'zoom' | 'viewBackgroundColor'>;
  files: DrawingFiles;
};
export type DrawingSnapshot = TLEditorSnapshot | ExcalidrawSnapshot;
export type DrawingState = {
  state: DrawingSnapshot | null;
  tool: string;
  color: string;
  penSize: string;
};
export const DRAWING_COLORS: Record<string, string> = {
  red: '#ff6b6b',
  green: '#51cf66',
  blue: '#339af0',
  orange: '#ff922b',
  grey: '#adb5bd',
  black: '#3b3b3b',
  violet: '#845ef7',
};
// tldraw uses pixel sizes (STROKE_SIZES[size] + 1), while Excalidraw's
// getFreeDrawSvgPath multiplies strokeWidth by 4.25 before rendering the ink.
export const DRAWING_WIDTHS: Record<string, number> = {
  s: 3 / 4.25, m: 4.5 / 4.25, l: 6 / 4.25, xl: 11 / 4.25,
};
