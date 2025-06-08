const cron = require('node-cron');
const { exec } = require('child_process');

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '*/5 * * * *';
// Use the Prometheus server URL (default to localhost if not set)
const K6_PROM_URL = process.env.K6_PROM_URL || 'http://monitor-prometheus-server.monitoring.svc.cluster.local:9090';
// Set K6_PROMETHEUS_RW_SERVER_URL environment variable
process.env.K6_PROMETHEUS_RW_SERVER_URL = K6_PROM_URL;

function runK6Test() {
  console.log(`[${new Date().toISOString()}] Running k6 test...`);
  // Create a temporary JSON file with Prometheus configuration
  const tempConfigCmd = `cat > k6-prom-config.json << EOF
{
  "push-gateway-url": "${K6_PROM_URL}",
  "insecure-skip-tls-verify": true
}
EOF`;
  
  exec(tempConfigCmd, (error) => {
    if (error) {
      console.error(`Error creating config file: ${error.message}`);
      return;
    }
    
    // Run k6 with the prometheus-push output option
    const cmd = `./k6 run --out json=summary.json --out prometheus-push=k6-prom-config.json getmap-synthetic.js`;
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
  });
}

cron.schedule(CRON_SCHEDULE, runK6Test);

// Check if we should run immediately (for testing)
if (process.argv.includes('runNow')) {
  console.log('Manual trigger detected, running k6 test now...');
  runK6Test();
}

console.log(`k6 cron runner started. Schedule: ${CRON_SCHEDULE}, Prometheus URL: ${K6_PROM_URL}`);
