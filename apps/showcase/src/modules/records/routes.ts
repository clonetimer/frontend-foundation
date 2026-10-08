import { defineModule } from '@foundation/app';

export const recordsModule = defineModule({
  id: 'records',
  featureFlag: 'records',
  routes: [
    {
      id: 'records.root',
      path: 'records',
      handle: {
        foundation: {
          title: 'Records',
          navigation: { label: 'Records', order: 20 },
          permission: 'records.read'
        }
      },
      children: [
        {
          id: 'records.list',
          index: true,
          lazy: async () => import('./pages/records-list.route'),
          handle: { foundation: { breadcrumb: false } }
        },
        {
          id: 'records.edit',
          path: ':id/edit',
          lazy: async () => import('./pages/record-edit.route'),
          handle: {
            foundation: {
              title: '编辑',
              permission: 'records.update'
            }
          }
        }
      ]
    }
  ]
});
