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
          title: '能力',
          navigation: { label: '能力', order: 30 }
        }
      },
      children: [
        {
          id: 'capabilities.file',
          path: 'file',
          lazy: async () => import('./pages/file.route'),
          handle: { foundation: { title: '文件', navigation: { label: '文件', order: 10 } } }
        },
        {
          id: 'capabilities.async',
          path: 'async',
          lazy: async () => import('./pages/async.route'),
          handle: { foundation: { title: '异步任务', navigation: { label: '异步任务', order: 20 } } }
        },
        {
          id: 'capabilities.visualization',
          path: 'visualization',
          lazy: async () => import('./pages/visualization.route'),
          handle: { foundation: { title: '可视化', navigation: { label: '可视化', order: 30 } } }
        }
      ]
    }
  ]
});
