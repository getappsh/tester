const cron = require('node-cron');
const { spawn } = require('child_process');

// The cron schedule for running the test. Defaults to every 5 minutes.
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *';

/**
 * Executes the Node.js synthetic test script.
 * The environment variables for the test script (SPLUNK_HEC_URL, etc.)
 * must be available in the environment where this cron runner is executed.
 */
function runNodeTest() {
  console.log(`[${new Date().toISOString()}] Running Node.js synthetic test...`);
  
  // Spawn the test script as a child process
  const child = spawn('node', ['getmap-synthetic-node.js']);
  
  // Handle stdout data
  child.stdout.on('data', (data) => {
    console.log(`Script stdout: ${data.toString()}`);
  });
  
  // Handle stderr data
  child.stderr.on('data', (data) => {
    console.error(`Script stderr: ${data.toString()}`);
  });
  
  // Handle process exit
  child.on('close', (code) => {
    if (code !== 0) {
      console.error(`Process exited with code: ${code}`);
    } else {
      console.log(`Process completed successfully with exit code: ${code}`);
    }
  });
  
  // Handle errors
  child.on('error', (error) => {
    console.error(`Failed to start process: ${error.message}`);
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
