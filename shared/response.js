'use strict';

/**
 * Sends a standardised success response. All successful API responses must
 * go through this function to guarantee a consistent envelope shape.
 *
 * @param {import('express').Response} res
 * @param {*} data
 * @param {string} [message='Success']
 * @param {number} [statusCode=200]
 */
function sendSuccess(res, data = null, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

/**
 * Sends a standardised error response for cases where an error is known at
 * the call site. For unhandled errors, use next(err) and let errorHandler
 * produce the response instead.
 *
 * @param {import('express').Response} res
 * @param {string} [message='An error occurred']
 * @param {number} [statusCode=500]
 * @param {*} [details=null]
 */
function sendError(res, message = 'An error occurred', statusCode = 500, details = null) {
  return res.status(statusCode).json({
    success: false,
    error: { message, ...(details && { details }) },
  });
}

/**
 * Sends a paginated success response. Computes derived pagination fields
 * (totalPages, hasNext, hasPrev) so route handlers do not duplicate this
 * arithmetic.
 *
 * @param {import('express').Response} res
 * @param {Array} items
 * @param {{ page: number, limit: number, total: number }} pagination
 * @param {string} [message='Success']
 */
function sendPaginated(res, items, pagination, message = 'Success') {
  const { page, limit, total } = pagination;
  return res.status(200).json({
    success: true,
    message,
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}

module.exports = { sendSuccess, sendError, sendPaginated };
