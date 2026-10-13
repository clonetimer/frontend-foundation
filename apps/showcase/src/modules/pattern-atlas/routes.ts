import { defineModule } from '@foundation/app';

/** An opt-in Showcase experience. No changes to Blueprint, Designer, or Foundation Kernel. */
export const patternAtlasModule = defineModule({
  id: 'pattern-atlas',
  routes: [{
    id: 'pattern-atlas.create',
    path: 'create',
    lazy: async () => import('./builder/pages/create.route'),
    handle: { foundation: { title: '创建项目页面', navigation: { label: '创建页面', order: 1 } } }
  }, {
    id: 'pattern-atlas.studio',
    path: 'studio',
    lazy: async () => import('./studio/pages.route'),
    handle: { foundation: { title: '页面设计', navigation: { label: '拖拽设计', order: 2 } } }
  }, {
    id: 'pattern-atlas.designer-redirect',
    path: 'designer',
    lazy: async () => import('./builder/pages/designer.route'),
    handle: { foundation: { title: '页面设计' } }
  }, {
    id: 'pattern-atlas.index',
    path: 'patterns',
    lazy: async () => import('./pages/pattern-atlas.route'),
    handle: {
      foundation: {
        title: '交互形式图鉴',
        navigation: { label: '布局图鉴', order: 5 }
      }
    }
  }, {
    id: 'pattern-atlas.effects',
    path: 'patterns/effects',
    lazy: async () => import('./effects/pages/effects.route'),
    handle: {
      foundation: {
        title: '视觉特效实验室',
        navigation: { label: '特效', order: 6 }
      }
    }
  }, {
    id: 'pattern-atlas.config',
    path: 'patterns/config',
    lazy: async () => import('./center/pages/config.route'),
    handle: {
      foundation: {
        title: '可视化配置中心',
        navigation: { label: '配置', order: 7 }
      }
    }
  }]
});
