import { defineModule } from '@foundation/app';

export const capabilitiesModule = defineModule({
  id: 'capabilities',
  featureFlag: 'capabilities',
  routes: [
    {
      id: 'capabilities.root',
      path: 'capabilities',
      handle: {
        foundation: {
          title: 'Capabilities',
          navigation: { label: 'Capabilities', order: 30 }
        }
      },
      children: [
        {
          id: 'capabilities.file',
          path: 'file',
          lazy: async () => import('./pages/file.route'),
          handle: { foundation: { title: 'File', navigation: { label: 'File', order: 10 } } }
        },
        {
          id: 'capabilities.async',
          path: 'async',
          lazy: async () => import('./pages/async.route'),
          handle: { foundation: { title: 'Async', navigation: { label: 'Async', order: 20 } } }
        },
        {
          id: 'capabilities.visualization',
          path: 'visualization',
          lazy: async () => import('./pages/visualization.route'),
          handle: { foundation: { title: 'Visualization', navigation: { label: 'Visualization', order: 30 } } }
        }
      ]
    }
  ]
});
