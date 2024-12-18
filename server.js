const express = require("express");
const cron = require("node-cron");
const { execSync } = require("child_process");
const client = require("prom-client");
const path = require('path');
const fs = require('fs');

const app = express();
const register = client.register;

// Prometheus metrics
const testMetrics = new client.Gauge({
  name: "test_script_results",
  help: "Results from the test script",
  labelNames: ["endpoint", "status"],
});

let lastRunTime = "";

function runTestScript() {
  try {
    // Run the test script
    console.log("Running test script...");
    const output = execSync("./k6 run ./test-k6.js", { encoding: "utf8" });

    const results = readAndDeleteJsonFile('./k6-results.json')
    // Parse JSON output from the test script and update Prometheus metrics

    for (const result of results) {
      const { name, path, success } = result;
      console.log({ name, path, success })
      testMetrics.set({ endpoint: name, status: +success }, +success);
    }

    lastRunTime = new Date().toISOString();
    console.log("Test script run completed.");
  } catch (error) {
    console.error("Error running test script:", error.message);
  }
}

// Schedule the test script to run every 5 minutes
cron.schedule(process.env["CRON_SCHEDULE"] || "*/5 * * * *", runTestScript);

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", lastRunTime });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});



function readAndDeleteJsonFile(filePath) {
  // Ensure the file has a .json extension
  if (path.extname(filePath) !== '.json') {
      throw new Error('The specified file is not a JSON file.');
  }

  try {
      // Read the JSON file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);

      // Delete the JSON file
      fs.unlinkSync(filePath);

      console.log(`File "${filePath}" has been read and deleted successfully.`);
      return jsonData;
  } catch (error) {
      console.error(`Error processing the file: ${error.message}`);
      throw error;
  }
}
