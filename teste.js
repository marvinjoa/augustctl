'use strict';

const noble = require('@abandonware/noble');

const startScanning = (uuids) => {
  return new Promise((resolve, reject) => {
    noble.startScanning(uuids, false, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

const stopScanning = () => {
  return new Promise((resolve, reject) => {
    noble.stopScanning((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
};

const discoverHandler = (peripheral) => {
  console.log('Found device with local name: ' + peripheral.advertisement.localName);
  console.log('Advertising the following service uuid\'s: ' + peripheral.advertisement.serviceUuids);
  console.log();
};

const stateChangeHandler = (state) => {
  if (state === 'poweredOn') {
    console.log('ok');
    const uuid = [];
    startScanning(uuid)
      .then(() => {
        // scanning started
      })
      .catch((error) => {
        console.error('Error starting scanning:', error);
        stopScanning(); // stop scanning on error
      });
  } else {
    stopScanning()
      .then(() => {
        console.log('nok');
      })
      .catch((error) => {
        console.error('Error stopping scanning:', error);
      });
  }
};

noble.on('stateChange', stateChangeHandler);
noble.on('discover', discoverHandler);
