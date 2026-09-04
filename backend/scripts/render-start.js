#!/usr/bin/env node
'use strict';

require('dotenv').config();

const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

let child = null;
let shuttingDown = false;

const startupServer = http.createServer((req, res) => {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json');

  res.end(JSON.stringify({
    success: false,
    status: 'starting',
  }));
});

function closeStartupServer() {
  return new Promise((resolve, reject) => {
    if (!startupServer.listening) {
      resolve();
      return;
    }

    startupServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const processHandle = spawn(
      command,
      args,
      {
        stdio: 'inherit',
        env: process.env,
      }
    );

    processHandle.once('error', reject);

    processHandle.once('exit', (code, signal) => {
      if (signal) {
        reject(
          new Error(
            `${command} terminated by ${signal}`
          )
        );
        return;
      }

      if (code !== 0) {
        reject(
          new Error(
            `${command} exited with code ${code}`
          )
        );
        return;
      }

      resolve();
    });
  });
}

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (child && !child.killed) {
    child.kill(signal);
  }

  try {
    await closeStartupServer();
  } finally {
    process.exit(0);
  }
}

async function main() {
  startupServer.listen(PORT, HOST, async () => {
    console.log(
      `Render startup listener bound to ${HOST}:${PORT}`
    );

    try {
      await runCommand(
        process.execPath,
        ['scripts/migrate.js']
      );

      console.log(
        'Database migrations completed successfully'
      );

      await closeStartupServer();

      child = spawn(
        process.execPath,
        ['server.js'],
        {
          stdio: 'inherit',
          env: process.env,
        }
      );

      child.once('error', (error) => {
        console.error(
          'Backend server failed to start:',
          error
        );

        process.exit(1);
      });

      child.once('exit', (code, signal) => {
        if (signal) {
          process.kill(process.pid, signal);
          return;
        }

        process.exit(code ?? 1);
      });
    } catch (error) {
      console.error(
        'Render startup failed:',
        error
      );

      await closeStartupServer();

      process.exit(1);
    }
  });

  startupServer.once('error', (error) => {
    console.error(
      'Unable to bind Render startup port:',
      error
    );

    process.exit(1);
  });
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

void main();
