'use strict';

const crypto = require('crypto');
const fs = require('fs');

const ZERO_BYTES = Buffer.alloc(16);
ZERO_BYTES.fill(0);

let cryptoKey, sessionKey, txCipherSec, rxCipherSec, txCipher, rxCipher;

function isSecurityChecksumValid(buf) {
  const cs = (0 - (buf.readUInt32LE(0x00) + buf.readUInt32LE(0x04) + buf.readUInt32LE(0x08))) >>> 0;
  return cs === buf.readUInt32LE(0x0c);
}

function isSimpleChecksumValid(buf) {
  let cs = 0;
  for (let i = 0; i < 0x12; i++) {
    cs = (cs + buf[i]) & 0xff;
  }
  return cs === 0;
}

const STATUS = {
  0: 'STM32_FIRMWARE',
  2: 'LOCK_STATE',
  3: 'CURRENT_ANGLE',
  5: 'BATTERY_LEVEL',
  9: 'LOCK_EVENTS_UNREAD',
  10: 'RTC',
  41: 'GIT_HASH'
};

const PARAMETERS = {
  // ... (unchanged)
};

// return a crude description of the command
function describe(command) {
  switch (command[0]) {
    // ... (unchanged)
  }
  return null;
}

function decode(frameNumber, opcode, handle, data) {
  const isSecure = (handle === 38 || handle === 41);
  const cipher = (opcode === 18) ? (isSecure ? txCipherSec : txCipher) : (isSecure ? rxCipherSec : rxCipher);

  const ct = data.slice(0x00, 0x10);
  const pt = cipher.update(ct);
  pt.copy(ct);

  const op = (opcode == 18 ? 'WRITE' : 'READ');
  if (isSecure) {
    if (!isSecurityChecksumValid(data)) {
      console.log(`Checksum mismatch for frame ${frameNumber}`);
    }
  } else {
    if (!isSimpleChecksumValid(data)) {
      console.log(`Checksum mismatch for frame ${frameNumber}`);
    }
  }

  console.log([frameNumber, op, data.toString('hex'), describe(data)].join('\t'));

  if (isSecure) {
    switch (data[0]) {
      case 0x01:
        sessionKey = Buffer.alloc(0x10);
        data.copy(sessionKey, 0x00, 0x04, 0x0c);
        break;
      case 0x02:
        data.copy(sessionKey, 0x08, 0x04, 0x0c);
        txCipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, ZERO_BYTES); txCipher.setAutoPadding(false);
        rxCipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, ZERO_BYTES); rxCipher.setAutoPadding(false);
        txCipherSec = crypto.createDecipheriv('aes-128-ecb', sessionKey, ''); txCipherSec.setAutoPadding(false);
        rxCipherSec = crypto.createDecipheriv('aes-128-ecb', sessionKey, ''); rxCipherSec.setAutoPadding(false);
        break;
    }
  }
}

function decodeLog(offlineKey, filename) {
  cryptoKey = Buffer.from(offlineKey, 'hex');
  txCipherSec = crypto.createDecipheriv('aes-128-ecb', cryptoKey, ''); txCipherSec.setAutoPadding(false);
  rxCipherSec = crypto.createDecipheriv('aes-128-ecb', cryptoKey, ''); rxCipherSec.setAutoPadding(false);

  const records = fs.readFileSync(filename, 'ascii').split(/\n/);
  records.forEach(function (record) {
    const fields = record.split(/\t/);
    if (fields.length === 4) {
      const buf = Buffer.from(fields[3].replace(/:/g, ''), 'hex');
      if (buf.length === 18) {
        decode(+fields[0], +fields[1], +fields[2], buf);
      }
    }
  });
}

const config = require(process.env.AUGUSTCTL_CONFIG || '../config.json');
decodeLog(config.offlineKey, process.argv[2]);
