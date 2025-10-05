import {
  Box, Group, DEFAULT_THEME,
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
  IconCircleFilled, IconEraser, IconPencil,
} from '@tabler/icons-react';
import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Circle, Layer, Line, Stage,
} from 'react-konva';
import throttle from 'lodash.throttle';
import { useResizeObserver } from '@mantine/hooks';
import { KonvaEventObject } from 'konva/lib/Node';
import { isRootNode, isStateNode, StateNode } from '@trrack/core';
import { StimulusParams } from '../../../store/types';
import { Registry } from './trrack-alpha/core/src/registry/reg';
import { initializeTrrack } from './trrack-alpha/core/src/provenance/trrack';

const COLORS = [
  DEFAULT_THEME.colors.red[5],
  DEFAULT_THEME.colors.green[5],
  DEFAULT_THEME.colors.blue[5],
  DEFAULT_THEME.colors.orange[5],
  DEFAULT_THEME.colors.gray[5],
  DEFAULT_THEME.colors.dark[5],
  DEFAULT_THEME.colors.violet[5],
];

export type Lines = { tool: string; points: number[], width: number, color: string }[]

export type KonvaState = {
  lines: Lines;
  tool: 'pen' | 'eraser';
  color: string;
  penSize: string;
};

export default function Canvas({
  parameters, provenanceState, setAnswer, answers,
} : StimulusParams<{responseId: string}, KonvaState>) {
  const [tool, setTool] = useState('pen');
  const [penSize, setPenSize] = useState<string>('5');
  const [lines, setLines] = useState<Lines>([]);
  const [color, onColorChange] = useState(DEFAULT_THEME.colors.red[5]);

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const isDrawing = useRef(false);
  const [undoStack, setUndoStack] = useState<string[]>([]);

  const [ref, { width }] = useResizeObserver();

  useEffect(() => {
    if (provenanceState) {
      setLines(provenanceState.lines || []);
      setTool(provenanceState.tool || 'pen');
      setPenSize(provenanceState.penSize || '5');
      onColorChange(provenanceState.color || DEFAULT_THEME.colors.red[5]);
    }
  }, [provenanceState]);

  // creating provenance tracking
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();

    const draw = reg.register('draw', (state: KonvaState, _lines) => {
      state.lines = _lines;
      return state;
    });

    const drawEnd = reg.register('drawEnd', (state: KonvaState, _lines) => {
      state.lines = _lines;
      return state;
    });

    const clear = reg.register('clear', (state: KonvaState, _lines) => {
      state.lines = [];
      return state;
    });

    const undo = reg.register('undo', (state: KonvaState, _lines) => {
      state.lines = _lines;
      return state;
    });

    const redo = reg.register('redo', (state: KonvaState, _lines) => {
      state.lines = _lines;
      return state;
    });

    const trrackInst = initializeTrrack<KonvaState>({
      registry: reg,
      initialState: {
        lines: [],
        tool: 'pen',
        color: DEFAULT_THEME.colors.red[5],
        penSize: '5',
      },
    });

    if (parameters.responseId) {
      const answer = Object.keys(answers).find((a) => a.startsWith(parameters.responseId)) || '';

      if (answers[answer].provenanceGraph.stimulus) {
        trrackInst.importObject(structuredClone(answers[answer].provenanceGraph.stimulus));
      }

      const state = trrackInst.getState(trrackInst.current);

      setLines(state.lines || []);
      setTool(state.tool || 'pen');
      setPenSize(state.penSize || '5');
      onColorChange(state.color || DEFAULT_THEME.colors.red[5]);
    }

    return {
      actions: {
        draw,
        drawEnd,
        undo,
        clear,
        redo,
      },
      trrack: trrackInst,
    };
  }, []);

  const debouncedApply = useMemo(() => throttle((l: Lines) => {
    trrack.apply('drawing', actions.draw(structuredClone(l).concat()), { isEphemeral: true, makeCheckpoint: false });
  }, 50), [actions, trrack]);

  const handleMouseDown = (e: KonvaEventObject<MouseEvent, unknown>) => {
    if (!e.target || !e.target.getStage()) return;

    isDrawing.current = true;
    const pos = e.target.getStage()!.getPointerPosition()!;
    setLines([...lines, {
      tool, points: [pos.x, pos.y], width: tool === 'pen' ? +penSize : +penSize * 8, color,
    }]);
  };

  const handleMouseMove = (e: KonvaEventObject<TouchEvent, unknown>) => {
    // no drawing - skipping
    if (tool === 'eraser') {
      const pos = e.target.getStage()!.getPointerPosition()!;
      setMousePos({ x: pos.x, y: pos.y });
    }

    if (!isDrawing.current) {
      return;
    }
    const stage = e.target.getStage()!;
    const point = stage.getPointerPosition()!;
    const lastLine = structuredClone(lines[lines.length - 1]);
    // add point
    lastLine.points = lastLine.points.concat([point.x, point.y]);

    // replace last
    lines.splice(lines.length - 1, 1, lastLine);
    setLines(lines.concat());

    if (undoStack) {
      setUndoStack([]);
    }

    debouncedApply(lines.concat());
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
    trrack.apply('draw end', actions.drawEnd(structuredClone(lines).concat()), { isEphemeral: false, makeCheckpoint: false });

    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {},
    });
  };

  // console.log(undoStack, trrack.graph);

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
            onChange={setTool}
          />
          <SegmentedControl
            size="md"
            color="lightgray"
            data={[
              { label: <IconCircleFilled size={8} color="black" />, value: '5' },
              { label: <IconCircleFilled size={12} color="black" />, value: '15' },
              { label: <IconCircleFilled size={16} color="black" />, value: '25' },
            ]}
            onChange={setPenSize}
          />
          <Group gap={6}>
            {COLORS.map((c) => <ColorSwatch onClick={() => onColorChange(c)} key={c} color={c} style={{ cursor: 'pointer', outlineOffset: '1px', outline: c === color ? '2px solid black' : 'none' }} />)}
          </Group>

          <Button onClick={() => {
            trrack.apply('clear', actions.clear([]), { isEphemeral: false, makeCheckpoint: false });
            setLines([]);
          }}
          >
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
                  trrack.apply('undo', actions.undo(structuredClone(prevState.lines)), { isEphemeral: true, makeCheckpoint: false });
                  setLines(prevState.lines);
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
                trrack.apply('redo', actions.undo(structuredClone(newState.lines)), { isEphemeral: true, makeCheckpoint: false });
                setLines(newState.lines);
                setUndoStack(undoStack.slice(0, -1));
              }}
            >

              <IconArrowForwardUp />
            </ActionIcon>
          </Tooltip>

        </Group>

        <Stage
          style={{ cursor: tool === 'eraser' ? `src${IconEraser}` : 'default' }}
          width={width}
          height={window.innerHeight - 200}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onTouchStart={handleMouseDown as unknown as (e: KonvaEventObject<TouchEvent, unknown>) => void}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
        >
          <Layer>
            {lines.map((line, i) => (
              <Line
                key={i}
                points={line.points}
                stroke={line.color}
                strokeWidth={line.width}
                tension={0.5}
                lineCap="round"
                lineJoin="round"
                globalCompositeOperation={
                line.tool === 'eraser' ? 'destination-out' : 'source-over'
              }
              />
            ))}
            {tool === 'eraser' ? (
              <Circle x={mousePos.x} y={mousePos.y} radius={+penSize * 4} fill="black" opacity={0.1} />
            ) : null}
          </Layer>
        </Stage>
      </Stack>
    </Box>
  );
}
