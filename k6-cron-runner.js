const cron = require('node-cron');
const { exec } = require('child_process');

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *';
const K6_PROM_URL = process.env.K6_PROM_URL || 'http://localhost:9090';

function runK6Test() {
  console.log(`[${new Date().toISOString()}] Running k6 test...`);
  const cmd = `k6 run --out experimental-prometheus-rw=${K6_PROM_URL}/api/v1/write getmap-synthetic.js`;
  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`k6 error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`k6 stderr: ${stderr}`);
    }
    console.log(`k6 stdout: ${stdout}`);
  });
}

cron.schedule(CRON_SCHEDULE, runK6Test);

console.log(`k6 cron runner started. Schedule: ${CRON_SCHEDULE}, Prometheus URL: ${K6_PROM_URL}`);
