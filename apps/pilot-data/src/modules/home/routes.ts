import { defineModule } from '@foundation/app';

export const homeModule = defineModule({
  id: 'data-workbench',
  routes: [
    {
      id: 'data-workbench.index',
      index: true,
      lazy: async () => import('./pages/home.route'),
      handle: { foundation: { title: '数据工作台 Pilot', navigation: { label: '数据工作台 Pilot', order: 0 } } }
    }
  ]
});
