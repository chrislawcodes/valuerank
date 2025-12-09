/**
 * SystemSetting GraphQL Type
 *
 * Key-value store for system-wide configuration.
 */

import { builder } from '../builder.js';
import { SystemSettingRef } from './refs.js';

SystemSettingRef.implement({
  description: 'A system-wide configuration setting',
  fields: (t) => ({
    id: t.exposeID('id'),
    key: t.exposeString('key', {
      description: 'Setting key (unique identifier)',
    }),
    value: t.field({
      type: 'JSON',
      description: 'Setting value (JSON)',
      resolve: (setting) => setting.value,
    }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});
