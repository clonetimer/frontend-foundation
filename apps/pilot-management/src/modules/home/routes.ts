import { defineModule } from '@foundation/app';

export const homeModule = defineModule({
  id: 'management',
  routes: [
    {
      id: 'management.index',
      index: true,
      lazy: async () => import('./pages/home.route'),
      handle: {
        foundation: {
          title: '管理型 Pilot',
          navigation: { label: '管理型 Pilot', order: 0 },
          permission: 'pilot.management.read'
        }
      }
    }
  ]
});
