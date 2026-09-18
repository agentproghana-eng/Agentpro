const request = require('supertest');
const app = require('../../server');

describe('AgentPro HTTP client compatibility contract', () => {
  test('discovery remains reachable for legacy clients', async () => {
    const response = await request(app)
      .get('/api/v1/compatibility');

    expect(response.status).toBe(200);

    expect(response.body.data).toMatchObject({
      api_contract_version: 1,
      minimum_supported_app_version: '2.0.0',
      recommended_app_version: '2.0.0',
      forced_upgrade_below_version: '2.0.0',
      minimum_supported_build_number: 1,
      recommended_build_number: 1,
      forced_upgrade_below_build_number: 1,
      status: 'LEGACY_SUPPORTED',
    });
  });

  test('current AgentPro build is supported', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .set('X-AgentPro-App-Version', '2.0.0')
      .set('X-AgentPro-App-Build', '1')
      .set('X-AgentPro-Platform', 'android')
      .set('X-AgentPro-API-Version', '1')
      .set(
        'X-AgentPro-Source-Commit',
        '0123456789abcdef0123456789abcdef01234567'
      );

    expect(response.status).toBe(404);

    expect(
      response.headers[
        'x-agentpro-compatibility-status'
      ]
    ).toBe('SUPPORTED');

    expect(
      response.headers[
        'x-agentpro-min-app-build'
      ]
    ).toBe('1');
  });

  test('unsupported API contract is blocked', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .set('X-AgentPro-App-Version', '2.0.0')
      .set('X-AgentPro-App-Build', '1')
      .set('X-AgentPro-Platform', 'android')
      .set('X-AgentPro-API-Version', '2');

    expect(response.status).toBe(426);

    expect(response.body).toMatchObject({
      success: false,
      code: 'API_INCOMPATIBLE',
    });
  });

  test('obsolete app version is blocked', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .set('X-AgentPro-App-Version', '1.9.9')
      .set('X-AgentPro-App-Build', '99')
      .set('X-AgentPro-Platform', 'android')
      .set('X-AgentPro-API-Version', '1');

    expect(response.status).toBe(426);

    expect(response.body).toMatchObject({
      success: false,
      code: 'UPDATE_REQUIRED',
      compatibility: {
        minimum_supported_build_number: 1,
        recommended_build_number: 1,
        forced_upgrade_below_build_number: 1,
      },
    });
  });

  test('malformed build metadata is rejected', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .set('X-AgentPro-App-Version', '2.0.0')
      .set('X-AgentPro-App-Build', '0')
      .set('X-AgentPro-Platform', 'android')
      .set('X-AgentPro-API-Version', '1');

    expect(response.status).toBe(400);

    expect(response.body).toMatchObject({
      success: false,
      code: 'CLIENT_METADATA_INVALID',
    });
  });

  test('discovery exposes exact APK provenance', async () => {
    const sourceCommit =
      '0123456789abcdef0123456789abcdef01234567';

    const response = await request(app)
      .get('/api/v1/compatibility')
      .set('X-AgentPro-App-Version', '2.0.0')
      .set('X-AgentPro-App-Build', '1')
      .set('X-AgentPro-Platform', 'android')
      .set('X-AgentPro-API-Version', '1')
      .set(
        'X-AgentPro-Source-Commit',
        sourceCommit,
      );

    expect(response.status).toBe(200);

    expect(
      response.body.data.client
    ).toMatchObject({
      app_version: '2.0.0',
      build_number: '1',
      platform: 'android',
      api_contract_version: 1,
      source_commit: sourceCommit,
    });
  });
});
