/* eslint-disable require-jsdoc */
const fs = require('fs-extra');
const MongoDB = require('mongodb');

const client = new MongoDB.MongoClient('mongodb://db', {useUnifiedTopology: true});

fs.ensureDirSync('./cache');
fs.ensureDirSync('./data');

start();

async function start() {
  await client.connect();
  const Vixen = require('./src/vixen');
  // return new WebUI(new Vixen(client.db('vixen')));
  // return new Vixen(client.db('vixen'), __dirname);
  new Vixen(client, __dirname);
}
