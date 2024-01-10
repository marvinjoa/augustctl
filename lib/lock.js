'use strict';

const debug = require('debug')('august:lock');
const crypto = require('crypto');
const util = require('util');

const LockSession = require('./lock_session');
const SecureLockSession = require('./secure_lock_session');

class Lock {
  static BLE_COMMAND_SERVICE = 'bd4ac6100b4511e38ffd0800200c9a66';

  constructor(peripheral, offlineKey, offlineKeyOffset) {
    if (!offlineKey) {
      throw new Error('offlineKey must be specified when creating lock');
    }
    if (!offlineKeyOffset) {
      throw new Error('offlineKeyOffset must be specified when creating lock');
    }

    this._peripheral = peripheral;
    this._offlineKey = Buffer.from(offlineKey, 'hex');
    this._offlineKeyOffset = offlineKeyOffset;

    debug('peripheral: ' + util.inspect(peripheral));
  }

  async connect() {
    const handshakeKeys = crypto.randomBytes(16);
    this._isSecure = false;

    await this._peripheral.connectAsync();
    debug('connected.');

    const [services, characteristics] = await this._peripheral.discoverSomeServicesAndCharacteristicsAsync([Lock.BLE_COMMAND_SERVICE], []);

    function characteristicByUuid(uuid) {
      const foundCharacteristic = characteristics.find(char => char.uuid === uuid);
      if (!foundCharacteristic) {
        throw new Error('could not find required characteristic with uuid: ' + uuid);
      }
      return foundCharacteristic;
    }

    // initialize the secure session
    this._secureSession = new SecureLockSession(
      this._peripheral,
      characteristicByUuid('bd4ac6130b4511e38ffd0800200c9a66'),
      characteristicByUuid('bd4ac6140b4511e38ffd0800200c9a66'),
      this._offlineKeyOffset
    );
    this._secureSession.setKey(this._offlineKey);

    // initialize the session
    this._session = new LockSession(
      this._peripheral,
      characteristicByUuid('bd4ac6110b4511e38ffd0800200c9a66'),
      characteristicByUuid('bd4ac6120b4511e38ffd0800200c9a66')
    );

    // start the sessions
    await Promise.all([
      this._secureSession.start(),
      this._session.start()
    ]);

    // send SEC_LOCK_TO_MOBILE_KEY_EXCHANGE
    const cmdExchange = this._secureSession.buildCommand(0x01);
    handshakeKeys.copy(cmdExchange, 0x04, 0x00, 0x08);
    const responseExchange = await this._secureSession.execute(cmdExchange);

    if (responseExchange[0] !== 0x02) {
      throw new Error('unexpected response to SEC_LOCK_TO_MOBILE_KEY_EXCHANGE: ' + responseExchange.toString('hex'));
    }

    // secure session established
    this._isSecure = true;

    // setup the session key
    const sessionKey = Buffer.alloc(16);
    handshakeKeys.copy(sessionKey, 0x00, 0x00, 0x08);
    responseExchange.copy(sessionKey, 0x08, 0x04, 0x0c);
    this._session.setKey(sessionKey);

    // rekey the secure session as well
    this._secureSession.setKey(sessionKey);

    // send SEC_INITIALIZATION_COMMAND
    const cmdInitialization = this._secureSession.buildCommand(0x03);
    handshakeKeys.copy(cmdInitialization, 0x04, 0x08, 0x10);
    const responseInitialization = await this._secureSession.execute(cmdInitialization);

    if (responseInitialization[0] !== 0x04) {
      throw new Error('unexpected response to SEC_INITIALIZATION_COMMAND: ' + responseInitialization.toString('hex'));
    }

    return true;
  }

  async forceLock() {
    debug('locking...');
    const cmd = this._session.buildCommand(0x0b);
    return this._session.execute(cmd);
  }

  async forceUnlock() {
    debug('unlocking...');
    const cmd = this._session.buildCommand(0x0a);
    return this._session.execute(cmd);
  }

  async status() {
    debug('status...');
    const cmd = Buffer.alloc(0x12);
    cmd.fill(0x00);
    cmd.writeUInt8(0xee, 0x00); // magic
    cmd.writeUInt8(0x02, 0x01);
    cmd.writeUInt8(0x02, 0x04);
    cmd.writeUInt8(0x02, 0x10);

    const response = await this._session.execute(cmd);

    const status = response.readUInt8(0x08);

    let strStatus = 'unknown';
    if (status === 0x03) strStatus = 'unlocked';
    else if (status === 0x05) strStatus = 'locked';

    return strStatus;
  }

  async disconnect() {
    debug('disconnecting...');

    const disconnect = async () => this._peripheral.disconnectAsync();

    if (this._isSecure) {
      const cmdDisconnect = this._secureSession.buildCommand(0x05);
      cmdDisconnect.writeUInt8(0x00, 0x11); // zero offline key for security terminate - not sure if necessary
      const responseDisconnect = await this._secureSession.execute(cmdDisconnect);

      if (responseDisconnect[0] !== 0x8b) {
        throw new Error('unexpected response to DISCONNECT: ' + responseDisconnect.toString('hex'));
      }

      return true;
    } else {
      return disconnect();
    }
  }
}

module.exports = Lock;
