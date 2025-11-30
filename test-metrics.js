const axios = require("axios");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function runTests() {
  const endpoints = [
    "/api/delivery/checkHealth",
    "/api/device/checkHealth",
    "/api/offering/checkHealth",
    "/api/map/checkHealth",
  ];

  const results = [];
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`${BASE_URL}${endpoint}`);
      results.push({
        endpoint,
        status: "success",
        value: response.status === 200 ? 1 : 0,
      });
    } catch (error) {
      results.push({
        endpoint,
        status: "failure",
        value: 0,
      });
    }
  }
-
  console.log(JSON.stringify(results, null, 2));
}

runTests();
