import {
  Box, Group,
  SegmentedControl,
  ColorSwatch,
  Stack,
  ActionIcon,
  Tooltip,
  Button,
} from '@mantine/core';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCircleFilled, IconEraser, IconMicrophone, IconPencil,
} from '@tabler/icons-react';
import {
  useEffect, useMemo, useState,
} from 'react';

import 'tldraw/tldraw.css';

import throttle from 'lodash.throttle';
import { useResizeObserver } from '@mantine/hooks';
import { isRootNode, isStateNode } from '@trrack/core';
import {
  DefaultColorThemePalette, TLDefaultColorThemeColor, Tldraw, TLEditorSnapshot,
} from 'tldraw';
import { StimulusParams } from '../../../store/types';
import { Registry } from './trrack-alpha/core/src/registry/reg';
import { initializeTrrack } from './trrack-alpha/core/src/provenance/trrack';
import TlDrawEditor from './trrack-alpha/TlDrawEditor';
import { RecordingAudioWaveform } from '../../../components/interface/RecordingAudioWaveform';

const COLORS = [
  'red', 'green', 'blue', 'orange', 'grey', 'black', 'violet',
];

export type Lines = { tool: string; points: number[], width: number, color: string }[]

export type TLDrawState = {
  state: TLEditorSnapshot | null;
  tool: 'pen' | 'eraser';
  color: string;
  penSize: string;
};

export default function Canvas({
  parameters, provenanceState, setAnswer,
} : StimulusParams<{responseId: string}, TLDrawState>) {
  const [tool, setTool] = useState('pen');
  const [penSize, setPenSize] = useState<string>('m');
  const [color, onColorChange] = useState('red');
  const [snapshot, setSnapshot] = useState<null | undefined | TLEditorSnapshot>(null);

  const [undoStack, setUndoStack] = useState<string[]>([]);

  const [ref, { width }] = useResizeObserver();

  useEffect(() => {
    if (provenanceState) {
      setTool(provenanceState.tool || 'pen');
      setPenSize(provenanceState.penSize || 'm');
      onColorChange(provenanceState.color || 'red');
    }
  }, [provenanceState]);

  // creating provenance tracking
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const draw = reg.register('draw', (state: TLDrawState, _lines) => {
      state.state = _lines;
      return state;
    });

    const drawEnd = reg.register('drawEnd', (state: TLDrawState, _lines) => {
      state.state = _lines;
      return state;
    });

    const clear = reg.register('clear', (state: TLDrawState, _lines) => {
      state.state = _lines;
      return state;
    });

    const undo = reg.register('undo', (state: TLDrawState, _lines) => {
      state.state = _lines;
      return state;
    });

    const redo = reg.register('redo', (state: TLDrawState, _lines) => {
      state.state = _lines;
      return state;
    });

    const _setPenSize = reg.register('penSize', (state: TLDrawState, _penSize) => {
      state.penSize = _penSize;
      return state;
    });

    const _setColor = reg.register('color', (state: TLDrawState, _color) => {
      state.color = _color;
      return state;
    });

    const _setTool = reg.register('tool', (state: TLDrawState, _tool) => {
      state.tool = _tool;
      return state;
    });

    const trrackInst = initializeTrrack<TLDrawState>({
      registry: reg,
      initialState: {
        state: null,
        tool: 'pen',
        color: 'red',
        penSize: 's',
      },
    });

    return {
      actions: {
        draw,
        drawEnd,
        undo,
        clear,
        redo,
        setPenSize: _setPenSize,
        setColor: _setColor,
        setTool: _setTool,
      },
      trrack: trrackInst,
    };
  }, []);

  const debouncedApply = useMemo(() => throttle((l: TLEditorSnapshot) => {
    trrack.apply('drawing', actions.draw(l), { isEphemeral: true, makeCheckpoint: false });
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {},
    });

    setSnapshot(null);
  }, 100), [actions, setAnswer, trrack]);

  const handleMouseMove = (e: TLEditorSnapshot) => {
    debouncedApply(e);
  };

  return (
    <Box
      ref={ref}
      style={{
        overflow: 'hidden', width: '100%', height: '100%', touchAction: 'none', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <Stack>
        <Group>
          <SegmentedControl
            size="md"
            color={tool === 'eraser' ? 'lightpink' : color}
            data={[
              { label: <IconPencil size={16} stroke={2.5} color="black" />, value: 'pen' },
              { label: <IconEraser size={16} stroke={2.5} color="black" />, value: 'eraser' },
            ]}
            onChange={(c) => { setTool(c); trrack.apply('Set Tool', actions.setTool(c)); }}
          />
          <SegmentedControl
            size="md"
            color="lightgray"
            data={[
              { label: <IconCircleFilled size={8} color="black" />, value: 'm' },
              { label: <IconCircleFilled size={12} color="black" />, value: 'l' },
              { label: <IconCircleFilled size={16} color="black" />, value: 'xl' },
            ]}
            onChange={(c) => { setPenSize(c); trrack.apply('Change Pen Size', actions.setPenSize(c)); }}
          />
          <Group gap={6}>
            {COLORS.map((c) => (
              <ColorSwatch
                onClick={() => { onColorChange(c); trrack.apply('Change Color', actions.setColor(c)); }}
                key={c}
                // @ts-ignore
                color={DefaultColorThemePalette.lightMode[c as unknown].solid}
                style={{ cursor: 'pointer', outlineOffset: '1px', outline: c === color ? '2px solid black' : 'none' }}
              />
            ))}
          </Group>

          <Button onClick={() => setSnapshot(undefined)}>
            Clear all
          </Button>
          <Tooltip label="Undo">
            <ActionIcon
              variant="light"
              disabled={isRootNode(trrack.graph.backend.nodes[trrack.getLastNNonEphemeralNode(undoStack.length)])}
              onClick={() => {
                const ephemeralNode = trrack.getLastNNonEphemeralNode(undoStack.length + 1);
                const currentNode = trrack.current.id;
                if (isStateNode(trrack.current)) {
                  const prevState = trrack.getState(trrack.graph.backend.nodes[ephemeralNode]);
                  trrack.apply('undo', actions.undo(prevState.state), { isEphemeral: true, makeCheckpoint: false });
                  setUndoStack([...undoStack, currentNode]);
                }
              }}
            >
              <IconArrowBackUp />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Redo">
            <ActionIcon
              variant="light"
              disabled={undoStack.length === 0}
              onClick={() => {
                const newState = trrack.getState(trrack.graph.backend.nodes[undoStack[undoStack.length - 1]]);
                trrack.apply('redo', actions.undo(newState.state), { isEphemeral: true, makeCheckpoint: false });
                setUndoStack(undoStack.slice(0, -1));
              }}
            >

              <IconArrowForwardUp />
            </ActionIcon>
          </Tooltip>

        </Group>

        <div style={{ height: window.innerHeight - 100, width }}>
          <Tldraw persistenceKey={parameters.responseId} hideUi initialState="" licenseKey="tldraw-2026-03-18/WyJlNm1fQTFpTiIsWyIqIl0sMTYsIjIwMjYtMDMtMTgiXQ.F1gp8Hb+4X6fiFeLt3VpyDgpLdqOpWzQ+BCDN9X6c/WiasoArZ2Uj7tUM0vqX1NYy4BebKY5BRJr92nuqwXuKA">
            <TlDrawEditor color={color} drawingTool={tool} size={penSize} onDraw={handleMouseMove} snapshot={provenanceState?.state || snapshot} />
          </Tldraw>
        </div>
      </Stack>
    </Box>
  );
}
