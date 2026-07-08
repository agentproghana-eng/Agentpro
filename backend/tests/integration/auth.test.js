const request = require('supertest');
const app = require('../../server');

// ─── Auth Integration Tests ───────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  it('returns 422 for missing email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ password: 'Password123' });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.some(e => e.field === 'email')).toBe(true);
  });

  it('returns 422 for missing password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@test.com' });
    expect(res.status).toBe(422);
  });

  it('returns 422 for invalid email format', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: 'Password123' });
    expect(res.status).toBe(422);
  });

  it('returns 401 for wrong credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nonexistent@test.com', password: 'WrongPass123' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/auth/register', () => {
  it('returns 422 for missing company name', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        phone: '0241234567',
        password: 'Password123'
      });
    expect(res.status).toBe(422);
  });

  it('returns 422 for weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        company_name: 'Test Co',
        first_name: 'John',
        last_name: 'Doe',
        email: 'john@test.com',
        phone: '0241234567',
        password: 'weak'  // Too short, no uppercase, no number
      });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('returns 422 when refresh_token missing', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});
    expect(res.status).toBe(422);
  });

  it('returns 401 for invalid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'invalid.token.here' });
    expect(res.status).toBe(401);
  });
});

// ─── Protected Route Tests ────────────────────────────────────

describe('Protected Routes', () => {
  it('returns 401 for /transactions without token', async () => {
    const res = await request(app).get('/api/v1/transactions');
    expect(res.status).toBe(401);
  });

  it('returns 401 for /float/overview without token', async () => {
    const res = await request(app).get('/api/v1/float/overview');
    expect(res.status).toBe(401);
  });

  it('returns 401 for /reports/dashboard without token', async () => {
    const res = await request(app).get('/api/v1/reports/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns 401 for /ai/chat without token', async () => {
    const res = await request(app)
      .post('/api/v1/ai/chat')
      .send({ message: 'Hello' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for /admin/overview without token', async () => {
    const res = await request(app).get('/api/v1/admin/overview');
    expect(res.status).toBe(401);
  });

  it('returns 401 for tampered JWT', async () => {
    const res = await request(app)
      .get('/api/v1/transactions')
      .set('Authorization', 'Bearer tampered.jwt.token');
    expect(res.status).toBe(401);
  });
});

// ─── Health Check ─────────────────────────────────────────────

// ─── Health Check ─────────────────────────────────────────────

describe('GET /health', () => {
  it('returns health status', async () => {
    const res = await request(app).get('/health');

    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('app');
    expect(res.body).toHaveProperty('services');
  });
});

// ─── 404 Handling ─────────────────────────────────────────────

describe('404 Handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
