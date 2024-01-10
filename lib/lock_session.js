'use strict';

const debug = require('debug')('august:lock_session');
var Promise = require('util').promisify;
const crypto = require('crypto');
const events = require('events');
const util = require('util');

class LockSession extends events.EventEmitter {
  constructor(peripheral, writeCharacteristic, readCharacteristic) {
    super();
    this._peripheral = peripheral;
    this._writeCharacteristic = writeCharacteristic;
    this._readCharacteristic = readCharacteristic;
  }

  static _cipherSuite = 'aes-128-cbc';
  static _iv = Buffer.alloc(16, 0);

  setKey(key) {
    this._encryptCipher = crypto.createCipheriv(LockSession._cipherSuite, key, LockSession._iv);
    this._encryptCipher.setAutoPadding(false);
    this._decryptCipher = crypto.createDecipheriv(LockSession._cipherSuite, key, LockSession._iv);
    this._decryptCipher.setAutoPadding(false);
  }

  start() {
    this._readCharacteristic.on('read', (data) => {
      debug('read data: ' + data.toString('hex'));

      if (this._decryptCipher) {
        const cipherText = data.slice(0x00, 0x10);
        const plainText = this._decryptCipher.update(cipherText);
        plainText.copy(cipherText);

        debug('decrypted data: ' + data.toString('hex'));
      }

      this.emit('notification', data);
    });

    debug('enabling indications on ' + this._readCharacteristic);
    return this._readCharacteristic.notifyAsync(true);
  }

  buildCommand(opcode) {
    const cmd = Buffer.alloc(0x12);
    cmd.fill(0);
    cmd.writeUInt8(0xee, 0x00); // magic
    cmd.writeUInt8(opcode, 0x01);
    cmd.writeUInt8(0x02, 0x10); // unknown?
    return cmd;
  }

  static simpleChecksum(buf) {
    let cs = 0;
    for (let i = 0; i < 0x12; i++) {
      cs = (cs + buf[i]) & 0xff;
    }
    return (-cs) & 0xff;
  }

  _writeChecksum(command) {
    const checksum = LockSession.simpleChecksum(command);
    command.writeUInt8(checksum, 0x03);
  }

  _validateResponse(response) {
    if (LockSession.simpleChecksum(response) !== 0) {
      throw new Error('simple checksum mismatch');
    }
    if (response[0] !== 0xbb && response[0] !== 0xaa) {
      throw new Error('unexpected magic in response');
    }
  }

  _write(command) {
    if (this._encryptCipher) {
      const plainText = command.slice(0x00, 0x10);
      const cipherText = this._encryptCipher.update(plainText);
      cipherText.copy(plainText);
      debug('write (encrypted): ' + command.toString('hex'));
    }

    return this._writeCharacteristic.writeAsync(command, false);
  }

  execute(command) {
    this._writeChecksum(command);

    debug('execute command: ' + command.toString('hex'));

    const waitForNotification = new Promise((resolve) => {
      this.once('notification', resolve);
    });

    return this._write(command)
      .then(() => {
        debug('write successful, waiting for notification...');
        return waitForNotification;
      })
      .then((data) => {
        this._validateResponse(data);
        return data;
      });
  }
}

module.exports = LockSession;
