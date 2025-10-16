/**
 * HTTP middleware utilities for Cloud Functions
 */
const {onRequest} = require("firebase-functions/v2/https");
const {runtimeDefaults} = require("../config/runtime");

/**
 * Creates an HTTPS handler with default runtime options
 * @param {Function} handler - The request handler function
 * @return {Function} Configured Cloud Function
 */
const createHttpsHandler = (handler) =>
  onRequest(runtimeDefaults, handler);

/**
 * Ensures the HTTP request method is POST
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @return {boolean} True if method is POST, false otherwise
 */
const ensurePost = (req, res) => {
  if (req.method !== "POST") {
    res.set("Allow", "POST");
    res.status(405).json({error: "Method Not Allowed"});
    return false;
  }
  return true;
};

module.exports = {
  createHttpsHandler,
  ensurePost,
};
