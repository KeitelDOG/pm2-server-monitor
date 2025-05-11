require('dotenv').config();
const killPort = require('kill-port');
const monitor = require('../lib/index');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

// Middlewares
const checkAuthentication = (req, res, next) => {
  const key = req.params.key;
  if (key !== process.env.ACCESS_KEY) {
    return res.status(403).send({ message: 'Forbidden Access' });
  }
  next();
};

// Keep order to avoid serving index.html statically
// 1- /
// 2- /index.html
// 3- express static on ../webUI
// 1-
app.get('/pm2', (req, res) => {
  res.status(200)
    .send({
      server: 'AVP PM2 Monitor Service',
      status: 'Success',
      endpoints: [
        '/pm2-monitor'
      ],
    });
});
// 2-
app.get('/pm2/index.html', (req, res) => {
  res.status(404).send('File not found');
});

app.get('/pm2/config.js', (req, res) => {
  try {
    let jsScript = fs.readFileSync('./webUI/pm2/config.js', { encoding: 'utf8' });
    jsScript = jsScript.replace('MONITOR_URL', process.env.MONITOR_URL);

    res.setHeader('content-type', 'text/javascript');
    res.status(200).send(jsScript);
  } catch(e) {
    console.log('error', e);
    return res.status(400).send({ error: e.message });
  }
});

// 3-
app.use(express.static(path.join(__dirname, '../webUI')));

// WEB ENDPOINTS --
app.get('/pm2/monitor/:key', checkAuthentication, (req, res) => {
  try {
    let textHTML = fs.readFileSync('./webUI/index.html', { encoding: 'utf8' });
    textHTML = textHTML.replace(/PM2 Server Monitor/gm, 'Avantaj Pam - PM2 Server Monitor');
    textHTML = textHTML.replace(/="\.\//gm, '="/pm2/');

    res.setHeader('content-type', 'text/html');
    res.status(200).send(textHTML);
  } catch(e) {
    console.log('error', e);
    return res.status(400).send({ error: e.message });
  }
});

const port = process.env.APP_PORT || 3620;
const startServer = async () => {
    // kill the Pm2 God process for websocket on MONITOR PORT (6500 default)
    try {
        await killPort(process.env.MONITOR_PORT || 6500);
    } catch (e) {
        console.log(e.message);
    }
    app.listen(port, function () {
        console.log(`AVP PM2 Monitor Service is listening to port ${port}`);
        const appNames = JSON.parse(process.env.APP_NAMES);
        monitor({
            projectName: 'AVP',
            appNames: appNames,
            monitorPort: process.env.MONITOR_PORT || 6500
        });
    });
}

startServer();
