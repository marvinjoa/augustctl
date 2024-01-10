'use strict';

const augustctl = require('./index');
const express = require('express');
const morgan = require('morgan');
const config = require(process.env.AUGUSTCTL_CONFIG || './config.json');
const DEBUG = process.env.NODE_ENV !== 'production';
const address = config.address || 'localhost';
const port = config.port || 3000;

const app = express();
app.use(morgan(DEBUG ? 'dev' : 'combined'));

const ret = { 'status': -1, 'ret': '', 'msg': '' };

app.get('/api/unlock', async (req, res) => {
  try {
    const lock = app.get('lock');

    if (!lock) {
      res.sendStatus(503);
      return;
    }

    await lock.connect();
    const data = await lock.status();

    if (data === 'locked') {
      const response = await lock.forceUnlock();
      ret['msg'] = 'Command completed. Disconnected.';
      ret['status'] = 0;
      ret['ret'] = 'unlocked';
      res.json(ret);
      await lock.disconnect();
    } else {
      ret['status'] = 1;
      ret['msg'] = 'Lock is already locked';
      res.json(ret);
      await lock.disconnect();
    }
  } catch (e) {
    console.error(e.toString());
    res.sendStatus(500);
  }
});

app.get('/api/lock', async (req, res) => {
  try {
    const lock = app.get('lock');

    if (!lock) {
      res.sendStatus(503);
      return;
    }

    await lock.connect();
    const data = await lock.status();

    if (data === 'unlocked') {
      const response = await lock.forceLock();
      ret['msg'] = 'Command completed. Disconnected.';
      ret['status'] = 0;
      ret['ret'] = 'locked';
      res.json(ret);
      await lock.disconnect();
    } else {
      ret['status'] = 1;
      ret['msg'] = 'Lock is already locked';
      res.json(ret);
      await lock.disconnect();
    }
  } catch (e) {
    console.error(e.toString());
    res.sendStatus(500);
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const lock = app.get('lock');
    if (!lock) {
      res.sendStatus(503);
      return;
    }

    await lock.connect();
    const data = await lock.status();

    ret['msg'] = 'Command completed. Disconnected.';
    ret['status'] = 0;
    ret['ret'] = data;

    res.json(ret);

    await lock.disconnect();
  } catch (e) {
    console.error(e.toString());
    res.sendStatus(500);
  }
});

augustctl.scan(config.lockUuid)
  .then(peripheral => {
    const lock = new augustctl.Lock(
      peripheral,
      config.offlineKey,
      config.offlineKeyOffset
    );
    app.set('lock', lock);
  })
  .catch(err => {
    console.error(err.toString());
    process.exit(1);
  });

const server = app.listen(port, address, () => {
  console.log('Listening at %j', server.address());
});
