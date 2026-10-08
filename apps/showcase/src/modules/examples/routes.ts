import { defineModule } from '@foundation/app';
export const examplesModule = defineModule({
  id: 'examples',
  featureFlag: 'examples',
  routes: [{
    id: 'examples.index', path: 'examples', lazy: async () => import('./pages/examples.route'),
    handle: { foundation: { title: 'Examples', navigation: { label: 'Examples', order: 10 }, permission: 'examples.read' } }
  }]
});
