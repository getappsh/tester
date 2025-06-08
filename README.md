# k6 Synthetic Test Runner

This project runs a k6 synthetic test (`getmap-synthetic.js`) on a schedule inside a Docker container. The schedule and test parameters are controlled by environment variables.

## Required Environment Variables

You must set the following environment variables when running the container:

### 1. `BASE_URL`
- **Purpose:** Sets the base URL for the API endpoints tested by the k6 script (`getmap-synthetic.js`).
- **Example:** `https://api-getapp.apps.getapp.sh`
- **Usage:** The k6 script will use this as the main endpoint for all HTTP requests.

### 2. `CRON_SCHEDULE`
- **Purpose:** Controls how often the k6 test runs, using standard cron syntax.
- **Default:** `*/5 * * * *` (every 5 minutes)
- **Example:** `CRON_SCHEDULE="*/15 * * * *"` (every 15 minutes)
- **Usage:** Change this to adjust how frequently the test is executed.

### 3. `K6_PROM_URL`
- **Purpose:** Sets the Prometheus remote write endpoint for k6 metrics output.
- **Default:** `http://localhost:9090`
- **Example:** `K6_PROM_URL="http://my-prometheus:9090"`
- **Usage:** k6 will send metrics to this Prometheus endpoint using the experimental remote write output.

### 4. `DEVICE_SECRET`
- **Purpose:** Secret key for API authentication used by the test scripts.
- **Default:** `"12345678"`
- **Example:** `DEVICE_SECRET="your-secure-secret"`
- **Usage:** Set this environment variable to a secure value for production or sensitive environments. If not set, the default is used.
 
## Example Docker Run Command

```sh
docker run \
  -e BASE_URL="https://api-getapp.apps.getapp.sh" \
  -e CRON_SCHEDULE="*/15 * * * *" \
  -e K6_PROM_URL="http://my-prometheus:9090" \
  your-k6-image:latest
```


## Notes
- Make sure to update `getmap-synthetic.js` to use `BASE_URL` from the environment (e.g., `const BASE_URL = __ENV.BASE_URL || "https://api-getapp.apps.getapp.sh";`).
- The schedule uses cron syntax. See [crontab.guru](https://crontab.guru/) for help with cron expressions.
- Prometheus remote write support in k6 is experimental.

---

If you have questions or need to customize the test, edit `getmap-synthetic.js` or the Dockerfile as needed.
