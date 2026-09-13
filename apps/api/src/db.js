const dns = require("dns");
const mongoose = require("mongoose");
const { config } = require("./config");

async function connectDb() {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  await mongoose.connect(config.mongoUri, {
    dbName: config.mongoDbName,
  });
}

async function disconnectDb() {
  await mongoose.disconnect();
}

const db = mongoose.connection;

async function createIndexes() {
  const models = Object.values(mongoose.models);
  await Promise.all(models.map((m) => m.init()));
}

module.exports = { connectDb, disconnectDb, db, createIndexes };