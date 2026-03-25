import {
  useCallback, useMemo, useState,
} from 'react';
import {
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconDownload, IconExternalLink, IconPhoto } from '@tabler/icons-react';
import JSZip from 'jszip';
import { useResizeObserver } from '@mantine/hooks';
import { useParams } from 'react-router';
import { TLEditorSnapshot } from 'tldraw';
import { ParticipantData, StudyConfig } from '../../../parser/types';
import {
  isDrawingTask, extractFinalDrawingSnapshot, extractTimedSnapshots,
} from '../../../utils/extractDrawingState';
import { useNavigateToTrial } from '../../../utils/useNavigateToTrial';
import { parseConditionParam } from '../../../utils/handleConditionLogic';
import { DrawingTaskThumbnail } from './DrawingTaskThumbnail';
import { DrawingTimeline, DrawingTaskInfo } from './DrawingTimeline';
import { TimelineBatchExporter, BatchItem } from './TimelineBatchExporter';

const THUMBNAIL_WIDTH = 400;
const THUMBNAIL_HEIGHT = 300;
const TIMELINE_SNAPSHOTS_PER_TASK = 8;

type DrawingTask = {
  key: string;
  taskName: string;
  trialOrder: string;
  startTime: number;
  endTime: number;
  snapshot: TLEditorSnapshot | null;
};

function isExcludedDrawingTask(componentName: string): boolean {
  const lower = componentName.toLowerCase();
  return lower.includes('followup') || lower.includes('training');
}

function getDrawingTasks(participantData: ParticipantData): DrawingTask[] {
  return Object.entries(participantData.answers)
    .filter(([, answer]) => isDrawingTask(answer.provenanceGraph?.stimulus)
      && !isExcludedDrawingTask(answer.componentName || ''))
    .map(([key, answer]) => {
      const prov = answer.provenanceGraph?.stimulus;
      const snapshot = prov ? extractFinalDrawingSnapshot(prov) : null;
      return {
        key,
        taskName: answer.componentName || key,
        trialOrder: answer.trialOrder,
        startTime: answer.startTime,
        endTime: answer.endTime,
        snapshot,
      };
    })
    .sort((a, b) => a.startTime - b.startTime);
}

const LABEL_H = 40;
const FONT_SIZE = 16;

async function addLabel(url: string, line1: string, line2: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height + LABEL_H;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, img.height, canvas.width, LABEL_H);
      ctx.fillStyle = '#000000';
      ctx.textBaseline = 'middle';
      const y = img.height + LABEL_H / 2;
      ctx.font = `bold ${FONT_SIZE}px sans-serif`;
      ctx.fillText(line1, 8, y - 9);
      ctx.font = `${FONT_SIZE - 2}px sans-serif`;
      ctx.fillText(line2, 8, y + 9);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)![1];
  const binary = atob(data);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function downloadScreenshotsZip(
  participantId: string,
  tasks: DrawingTask[],
  imageUrls: Record<string, string | null>,
) {
  const zip = new JSZip();
  const folder = zip.folder(participantId);
  if (!folder) return;

  const fetches = tasks.map(async (task, i) => {
    const url = imageUrls[task.key];
    if (!url) return;
    const labelled = await addLabel(url, participantId, task.taskName);
    const blob = dataUrlToBlob(labelled);
    const paddedIndex = String(i + 1).padStart(2, '0');
    folder.file(`${paddedIndex}_${task.taskName}.png`, blob);
  });

  await Promise.all(fetches);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const blobUrl = URL.createObjectURL(zipBlob);
  Object.assign(document.createElement('a'), {
    href: blobUrl,
    download: `${participantId}_drawings.zip`,
  }).click();
  URL.revokeObjectURL(blobUrl);
}

