import { defineModule } from '@foundation/app';
export const homeModule = defineModule({
  id: 'home',
  routes: [{ id: 'home.index', index: true, lazy: async () => import('./pages/home.route'), handle: { foundation: { title: '基础', navigation: { label: '基础', order: 0 } } } }]
});
