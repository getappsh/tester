const cron = require('node-cron');
const { exec } = require('child_process');

// The cron schedule for running the test. Defaults to every 5 minutes.
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *';

/**
 * Executes the Node.js synthetic test script.
 * The environment variables for the test script (SPLUNK_HEC_URL, etc.)
 * must be available in the environment where this cron runner is executed.
 */
function runNodeTest() {
  console.log(`[${new Date().toISOString()}] Running Node.js synthetic test...`);
  
  // Command to execute the new test script
  const cmd = `node getmap-synthetic-node.js`;
  
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Execution error: ${error.message}`);
      return;
    }
    if (stderr) {
      // Log standard error but don't treat it as a fatal execution error,
      // as the script itself might output warnings or debug info to stderr.
      console.error(`Script stderr: ${stderr}`);
    }
    console.log(`Script stdout: ${stdout}`);
  });
}

// Schedule the test to run on the defined cron schedule.
if (cron.validate(CRON_SCHEDULE)) {
    cron.schedule(CRON_SCHEDULE, runNodeTest);
    console.log(`Node.js test runner started. Schedule: ${CRON_SCHEDULE}`);
} else {
    console.error(`Invalid CRON_SCHEDULE: "${CRON_SCHEDULE}". The script will not be scheduled.`);
}

// Check if the script should be run immediately (for testing purposes).
if (process.argv.includes('runNow')) {
  console.log('Manual trigger detected, running Node.js test now...');
  runNodeTest();
}
