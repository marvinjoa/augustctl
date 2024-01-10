#!/usr/bin/env node

'use strict';

const augustctl = require('./index');
const util = require('util');
const fs = require('fs').promises;

async function main() {
  const configPath = process.env.AUGUSTCTL_CONFIG || './config.json';
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

  const operation = process.argv[2];
  const lockPrototype = Object.getPrototypeOf(new augustctl.Lock());

  if (typeof lockPrototype[operation] !== 'function') {
    throw new Error('Invalid operation: ' + operation);
  }

  try {
    const peripheral = await augustctl.scan(config.lockUuid);
    const lock = new augustctl.Lock(
      peripheral,
      config.offlineKey,
      config.offlineKeyOffset
    );

    await lock.connect();
    await lock[operation]();
  } catch (e) {
    console.error(e.toString());
  } finally {
    process.exit(0);
  }
}

main();
