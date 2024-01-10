'use strict';

const crypto = require('crypto');
const fs = require('fs');

// Extract the encoded, encrypted data
const prefs = fs.readFileSync(process.argv[2] || 'LockSettingsPreferences.xml', 'utf8');
const hexEncoded = /[0-9A-F]+(?=\<\/string\>)/.exec(prefs)[0];
const cipherText = Buffer.from(hexEncoded, 'hex');

// Decrypt
const key = Buffer.from('August#@3417r\0\0\0', 'utf8');
const cipher = crypto.createDecipheriv('aes-128-ecb', key, '');
cipher.setAutoPadding(false);
const plaintext = cipher.update(cipherText, 'hex', 'utf8') + cipher.final('utf8');

// Remove trailing nulls
const trimmedPlaintext = plaintext.replace(/\0+$/, '');

process.stdout.write(trimmedPlaintext);
