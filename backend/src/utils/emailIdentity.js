'use strict';

function normalizeAccountEmail(value) {
  const email = String(value || '')
    .trim()
    .toLowerCase();

  const at = email.lastIndexOf('@');

  if (at <= 0 || at === email.length - 1) {
    return email;
  }

  let local = email.slice(0, at);
  let domain = email.slice(at + 1);

  if (domain === 'googlemail.com') {
    domain = 'gmail.com';
  }

  if (domain === 'gmail.com') {
    local = local
      .split('+', 1)[0]
      .replace(/\./g, '');
  }

  return `${local}@${domain}`;
}

module.exports = {
  normalizeAccountEmail,
};
