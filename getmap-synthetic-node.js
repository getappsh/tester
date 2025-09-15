const axios = require('axios');

// --- Configuration ---
const BASE_URL = process.env.BASE_URL || "https://api-getapp.apps.getapp.sh";
const DEVICE_SECRET = process.env.DEVICE_SECRET || "12345678";
const SPLUNK_HEC_URL = process.env.SPLUNK_HEC_URL;
const SPLUNK_HEC_TOKEN = process.env.SPLUNK_HEC_TOKEN;
const SPLUNK_INDEX = process.env.SPLUNK_INDEX;
const METRIC_TAG = process.env.METRIC_TAG || 'getapp-syntetic';

const metrics = [];

const getDefaultHeaders = () => ({
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Device-Auth": DEVICE_SECRET
});

const sleep = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

async function sendMetricsToSplunk() {
    if (!SPLUNK_HEC_URL || !SPLUNK_HEC_TOKEN || !SPLUNK_INDEX) {
        console.log("\nSplunk configuration not provided. Skipping metrics submission.");
        console.log("Collected Metrics:", JSON.stringify(metrics, null, 2));
        return;
    }

    const splunkPayload = metrics.map(metric => ({
        event: metric,
        source: 'getmap-synthetic-test-node',
        index: SPLUNK_INDEX,
        time: Math.floor(new Date(metric.timestamp).getTime() / 1000)
    }));

    try {
        await axios.post(SPLUNK_HEC_URL, splunkPayload.map(p => JSON.stringify(p)).join('\n'), {
            headers: {
                'Authorization': `Splunk ${SPLUNK_HEC_TOKEN}`
            }
        });
        console.log('\nSuccessfully sent metrics to Splunk.');
    } catch (error) {
        console.error('\nError sending metrics to Splunk:', error.response ? error.response.data : error.message);
    }
}

function changeFileExtension(url) {
    if (url.endsWith('.gpkg')) {
        return url.slice(0, -5) + '.json';
    } else {
        return url;
    }
}

