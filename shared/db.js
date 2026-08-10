'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');

let isConnected = false;

/**
 * Connects to MongoDB. Safe to call multiple times — reuses the existing
 * connection if one is already open. Throws on connection failure so the
 * calling service can decide whether to crash or retry.
 */
async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI environment variable is not set.');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

  isConnected = true;
  logger.info('MongoDB connected.');

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('MongoDB disconnected.');
  });

  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error.');
  });
}

/**
 * Gracefully closes the MongoDB connection. Intended for use in shutdown
 * handlers to allow in-flight operations to complete before the process exits.
 */
async function closeDB() {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
  logger.info('MongoDB connection closed.');
}

module.exports = { connectDB, closeDB };
