import { DEFAULT_THEME } from '@mantine/core';
import { useEffect } from 'react';
import {
  DefaultColorStyle, DefaultColorThemePalette, DefaultSizeStyle, getSnapshot, loadSnapshot, TLEditorSnapshot, useEditor,
} from 'tldraw';

DefaultColorThemePalette.lightMode.red.solid = DEFAULT_THEME.colors.red[5];
DefaultColorThemePalette.lightMode.green.solid = DEFAULT_THEME.colors.green[5];
DefaultColorThemePalette.lightMode.blue.solid = DEFAULT_THEME.colors.blue[5];
DefaultColorThemePalette.lightMode.orange.solid = DEFAULT_THEME.colors.orange[5];
DefaultColorThemePalette.lightMode.grey.solid = DEFAULT_THEME.colors.gray[5];
DefaultColorThemePalette.lightMode.black.solid = DEFAULT_THEME.colors.dark[5];
DefaultColorThemePalette.lightMode.violet.solid = DEFAULT_THEME.colors.violet[5];

export default function TlDrawEditor({
  color, drawingTool, size, onDraw, snapshot,
}: { color: string; drawingTool: string; size: string, onDraw: (store: TLEditorSnapshot) => void, snapshot: TLEditorSnapshot | null | undefined }) {
  const editor = useEditor();

  useEffect(() => {
    if (snapshot === undefined) {
      editor.deleteShapes(Array.from(editor.getCurrentPageShapeIds()));
    } else if (snapshot) {
      loadSnapshot(editor.store, snapshot);
    }
  }, [editor, snapshot]);

  useEffect(() => {
    const unmount = editor.store.listen((c) => {
      // adding new - save
      for (const record of Object.values(c.changes.added)) {
        if (record.typeName === 'shape') {
          onDraw(getSnapshot(editor.store));
        }
      }

      // Updated
      for (const [from, to] of Object.values(c.changes.updated)) {
        if (from.id.startsWith('shape') && to.id.startsWith('shape')) {
          onDraw(getSnapshot(editor.store));
        }
      }

      // Removed
      for (const record of Object.values(c.changes.removed)) {
        if (record.typeName === 'shape') {
          onDraw(getSnapshot(editor.store));
        }
      }
    });

    if (drawingTool === 'pen') {
      editor.setCurrentTool('draw');
    } else {
      editor.setCurrentTool('eraser');
    }

    editor.setStyleForNextShapes(
      DefaultColorStyle,
      color,
    );

    editor.setStyleForNextShapes(
      DefaultSizeStyle,
      size,
    );

    return () => unmount();
  }, [drawingTool, color, size, editor, onDraw]);

  return null;
}
