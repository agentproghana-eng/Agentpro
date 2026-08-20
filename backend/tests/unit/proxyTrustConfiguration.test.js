process.env.NODE_ENV = 'test';

const app =
  require('../../server');

describe(
  'trusted reverse proxy configuration',
  () => {
    test(
      'trusts only local and private proxy networks',
      () => {
        expect(
          app.get('trust proxy')
        ).toBe(
          'loopback, linklocal, uniquelocal'
        );

        const trust =
          app.get('trust proxy fn');

        expect(
          typeof trust
        ).toBe('function');

        expect(
          trust('127.0.0.1', 0)
        ).toBe(true);

        expect(
          trust('10.231.24.145', 0)
        ).toBe(true);

        expect(
          trust('172.16.10.20', 0)
        ).toBe(true);

        expect(
          trust('192.168.10.20', 0)
        ).toBe(true);

        expect(
          trust('169.254.20.30', 0)
        ).toBe(true);

        expect(
          trust('198.51.100.77', 0)
        ).toBe(false);

        expect(
          trust('203.0.113.88', 0)
        ).toBe(false);
      }
    );

    test(
      'does not use blanket or numeric proxy trust',
      () => {
        const setting =
          app.get('trust proxy');

        expect(setting)
          .not.toBe(true);

        expect(
          typeof setting
        ).not.toBe('number');
      }
    );
  }
);
