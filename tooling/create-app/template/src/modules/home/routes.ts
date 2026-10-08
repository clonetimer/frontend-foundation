import { defineModule } from '@foundation/app';

export const module = defineModule({
  id: 'home',
  routes: [
    {
      id: 'home.index',
      index: true,
      lazy: async () => import('./pages/home.route'),
      handle: {
        foundation: {
          title: '首页',
          navigation: { label: '首页', order: 0 }
        }
      }
    }
  ]
});

export const homeModule = module;
