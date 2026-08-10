'use strict';

module.exports = {
  connectDB: require('./db').connectDB,
  closeDB: require('./db').closeDB,
  logger: require('./logger'),
  errorHandler: require('./errorHandler').errorHandler,
  notFoundHandler: require('./errorHandler').notFoundHandler,
  sendSuccess: require('./response').sendSuccess,
  sendError: require('./response').sendError,
  sendPaginated: require('./response').sendPaginated,
};
