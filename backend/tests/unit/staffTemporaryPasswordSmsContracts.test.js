const fs = require('fs');
const path = require('path');

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { logger } = require('../../src/utils/logger');
const {
  sendNewEmployeeSMS,
} = require('../../src/services/smsService');

const controllerSource = fs.readFileSync(
  path.join(__dirname, '../../src/controllers/userController.js'),
  'utf8',
);

const envExample = fs.readFileSync(
  path.join(__dirname, '../../.env.example'),
  'utf8',
);

describe('Staff temporary-password SMS contracts', () => {
  const originalApiKey = process.env.ARKESEL_API_KEY;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ARKESEL_API_KEY = 'test-arkesel-key';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.ARKESEL_API_KEY;
    } else {
      process.env.ARKESEL_API_KEY = originalApiKey;
    }

    global.fetch = originalFetch;
  });

  test('new staff and reactivated staff pass the same ephemeral temporary password to SMS', () => {
    const calls = controllerSource.match(
      /sendNewEmployeeSMS\(\s*phone,\s*first_name,\s*role,\s*companyName,\s*tempPassword\s*\)/g,
    ) || [];

    expect(calls).toHaveLength(2);

    expect(controllerSource).not.toContain(
      'This is NEVER returned in the API response and is only ever sent via email.',
    );

    expect(controllerSource).not.toContain(
      'Email the temporary password - this is the only place it is ever transmitted',
    );

    expect(controllerSource).toContain(
      'Temporary login details were sent to ${user.email} and the staff phone by SMS.',
    );
  });

  test('new-employee SMS sends the temporary password to the intended staff phone', async () => {
    const tempPassword = 'SecureTemp9X';

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: 'success',
        data: { id: 'sms-test-1' },
      }),
    });

    await sendNewEmployeeSMS(
      '0244123456',
      'Ama',
      'agent',
      'Example Company',
      tempPassword,
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [, request] = global.fetch.mock.calls[0];
    const payload = JSON.parse(request.body);

    expect(payload.recipients).toEqual(['+233244123456']);
    expect(payload.message).toContain(tempPassword);
    expect(payload.message.toLowerCase()).toContain('temporary password');
  });

  test('SMS provider failures never place temporary-password content in logs', async () => {
    const tempPassword = 'NeverLogMe9X';

    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        status: 'error',
        message: `Provider rejected message containing ${tempPassword}`,
      }),
    });

    await expect(
      sendNewEmployeeSMS(
        '0244123456',
        'Ama',
        'agent',
        'Example Company',
        tempPassword,
      ),
    ).rejects.toThrow();

    const logged = logger.error.mock.calls
      .flat()
      .map((value) => {
        if (value instanceof Error) {
          return `${value.name}: ${value.message}`;
        }
        return String(value);
      })
      .join(' ');

    expect(logged).not.toContain(tempPassword);
  });

  test('SMS reports an explicit skipped result when Arkesel is not configured', async () => {
    delete process.env.ARKESEL_API_KEY;

    const result = await sendNewEmployeeSMS(
      '0244123456',
      'Ama',
      'agent',
      'Example Company',
      'SecureTemp9X',
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ skipped: true });
  });

  test('create-staff delivery status only marks channels that actually delivered', () => {
    expect(controllerSource).toContain(
      'emailSent = emailResult?.skipped !== true',
    );

    expect(controllerSource).toContain(
      'smsSent = smsResult?.skipped !== true',
    );

    expect(controllerSource).not.toContain(
      'let emailSent = true;',
    );

    expect(controllerSource).not.toContain(
      'smsSent = true;',
    );
  });

  test('Arkesel SMS configuration is documented for deployment', () => {
    expect(envExample).toMatch(/^ARKESEL_API_KEY=/m);
  });
});
