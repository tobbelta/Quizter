/**
 * CORS configuration for Cloud Functions
 */
const cors = require("cors");

const corsOptions = {
  origin: [
    "https://routequest.se",
    "https://www.routequest.se",
    "http://localhost:3000",
    "http://localhost:5000",
  ],
  credentials: true,
};

const corsMiddleware = cors(corsOptions);

module.exports = {
  corsOptions,
  corsMiddleware,
};
