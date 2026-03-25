import { useMemo, useState } from 'react';
import * as d3 from 'd3';
import {
  Box, Text, Tooltip,
} from '@mantine/core';

const TASK_LABEL_WIDTH = 120;

// Compact row (overview)
const COMPACT_THUMB_W = 120;
const COMPACT_THUMB_H = 90;
const COMPACT_ROW_H = COMPACT_THUMB_H + 20;
const COMPACT_ROW_GAP = 10;

// Expanded row (selected task)
const EXPANDED_THUMB_W = 320;
const EXPANDED_THUMB_H = 240;
const EXPANDED_ROW_H = EXPANDED_THUMB_H + 28;

const AXIS_H = 44;
const MARGIN = { right: 16, top: 8 };

export type SnapshotImageInfo = {
  timestamp: number; // epoch ms
  imageUrl: string | null;
};

export type DrawingTaskInfo = {
  taskName: string;
  startTime: number;
  endTime: number;
  snapshots: SnapshotImageInfo[];
};

function formatRelativeTime(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}:${String(rem).padStart(2, '0')}` : `0:${String(rem).padStart(2, '0')}`;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

export function DrawingTimeline({
  tasks,
  width,
}: {
  tasks: DrawingTaskInfo[];
  width: number;
}) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  console.log(tasks);

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.startTime - b.startTime),
    [tasks],
  );

  const sessionStart = sortedTasks[0]?.startTime ?? 0;
  const sessionEnd = sortedTasks[sortedTasks.length - 1]?.endTime ?? 0;

  const xScale = useMemo(
    () => d3
      .scaleLinear()
      .domain([0, sessionEnd - sessionStart])
      .range([TASK_LABEL_WIDTH, width - MARGIN.right])
      .clamp(true),
    [sessionStart, sessionEnd, width],
  );

  if (sortedTasks.length === 0) return null;

  function handleAxisClick(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = sessionStart + xScale.invert(x);

    // Find which task contains this time
    const hit = sortedTasks.find((task) => t >= task.startTime && t <= task.endTime);
    setSelectedTask(hit ? hit.taskName : null);
  }

  // Decide what to render below the axis
  const selected = selectedTask
    ? sortedTasks.find((t) => t.taskName === selectedTask) ?? null
    : null;

  const tasksToShow = selected ? [selected] : sortedTasks;
  const thumbW = selected ? EXPANDED_THUMB_W : COMPACT_THUMB_W;
  const thumbH = selected ? EXPANDED_THUMB_H : COMPACT_THUMB_H;
  const rowH = selected ? EXPANDED_ROW_H : COMPACT_ROW_H;
  const rowGap = selected ? 0 : COMPACT_ROW_GAP;

  const totalRowsHeight = tasksToShow.length * (rowH + rowGap);

  console.log(tasksToShow);

  return (
    <Box style={{ width, position: 'relative' }}>
      {/* Global time axis */}
      <svg
        width={width}
        height={MARGIN.top + AXIS_H}
        style={{ overflow: 'visible', display: 'block', cursor: 'pointer' }}
        onClick={handleAxisClick}
      >
        {/* Baseline */}
        <line
          x1={TASK_LABEL_WIDTH}
          x2={width - MARGIN.right}
          y1={MARGIN.top + AXIS_H / 2}
          y2={MARGIN.top + AXIS_H / 2}
          stroke="#868e96"
          strokeWidth={2}
        />
        <text x={TASK_LABEL_WIDTH} y={MARGIN.top + AXIS_H / 2 - 8} fontSize={10} fill="#868e96">
          0:00
        </text>
        <text
          x={width - MARGIN.right}
          y={MARGIN.top + AXIS_H / 2 - 8}
          fontSize={10}
          fill="#868e96"
          textAnchor="end"
        >
          {formatRelativeTime(sessionEnd - sessionStart)}
        </text>

        {/* Task bars */}
        {sortedTasks.map((task) => {
          const x1 = xScale(task.startTime - sessionStart);
          const x2 = xScale(task.endTime - sessionStart);
          const isSelected = task.taskName === selectedTask;
          return (
            <g key={task.taskName}>
              <Tooltip label={task.taskName} withinPortal>
                <rect
                  x={x1}
                  width={Math.max(x2 - x1, 4)}
                  y={MARGIN.top + AXIS_H / 2 - 8}
                  height={16}
                  fill={isSelected ? '#1971c2' : '#228be6'}
                  opacity={isSelected ? 1 : 0.65}
                  rx={2}
                  style={{ cursor: 'pointer' }}
                />
              </Tooltip>
              <line
                x1={x1}
                x2={x1}
                y1={MARGIN.top + AXIS_H / 2 + 8}
                y2={MARGIN.top + AXIS_H - 2}
                stroke="#adb5bd"
                strokeWidth={1}
              />
              <text
                x={x1}
                y={MARGIN.top + AXIS_H + 4}
                fontSize={9}
                fill="#868e96"
                textAnchor="middle"
              >
                {formatRelativeTime(task.startTime - sessionStart)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hint text */}
      {!selected && (
        <Text size="xs" c="dimmed" mb={6}>
          Click a task bar to expand its snapshots
        </Text>
      )}
      {selected && (
        <Text size="xs" c="dimmed" mb={6} style={{ cursor: 'pointer' }} onClick={() => setSelectedTask(null)}>
          ←
          {' '}
          {selected.taskName}
          {' '}
          —
          {' '}
          {formatDuration(selected.endTime - selected.startTime)}
          {' '}
          (click to collapse)
        </Text>
      )}

      {/* Rows */}
      <Box style={{ position: 'relative', height: totalRowsHeight, marginTop: 4 }}>
        {tasksToShow.map((task, rowIndex) => {
          const rowTop = rowIndex * (rowH + rowGap);

          // Skip first snapshot (usually just one stroke)
          const visibleSnapshots = task.snapshots.slice(1);

          // In expanded mode show all; in compact show last only
          const snapsToRender = selected ? visibleSnapshots : visibleSnapshots.slice(-1);

          console.log(snapsToRender);

          // Compute thumbnail positions
          const taskX1 = xScale(task.startTime - sessionStart);
          const taskX2 = xScale(task.endTime - sessionStart);

          const MIN_GAP = 6;
          let lastRight = -Infinity;
          const thumbPositions = snapsToRender.map((snap, idx) => {
            let left: number;
            if (selected) {
              // Pack sequentially from the label edge
              left = Math.max(TASK_LABEL_WIDTH, lastRight + MIN_GAP);
              if (idx === 0) left = TASK_LABEL_WIDTH;
            } else {
              const cx = (taskX1 + taskX2) / 2;
              const ideal = cx - thumbW / 2;
              const clamped = Math.max(
                TASK_LABEL_WIDTH,
                Math.min(ideal, width - MARGIN.right - thumbW),
              );
              left = Math.max(clamped, lastRight + MIN_GAP);
            }
            lastRight = left + thumbW;
            return left;
          });

          return (
            <Box
              key={task.taskName}
              style={{
                position: 'absolute',
                top: rowTop,
                left: 0,
                width: '100%',
                height: rowH,
              }}
            >
              {/* Row divider */}
              {!selected && rowIndex > 0 && (
                <Box
                  style={{
                    position: 'absolute',
                    top: -rowGap / 2,
                    left: TASK_LABEL_WIDTH,
                    right: MARGIN.right,
                    height: 1,
                    backgroundColor: '#f1f3f5',
                  }}
                />
              )}

              {/* Task label */}
              <Box
                style={{
                  position: 'absolute',
                  left: 0,
                  width: TASK_LABEL_WIDTH - 8,
                  top: 0,
                  height: thumbH,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Tooltip
                  label={`${task.taskName} — ${formatDuration(task.endTime - task.startTime)}`}
                  withinPortal
                >
                  <Text size="xs" fw={500} lineClamp={2} style={{ cursor: 'default' }}>
                    {task.taskName}
                  </Text>
                </Tooltip>
              </Box>

              {/* Thumbnails */}
              {snapsToRender.map((snap, snapIdx) => {
                const left = thumbPositions[snapIdx];
                return (
                  <Tooltip
                    key={snap.timestamp}
                    label={`@ ${formatRelativeTime(snap.timestamp - sessionStart)}`}
                    position="top"
                    withinPortal
                  >
                    <Box
                      style={{
                        position: 'absolute',
                        left,
                        top: 0,
                        width: thumbW,
                        zIndex: snapIdx + 1,
                      }}
                    >
                      <Box
                        style={{
                          width: thumbW,
                          height: thumbH,
                          border: '1px solid #dee2e6',
                          borderRadius: 4,
                          overflow: 'hidden',
                          backgroundColor: '#fff',
                        }}
                      >
                        {snap.imageUrl ? (
                          <img
                            src={snap.imageUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                          />
                        ) : (
                          <Box style={{ width: '100%', height: '100%', backgroundColor: '#f8f9fa' }} />
                        )}
                      </Box>
                      <Text size="xs" c="dimmed" ta="center" mt={2}>
                        {formatRelativeTime(snap.timestamp - sessionStart)}
                      </Text>
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
