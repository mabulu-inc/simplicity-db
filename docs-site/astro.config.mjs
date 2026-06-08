// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://mabulu-inc.github.io',
  base: '/simplicity-db',
  integrations: [
    starlight({
      title: '@smplcty/db',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/mabulu-inc/simplicity-db',
        },
      ],
      sidebar: [
        {
          label: 'Getting started',
          items: [
            { label: 'Introduction', slug: 'getting-started/introduction' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Quick start', slug: 'getting-started/quick-start' },
          ],
        },
        {
          label: 'Connecting',
          items: [
            { label: 'connect', slug: 'connecting/connect' },
            { label: 'resolveDatabaseUrl', slug: 'connecting/resolve-database-url' },
          ],
        },
        {
          label: 'Queries',
          items: [
            { label: 'withClient', slug: 'queries/with-client' },
            { label: 'withTransaction', slug: 'queries/with-transaction' },
          ],
        },
        {
          label: 'Mutations',
          items: [
            { label: 'updateMutation', slug: 'mutations/update-mutation' },
            { label: 'upsertMutation', slug: 'mutations/upsert-mutation' },
          ],
        },
        {
          label: 'Errors',
          items: [
            { label: 'friendlyError', slug: 'errors/friendly-error' },
            { label: 'classifyPgError', slug: 'errors/classify-pg-error' },
          ],
        },
      ],
    }),
  ],
});
