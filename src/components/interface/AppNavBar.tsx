import { Box, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { ReactMarkdownWrapper } from '../ReactMarkdownWrapper';
import { useStudyConfig } from '../../store/hooks/useStudyConfig';
import { useStoredAnswer } from '../../store/hooks/useStoredAnswer';
import { ResponseBlock } from '../response/ResponseBlock';
import { useCurrentComponent } from '../../routes/utils';
import { studyComponentToIndividualComponent } from '../../utils/handleComponentInheritance';
import { getStaticAssetByPath } from '../../utils/getStaticAsset';
import { PREFIX } from '../../utils/Prefix';

export function AppNavBar({ width, top, sidebarOpen }: { width: number, top: number, sidebarOpen: boolean }) {
  // Get the config for the current step
  const studyConfig = useStudyConfig();
  const currentComponent = useCurrentComponent();
  const stepConfig = studyConfig.components[currentComponent];

  const currentConfig = useMemo(() => {
    if (stepConfig) {
      return studyComponentToIndividualComponent(stepConfig, studyConfig);
    }

    return null;
  }, [stepConfig, studyConfig]);

  const status = useStoredAnswer();

  const [importedInstructions, setImportedInstructions] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInstruction() {
      const asset = await getStaticAssetByPath(`${PREFIX}${currentConfig?.instructionPath}`);
      if (asset !== undefined) {
        setImportedInstructions(asset);
      }
    }

    if (currentConfig?.instructionPath) {
      fetchInstruction();
    } else {
      setImportedInstructions(currentConfig?.instruction || '');
    }
  }, [currentConfig?.instruction, currentConfig?.instructionPath]);

  const instruction = importedInstructions || (currentConfig?.instruction ? currentConfig?.instruction : '');
  const instructionLocation = useMemo(() => currentConfig?.instructionLocation ?? studyConfig.uiConfig.instructionLocation ?? 'sidebar', [currentConfig, studyConfig]);
  const instructionInSideBar = instructionLocation === 'sidebar';

  return currentConfig ? (
    <Box className="sidebar" bg="gray.1" display={sidebarOpen ? 'block' : 'none'} style={{ zIndex: 0, marginTop: top, position: 'relative' }} w={width} miw={width}>
      {instructionInSideBar && instruction !== '' && (
        <Box
          bg="gray.3"
          p="md"
        >
          <Text span c="orange.8" fw={700} inherit>
            Task:
          </Text>
          <ReactMarkdownWrapper text={instruction} />
        </Box>
      )}

      <Box p="md">
        <ResponseBlock
          key={`${currentComponent}-sidebar-response-block`}
          status={status}
          config={currentConfig}
          location="sidebar"
        />
      </Box>
    </Box>
  ) : null;
}
