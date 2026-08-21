'use strict';

const fs = require('fs');
const path = require('path');

const read = (relativePath) =>
  fs.readFileSync(
    path.join(__dirname, '../..', relativePath),
    'utf8'
  );

describe('Multer upload security contracts', () => {
  const marketplace = read(
    'src/routes/marketplace.routes.js'
  );

  const personalCommunity = read(
    'src/routes/personalCommunity.routes.js'
  );

  const agentPost = read(
    'src/routes/agentPost.routes.js'
  );

  test('marketplace uploads remain memory-only and image restricted', () => {
    expect(marketplace).toContain(
      'storage: multer.memoryStorage()'
    );

    expect(marketplace).toContain(
      'limits: { fileSize: 5 * 1024 * 1024 }'
    );

    expect(marketplace).toContain(
      "file.mimetype.startsWith('image/')"
    );

    expect(marketplace).toContain(
      "upload.array('images', 3)"
    );
  });

  test('Personal Community voice notes remain memory-only and bounded', () => {
    expect(personalCommunity).toContain(
      'storage: multer.memoryStorage()'
    );

    expect(personalCommunity).toContain(
      'limits: { fileSize: 10 * 1024 * 1024 }'
    );

    expect(personalCommunity).toContain(
      "file.mimetype.startsWith('audio/')"
    );

    expect(personalCommunity).toContain(
      "upload.single('audio')"
    );
  });

  test('Agent Community voice notes remain memory-only and bounded', () => {
    expect(agentPost).toContain(
      'storage: multer.memoryStorage()'
    );

    expect(agentPost).toContain(
      'limits: { fileSize: 10 * 1024 * 1024 }'
    );

    expect(agentPost).toContain(
      'file.mimetype.startsWith("audio/")'
    );

    expect(agentPost).toContain(
      'upload.single("audio")'
    );
  });

  test('upload filters continue to reject unsupported media', () => {
    expect(marketplace).toContain(
      'Only image files are allowed'
    );

    expect(personalCommunity).toContain(
      'Only audio files are allowed'
    );

    expect(agentPost).toContain(
      'Only audio files are allowed'
    );
  });
});
