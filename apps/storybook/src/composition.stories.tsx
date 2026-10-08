import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DashboardBlock,
  DashboardPattern,
  MasterDetailPattern,
  MetricBlock,
  MetricGrid,
  PanelBlock,
  WorkspacePattern,
  StackLayout,
  GridLayout,
  SplitLayout,
  PanelWidget,
  TextWidget,
  ButtonWidget,
  InputWidget,
  SelectWidget,
  MetricWidget,
  PlaceholderWidget
} from '@foundation/ui';

const meta = { title: 'Kernel/UI composition', component: DashboardPattern, args: { children: null } } satisfies Meta<typeof DashboardPattern>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  render: () => (
    <DashboardPattern>
      <DashboardBlock span={12}>
        <MetricGrid>
          <MetricBlock label="Active" value={12} />
          <MetricBlock label="Queued" value={3} />
          <MetricBlock label="Errors" value={0} />
        </MetricGrid>
      </DashboardBlock>
      <DashboardBlock span={8}><PanelBlock title="Primary panel">Primary content</PanelBlock></DashboardBlock>
      <DashboardBlock span={4}><PanelBlock title="Secondary panel">Secondary content</PanelBlock></DashboardBlock>
    </DashboardPattern>
  )
};

export const MasterDetail: Story = {
  render: () => (
    <MasterDetailPattern
      master={<PanelBlock title="Master">List / tree / navigation</PanelBlock>}
      detail={<PanelBlock title="Detail">Selected item details</PanelBlock>}
    />
  )
};

export const Workspace: Story = {
  render: () => (
    <WorkspacePattern
      toolbar={<PanelBlock size="small">Toolbar</PanelBlock>}
      main={<PanelBlock title="Main">Editor / chart / simulation / map</PanelBlock>}
      side={<PanelBlock title="Inspector">Parameters</PanelBlock>}
      bottom={<PanelBlock title="Logs">Task output</PanelBlock>}
    />
  )
};

export const VisualCompositionPrimitives: Story = {
  render: () => (
    <StackLayout gap={16}>
      <TextWidget text="Mission workspace" variant="title" />
      <GridLayout columns={3} gap={12}>
        <MetricWidget label="Active" value={3} />
        <MetricWidget label="Queued" value={1} />
        <MetricWidget label="Health" value="Nominal" />
      </GridLayout>
      <SplitLayout
        secondarySize={320}
        primary={<PlaceholderWidget title="Domain view" description="Map / chart / editor / domain view" />}
        secondary={(
          <PanelWidget title="Inspector">
            <StackLayout gap={12}>
              <InputWidget label="Name" placeholder="Mission name" />
              <SelectWidget label="Mode" options={[{ label: 'Nominal', value: 'nominal' }, { label: 'Analysis', value: 'analysis' }]} />
              <ButtonWidget label="Run" type="primary" />
            </StackLayout>
          </PanelWidget>
        )}
      />
    </StackLayout>
  )
};
function InteractiveCompositionDemo() {
  const [mode, setMode] = useState('nominal');
  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);

  return (
    <StackLayout gap={12}>
      <SelectWidget
        label="Mode"
        value={mode}
        options={[{ label: 'Nominal', value: 'nominal' }, { label: 'Analysis', value: 'analysis' }]}
        onValueChange={setMode}
      />
      <ButtonWidget
        label={running ? 'Running' : 'Run'}
        type="primary"
        disabled={running}
        onPress={() => {
          setRunning(true);
          setRunCount((current) => current + 1);
        }}
      />
      <MetricWidget label="Run count" value={runCount} />
      <ButtonWidget label="Reset" onPress={() => setRunning(false)} />
    </StackLayout>
  );
}

export const InteractiveActionBindingPrimitives: Story = {
  render: () => <InteractiveCompositionDemo />
};