function ParticipantList({
  participants,
  selectedId,
  onSelect,
}: {
  participants: ParticipantData[];
  selectedId: string | null;
  onSelect: (p: ParticipantData) => void;
}) {
  return (
    <ScrollArea h="100%" type="scroll">
      <Stack gap={2} p="xs">
        {participants.map((p) => (
          <UnstyledButton
            key={p.participantId}
            onClick={() => onSelect(p)}
            px="sm"
            py={6}
            style={{
              borderRadius: 4,
              backgroundColor: selectedId === p.participantId ? '#e7f5ff' : 'transparent',
              border: selectedId === p.participantId ? '1px solid #74c0fc' : '1px solid transparent',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            <Text size="sm" truncate>{p.participantId}</Text>
          </UnstyledButton>
        ))}
      </Stack>
    </ScrollArea>
  );
}

export function DrawingScreenshotsView({
  visibleParticipants,

  studyConfig: _studyConfig,
}: {
  visibleParticipants: ParticipantData[];
  studyConfig: StudyConfig;
}) {
  const { studyId } = useParams();
  const navigateToTrial = useNavigateToTrial();

  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantData | null>(null);
  // imageUrls: final-state images for the End-of-Task grid
  const [imageUrls, setImageUrls] = useState<Record<string, string | null>>({});
  // timelineImageUrls: intermediate images for the timeline, keyed by BatchItem.id
  const [timelineImageUrls, setTimelineImageUrls] = useState<Record<string, string | null>>({});
  const [timelineRef, { width: timelineWidth }] = useResizeObserver();
  const [isDownloading, setIsDownloading] = useState(false);

  const participantCondition = useMemo(() => {
    if (!selectedParticipant) return undefined;
    const parsed = parseConditionParam(
      selectedParticipant.conditions ?? selectedParticipant.searchParams?.condition,
    );
    return parsed.length > 0 ? parsed.join(',') : undefined;
  }, [selectedParticipant]);

  const drawingTasks = useMemo(
    () => (selectedParticipant ? getDrawingTasks(selectedParticipant) : []),
    [selectedParticipant],
  );

  // Flat list of all timeline snapshot items across all tasks, for the batch exporter.
  // Each item id encodes taskKey + nodeId so we can route the result back.
  const timelineBatchItems = useMemo((): BatchItem[] => {
    if (!selectedParticipant) return [];
    return drawingTasks.flatMap((task) => {
      const prov = selectedParticipant.answers[task.key]?.provenanceGraph?.stimulus;
      if (!prov) return [];
      return extractTimedSnapshots(prov, TIMELINE_SNAPSHOTS_PER_TASK).map((ts) => ({
        id: `${task.key}__${ts.nodeId}`,
        snapshot: ts.snapshot,
      }));
    });
  }, [selectedParticipant, drawingTasks]);

  // Per-task metadata for timeline: which batch item IDs belong to each task + their timestamps
  const taskTimelineMetadata = useMemo(() => {
    if (!selectedParticipant) return {};
    const meta: Record<string, Array<{ id: string; timestamp: number }>> = {};
    drawingTasks.forEach((task) => {
      const prov = selectedParticipant.answers[task.key]?.provenanceGraph?.stimulus;
      if (!prov) { meta[task.key] = []; return; }
      meta[task.key] = extractTimedSnapshots(prov, TIMELINE_SNAPSHOTS_PER_TASK).map((ts) => ({
        id: `${task.key}__${ts.nodeId}`,
        timestamp: ts.timestamp,
      }));
    });
    return meta;
  }, [selectedParticipant, drawingTasks]);

  const handleSelectParticipant = useCallback((p: ParticipantData) => {
    setSelectedParticipant(p);
    setImageUrls({});
    setTimelineImageUrls({});
  }, []);

  const handleImageReady = useCallback((key: string, url: string | null) => {
    setImageUrls((prev) => ({ ...prev, [key]: url }));
  }, []);

  const handleTimelineItemReady = useCallback((id: string, url: string | null) => {
    console.log('calling the callback');
    setTimelineImageUrls((prev) => ({ ...prev, [id]: url }));
  }, []);

  const readyCount = Object.keys(imageUrls).length;
  const allReady = drawingTasks.length > 0 && readyCount === drawingTasks.length;

  const timelineTasks: DrawingTaskInfo[] = useMemo(
    () => drawingTasks.map((task) => ({
      taskName: task.taskName,
      startTime: task.startTime,
      endTime: task.endTime,
      snapshots: (taskTimelineMetadata[task.key] ?? []).map((meta) => ({
        timestamp: meta.timestamp,
        imageUrl: timelineImageUrls[meta.id] ?? null,
      })),
    })),
    [drawingTasks, taskTimelineMetadata, timelineImageUrls],
  );

  console.log(timelineTasks, timelineImageUrls);

  const handleDownload = useCallback(async () => {
    if (!selectedParticipant) return;
    setIsDownloading(true);
    try {
      await downloadScreenshotsZip(selectedParticipant.participantId, drawingTasks, imageUrls);
    } finally {
      setIsDownloading(false);
    }
  }, [selectedParticipant, drawingTasks, imageUrls]);

  return (
    <Flex style={{ height: '100%' }}>
      {/* Left panel: participant list */}
      <Box
        style={{
          width: 220,
          minWidth: 220,
          borderRight: '1px solid #dee2e6',
          height: '100%',
        }}
      >
        <Box p="sm" style={{ borderBottom: '1px solid #dee2e6' }}>
          <Text size="sm" fw={600}>Participants</Text>
          <Text size="xs" c="dimmed">{`${visibleParticipants.length} visible`}</Text>
        </Box>
        <Box style={{ height: 'calc(100% - 56px)' }}>
          <ParticipantList
            participants={[...visibleParticipants].sort((a, b) => a.participantId.localeCompare(b.participantId))}
            selectedId={selectedParticipant?.participantId ?? null}
            onSelect={handleSelectParticipant}
          />
        </Box>
      </Box>

      {/* Right panel: drawing tasks */}
      <Box style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        {selectedParticipant ? (
          <ScrollArea h="100%" type="scroll">
            {/* Batch exporter for timeline snapshots — keyed by participant so it remounts on change */}
            <TimelineBatchExporter
              key={selectedParticipant.participantId}
              items={timelineBatchItems}
              onItemReady={handleTimelineItemReady}
            />

            <Stack p="md" gap="md">
              {/* Header */}
              <Flex justify="space-between" align="center">
                <Stack gap={2}>
                  <Group gap="xs">
                    <IconPhoto size={18} />
                    <Title order={5}>Drawing Screenshots</Title>
                  </Group>
                  <Text size="sm" c="dimmed">{selectedParticipant.participantId}</Text>
                </Stack>
                <Button
                  leftSection={<IconDownload size={16} />}
                  disabled={!allReady}
                  loading={isDownloading}
                  onClick={handleDownload}
                  size="sm"
                >
                  {allReady
                    ? `Download ZIP (${drawingTasks.length} images)`
                    : `Exporting… (${readyCount}/${drawingTasks.length})`}
                </Button>
              </Flex>

              {drawingTasks.length === 0 ? (
                <Center py="xl">
                  <Text c="dimmed">No drawing tasks found for this participant.</Text>
                </Center>
              ) : (
                <>
                  {/* Session Timeline */}
                  <Box>
                    <Text size="sm" fw={600} mb="sm">Session Timeline</Text>
                    <Box ref={timelineRef}>
                      {timelineWidth > 0 && (
                        <DrawingTimeline tasks={timelineTasks} width={timelineWidth} />
                      )}
                    </Box>
                  </Box>

                  <Divider />

                  {/* End-of-Task Drawings */}
                  <Box>
                    <Text size="sm" fw={600} mb="sm">End-of-Task Drawings</Text>
                    <Group gap="xs" align="flex-start">
                      {drawingTasks.map((task) => (
                        <Stack key={`${selectedParticipant.participantId}__${task.key}`} gap={4}>
                          <Tooltip label="Click to open replay" position="top" withinPortal>
                            <Box
                              style={{ cursor: 'pointer' }}
                              onClick={() => studyId && navigateToTrial(
                                task.trialOrder,
                                selectedParticipant.participantId,
                                studyId,
                                participantCondition,
                              )}
                            >
                              <DrawingTaskThumbnail
                                snapshot={task.snapshot}
                                taskName={task.taskName}
                                width={THUMBNAIL_WIDTH}
                                height={THUMBNAIL_HEIGHT}
                                onImageReady={(url) => handleImageReady(task.key, url)}
                              />
                            </Box>
                          </Tooltip>
                          <Group gap={4} wrap="nowrap" style={{ width: THUMBNAIL_WIDTH }}>
                            <Text size="sm" fw={500} truncate title={task.taskName} style={{ flex: 1 }}>
                              {task.taskName}
                            </Text>
                            <Tooltip label="Open replay" withinPortal>
                              <IconExternalLink
                                size={14}
                                style={{ cursor: 'pointer', flexShrink: 0, color: 'var(--mantine-color-blue-6)' }}
                                onClick={() => studyId && navigateToTrial(
                                  task.trialOrder,
                                  selectedParticipant.participantId,
                                  studyId,
                                  participantCondition,
                                )}
                              />
                            </Tooltip>
                          </Group>
                          <Text size="xs" c="dimmed">
                            {task.startTime > 0
                              ? `Duration: ${Math.round((task.endTime - task.startTime) / 1000)}s`
                              : 'Not completed'}
                          </Text>
                        </Stack>
                      ))}
                    </Group>
                  </Box>
                </>
              )}
            </Stack>
          </ScrollArea>
        ) : (
          <Center style={{ height: '100%' }}>
            <Stack align="center" gap="xs">
              <IconPhoto size={48} color="gray" />
              <Text c="dimmed">Select a participant to view their drawing screenshots.</Text>
            </Stack>
          </Center>
        )}
      </Box>
    </Flex>
  );
}
