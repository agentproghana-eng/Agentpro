'use strict';

const fs = require('fs');
const path = require('path');

const read = relativePath =>
  fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8',
  );

describe(
  'server-driven transaction form activation control',
  () => {
    const adminRoutes = read(
      'src/routes/admin.routes.js',
    );

    test(
      'Admin-created flows are server-enforced inactive drafts',
      () => {
        const start =
          adminRoutes.indexOf(
            "router.post('/ussd-flows'",
          );

        const end =
          adminRoutes.indexOf(
            "router.patch('/ussd-flows/:id'",
            start,
          );

        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);

        const createRoute =
          adminRoutes.slice(start, end);

        expect(createRoute).toContain(
          'form_schema,',
        );

        expect(createRoute).toContain(
          'is_active,',
        );

        expect(createRoute).toContain(
          '$9, FALSE, $10',
        );

        // A caller cannot turn creation into activation by
        // supplying is_active=true in its request body.
        expect(createRoute).not.toMatch(
          /const\s*\{[\s\S]*?\bis_active\b[\s\S]*?\}\s*=\s*req\.body/,
        );
      },
    );

    test(
      'creation audit records draft state and schema definition',
      () => {
        const start =
          adminRoutes.indexOf(
            "router.post('/ussd-flows'",
          );

        const end =
          adminRoutes.indexOf(
            "router.patch('/ussd-flows/:id'",
            start,
          );

        const createRoute =
          adminRoutes.slice(start, end);

        expect(createRoute).toContain(
          "action: 'USSD_FLOW_CREATED'",
        );

        expect(createRoute).toContain(
          'form_schema: form_schema ?? []',
        );

        expect(createRoute).toContain(
          'is_active: false',
        );
      },
    );

    test(
      'schema-definition updates are represented in audit metadata',
      () => {
        const start =
          adminRoutes.indexOf(
            "router.patch('/ussd-flows/:id'",
          );

        const updateRoute =
          adminRoutes.slice(start);

        expect(updateRoute).toContain(
          "action: 'USSD_FLOW_UPDATED'",
        );

        expect(updateRoute).toContain(
          '...(hasFormSchema',
        );

        expect(updateRoute).toContain(
          '? { form_schema: form_schema ?? [] }',
        );
      },
    );
  },
);
