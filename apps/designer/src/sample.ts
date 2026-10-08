import type { ProjectBlueprint } from './types';

export const sampleBlueprint: ProjectBlueprint = {
  schemaVersion: 1,
  project: { id: 'designer.demo', packageName: 'designer-demo', title: 'Visual Designer Demo' },
  foundation: { version: '0.21.0', profile: 'management', shell: 'workspace', router: 'browser', deployment: 'none', contract: 'none' },
  navigation: { items: [{ target: 'overview', label: 'Overview', order: 0 }] },
  pages: [{
    id: 'overview', title: 'Overview', pattern: 'dashboard', index: true,
    composition: {
      id: 'overviewRoot', kind: 'layout', type: 'stack', props: { gap: 16 }, children: [
        { id: 'title', kind: 'widget', type: 'text', props: { text: 'Mission Control', variant: 'title' } },
        { id: 'metrics', kind: 'layout', type: 'grid', props: { columns: 3, gap: 12 }, children: [
          { id: 'status', kind: 'widget', type: 'metric', props: { label: 'Status', value: 'Nominal' }, bindings: { value: { state: 'statusText' } } },
          { id: 'runs', kind: 'widget', type: 'metric', props: { label: 'Runs', value: 0 }, bindings: { value: { state: 'runCount' } } },
          { id: 'modeMetric', kind: 'widget', type: 'metric', props: { label: 'Mode', value: 'nominal' }, bindings: { value: { state: 'missionMode' } } }
        ] },
        { id: 'workspace', kind: 'layout', type: 'split', props: { secondarySize: 320, gap: 16 }, children: [
          { id: 'missionView', kind: 'widget', type: 'placeholder', props: { title: 'Mission view', description: 'Drop a project-specific viewer here.' } },
          { id: 'controls', kind: 'widget', type: 'panel', props: { title: 'Controls' }, children: [
            { id: 'mode', kind: 'widget', type: 'select', props: { label: 'Mode', options: [{ label: 'Nominal', value: 'nominal' }, { label: 'Analysis', value: 'analysis' }] }, bindings: { value: { state: 'missionMode' } }, events: { change: ['updateMode'] } },
            { id: 'run', kind: 'widget', type: 'button', props: { label: 'Run', type: 'primary' }, events: { press: ['runMission'] } }
          ] }
        ] }
      ]
    },
    state: [
      { id: 'missionMode', type: 'string', initial: 'nominal' },
      { id: 'statusText', type: 'string', initial: 'Idle' },
      { id: 'runCount', type: 'number', initial: 0 }
    ],
    actions: [
      { id: 'updateMode', steps: [{ type: 'set', state: 'missionMode', value: { event: 'value' } }] },
      { id: 'runMission', steps: [{ type: 'set', state: 'statusText', value: 'Running' }, { type: 'increment', state: 'runCount' }] }
    ],
    dataSources: [], operations: []
  }]
};