async function runTest(testName, testFn) {
    console.log(`\n--- Starting Test: ${testName} ---`);
    try {
        const success = await testFn();
        metrics.push({ test_name: testName, success: success ? 1 : 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
        console.log(`--- Finished Test: ${testName} | Result: ${success ? 'Success' : 'Failure'} ---`);
        return success;
    } catch (error) {
        console.error(`--- Error in Test: ${testName} ---`, error.response ? error.response.data : error.message);
        metrics.push({ test_name: testName, success: 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
        console.log(`--- Finished Test: ${testName} | Result: Failure ---`);
        return false;
    }
}

async function runDiscoveryTest(deviceId) {
    const url = `${BASE_URL}/api/device/discover/map`;
    const body = { "discoveryType": "get-map", "general": { "personalDevice": { "name": "user-1", "idNumber": "idNumber-123", "personalNumber": "personalNumber-123" }, "situationalDevice": { "weather": 23, "bandwidth": 30, "time": new Date(), "operativeState": true, "power": 94, "location": { "lat": "33.4", "long": "23.3", "alt": "344" } }, "physicalDevice": { "OS": "android", "MAC": "00-B0-D0-63-C2-26", "IP": "129.2.3.4", "ID": `${deviceId}`, "serialNumber": "a36147aa81428033", "possibleBandwidth": "Yes", "availableStorage": "38142328832" } }, "softwareData": { "formation": "yatush", "platform": { "name": "Olar", "platformNumber": "1", "virtualSize": 0, "components": [] } }, "mapData": { "productId": "dummy product", "productName": "no-name", "productVersion": "3", "productType": "osm", "description": "bla-bla", "boundingBox": "1,2,3,4", "crs": "WGS84", "imagingTimeStart": "2024-02-26T15:17:14.679733", "imagingTimeEnd": "2024-02-26T15:17:14.680871", "creationDate": "2024-02-26T15:17:14.681874", "source": "DJI Mavic", "classification": "raster", "compartmentalization": "N/A", "region": "ME", "sensor": "CCD", "precisionLevel": "3.14", "resolution": "0.12" } };
    const response = await axios.post(url, body, { headers: getDefaultHeaders() });
    return response.status === 201 && response.data.status === 'Success';
}

async function runImportMapTest(deviceId) {
    // Create Import
    const createUrl = `${BASE_URL}/api/map/import/create`;
    const createBody = { "deviceId": deviceId, "mapProperties": { "productName": "k6", "productId": "k6", "zoomLevel": 12, "boundingBox": "1,2,3,4", "targetResolution": 0, "lastUpdateAfter": 0 } };
    const createResponse = await axios.post(createUrl, createBody, { headers: getDefaultHeaders() });

    if (createResponse.status !== 201 || createResponse.data.status === 'Error') {
        console.error(`Create Import failed. Status: ${createResponse.status}, Body: ${JSON.stringify(createResponse.data)}`);
        metrics.push({ test_name: 'map-import-create', success: 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
        return null;
    }
    
    const importRequestId = createResponse.data.importRequestId;
    metrics.push({ test_name: 'map-import-create', success: 1, tag: METRIC_TAG, timestamp: new Date().toISOString() });
    await updateDownloadStatus(deviceId, importRequestId, 'Start');

    // Check Status
    let status = '';
    while (status !== 'Done' && status !== 'Error') {
        await sleep(2);
        const statusUrl = `${BASE_URL}/api/map/import/status/${importRequestId}`;
        const statusResponse = await axios.get(statusUrl, { headers: getDefaultHeaders() });
        if (statusResponse.status === 200 && statusResponse.data.status !== 'Error') {
            status = statusResponse.data.status;
            console.log(`Import status: ${status}`);
        } else {
            status = 'Error';
            console.error(`Get Import Status failed. Status: ${statusResponse.status}, Body: ${JSON.stringify(statusResponse.data)}`);
        }
    }

    metrics.push({ test_name: 'map-import-status', success: status === 'Done' ? 1 : 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
    if (status === 'Done') {
        await updateDownloadStatus(deviceId, importRequestId, 'Done');
        return importRequestId;
    }
    return null;
}

async function updateDownloadStatus(deviceId, catalogId, deliveryStatus) {
    const url = `${BASE_URL}/api/delivery/updateDownloadStatus`;
    const body = { deviceId, catalogId, downloadStart: new Date(), bitNumber: 0, downloadData: 32, currentTime: new Date(), deliveryStatus, type: "map" };
    const response = await axios.post(url, body, { headers: getDefaultHeaders() });
    const success = response.status === 201;
    metrics.push({ test_name: `download-status-${deliveryStatus.toLowerCase()}`, success: success ? 1 : 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
    if (!success) console.error(`Update download status (${deliveryStatus}) failed. Status: ${response.status}, Body: ${JSON.stringify(response.data)}`);
}

async function runPrepareDeliveryTest(importRequestId, deviceId) {
    // Prepare Delivery
    const prepareUrl = `${BASE_URL}/api/delivery/prepareDelivery`;
    const prepareBody = { catalogId: importRequestId, deviceId, itemType: "map" };
    const prepareResponse = await axios.post(prepareUrl, prepareBody, { headers: getDefaultHeaders() });

    if (prepareResponse.status !== 201 || prepareResponse.data.status === 'error') {
        metrics.push({ test_name: 'prepare-delivery', success: 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
        console.error(`Prepare Delivery failed. Status: ${prepareResponse.status}, Body: ${JSON.stringify(prepareResponse.data)}`);
        return null;
    }
    metrics.push({ test_name: 'prepare-delivery', success: 1, tag: METRIC_TAG, timestamp: new Date().toISOString() });

    // Get Prepared Delivery
    let status = '';
    let artifacts;
    while (status !== 'done' && status !== 'error') {
        await sleep(2);
        const getUrl = `${BASE_URL}/api/delivery/preparedDelivery/${importRequestId}`;
        const getResponse = await axios.get(getUrl, { headers: getDefaultHeaders() });

        if (getResponse.status === 200 && getResponse.data.status !== 'error') {
            status = getResponse.data.status;
            artifacts = getResponse.data.artifacts;
            console.log(`Prepared delivery status: ${status}`);
        } else {
            status = 'error';
            console.error(`Get Prepared Delivery failed. Status: ${getResponse.status}, Body: ${JSON.stringify(getResponse.data)}`);
        }
    }

    metrics.push({ test_name: 'get-prepared-delivery', success: status === 'done' ? 1 : 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
    if (status === 'done' && artifacts && artifacts.length > 0) {
        const downloadUrl = artifacts[0].url;
        console.log("Download URL received:", downloadUrl);
        return downloadUrl;
    }
    return null;
}

async function filesDownload(url) {
    const jsonUrl = changeFileExtension(url);

    const downloadGpkg = axios.get(url, { responseType: 'arraybuffer' });
    const downloadJson = axios.get(jsonUrl, { responseType: 'arraybuffer' });

    const [gpkgResult, jsonResult] = await Promise.allSettled([downloadGpkg, downloadJson]);

    const gpkgSuccess = gpkgResult.status === 'fulfilled' && gpkgResult.value.status === 200;
    metrics.push({ test_name: 'download-gpkg', success: gpkgSuccess ? 1 : 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
    console.log(`GPKG download ${gpkgSuccess ? 'successful' : 'failed'}.`);

    const jsonSuccess = jsonResult.status === 'fulfilled' && jsonResult.value.status === 200;
    metrics.push({ test_name: 'download-json', success: jsonSuccess ? 1 : 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
    console.log(`JSON download ${jsonSuccess ? 'successful' : 'failed'}.`);

    return gpkgSuccess && jsonSuccess;
}

async function runDeliveryUpdates(importRequestId, deviceId) {
    console.log('Running final delivery status checks...');
    for (let i = 0; i < 5; i++) {
        await updateDownloadStatus(deviceId, importRequestId, `FinalStatus_${i + 1}`);
        await sleep(2);
    }
    return true;
}

async function runConfigTest(deviceId) {
    const url = `${BASE_URL}/api/device/config/${deviceId}?group=windows`;
    const response = await axios.get(url, { headers: getDefaultHeaders() });
    return response.status === 200 && response.data.group === 'windows';
}

async function runInventoryUpdatesTest(deviceId, importRequestId) {
    const url = `${BASE_URL}/api/map/inventory/updates`;
    const body = { deviceId, inventory: { [importRequestId]: "delivery" } };
    const response = await axios.post(url, body, { headers: getDefaultHeaders() });
    return response.status === 201;
}

async function runHealthChecks() {
    const endpoints = [
        'delivery',
        'device',
        'offering',
        'map'
    ];
    let allHealthy = true;
    for (const service of endpoints) {
        const url = `${BASE_URL}/api/${service}/checkHealth`;
        try {
            const response = await axios.get(url);
            const success = response.status === 200;
            metrics.push({ test_name: `${service}-health`, success: success ? 1 : 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
            if (!success) allHealthy = false;
        } catch (error) {
            metrics.push({ test_name: `${service}-health`, success: 0, tag: METRIC_TAG, timestamp: new Date().toISOString() });
            allHealthy = false;
        }
    }
    return allHealthy;
}


(async () => {
    const deviceId = `node-tester-${Date.now()}`;
    let importRequestId = null;

    try {
        await runTest('Health Checks', runHealthChecks);
        
        const discoverySuccess = await runTest('Discovery', () => runDiscoveryTest(deviceId));
        
        if (discoverySuccess) {
            importRequestId = await runImportMapTest(deviceId); // This is a flow, not a single test
        }

        if (importRequestId) {
            const downloadUrl = await runPrepareDeliveryTest(importRequestId, deviceId); // This is a flow
            if (downloadUrl) {
                await runTest('File Downloads', () => filesDownload(downloadUrl));
            }
            await runTest('Delivery Status Updates', () => runDeliveryUpdates(importRequestId, deviceId));
            await runTest('Get Config', () => runConfigTest(deviceId));
            await runTest('Inventory Updates', () => runInventoryUpdatesTest(deviceId, importRequestId));
        }

    } catch (error) {
        console.error("\nAn unexpected error occurred during the main test execution:", error);
    } finally {
        console.log("\n--- Test execution finished. Sending metrics... ---");
        await sendMetricsToSplunk();
    }
})();
