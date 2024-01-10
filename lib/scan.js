'use strict';

const noble = require('@abandonware/noble');
const Lock = require('./lock');

let firstRun = true;

function scan(uuid) {
  if (firstRun) {
    firstRun = false;

    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        noble.startScanning([Lock.BLE_COMMAND_SERVICE]);
      } else {
        noble.stopScanning();
      }
    });
  }

  return new Promise((resolve) => {
    noble.on('discover', (peripheral) => {
      if (uuid === undefined || peripheral.uuid === uuid) {
        noble.stopScanning();
        resolve(peripheral);
      }
    });
  });
}

module.exports = scan;
