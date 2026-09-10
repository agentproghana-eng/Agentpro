const request = require('supertest');
const app = require('../../server');

describe('AgentPro HTTP client compatibility contract', () => {
  test('compatibility discovery remains reachable for legacy clients', async () => {
    const response = await request(app)
      .get('/api/v1/compatibility');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toMatchObject({
      api_contract_version: 1,
      minimum_supported_app_version: '2.0.0',
      recommended_app_version: '2.0.0',
      forced_upgrade_below_version: '2.0.0',
      status: 'LEGACY_SUPPORTED',
    });

    expect(
      response.headers['x-agentpro-compatibility-status']
    ).toBe('LEGACY_SUPPORTED');
  });

  test('legacy clients without compatibility headers continue through the API', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent');

    expect(response.status).toBe(404);
    expect(
      response.headers['x-agentpro-compatibility-status']
    ).toBe('LEGACY_SUPPORTED');
  });

  test('current AgentPro 2.0.0 client is supported', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .set('X-AgentPro-App-Version', '2.0.0')
      .set('X-AgentPro-App-Build', '1')
      .set('X-AgentPro-Platform', 'android')
      .set('X-AgentPro-API-Version', '1');

    // Compatibility succeeds and the request reaches the normal API 404.
    expect(response.status).toBe(404);
    expect(
      response.headers['x-agentpro-compatibility-status']
    ).toBe('SUPPORTED');
  });

  test('unsupported API contracts are blocked before route handling', async () => {
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

    expect(
      response.headers['x-agentpro-compatibility-status']
    ).toBe('API_INCOMPATIBLE');
  });

  test('explicit obsolete app versions are blocked with upgrade required', async () => {
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
        api_contract_version: 1,
        minimum_supported_app_version: '2.0.0',
        recommended_app_version: '2.0.0',
        forced_upgrade_below_version: '2.0.0',
      },
    });
  });

  test('incomplete explicit compatibility metadata fails deterministically', async () => {
    const response = await request(app)
      .get('/api/v1/nonexistent')
      .set('X-AgentPro-App-Version', '2.0.0');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      code: 'CLIENT_METADATA_INVALID',
    });
  });

  test('compatibility discovery explains an incompatible client without blocking it', async () => {
    const response = await request(app)
      .get('/api/v1/compatibility')
      .set('X-AgentPro-App-Version', '2.0.0')
      .set('X-AgentPro-App-Build', '1')
      .set('X-AgentPro-Platform', 'android')
      .set('X-AgentPro-API-Version', '2');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe('API_INCOMPATIBLE');
    expect(response.body.data.client).toMatchObject({
      app_version: '2.0.0',
      build_number: '1',
      platform: 'android',
      api_contract_version: 2,
    });
  });
});
