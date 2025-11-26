require('dotenv').config();
const axios = require('axios');

// --- Configuration ---
const BASE_URL = process.env.BASE_URL || "https://api-getapp.apps.getapp.sh";
const DEVICE_SECRET = process.env.DEVICE_SECRET || "DEVICE_SECRET";
const SPLUNK_HEC_URL = process.env.SPLUNK_HEC_URL;
const SPLUNK_HEC_TOKEN = process.env.SPLUNK_HEC_TOKEN;
const SPLUNK_INDEX = process.env.SPLUNK_INDEX;
const METRIC_TAG = process.env.METRIC_TAG || 'getapp-synthetic';

const DEPLOY_REGION = process.env.DEPLOY_REGION || "mezuda";
const TEST_KIND = process.env.TEST_KIND || "same-map";
const NUMBER_OF_UNIQUE_MAPS = parseInt(process.env.NUMBER_OF_UNIQUE_MAPS || '1');
const USE_THE_SAME_MAP = (process.env.USE_THE_SAME_MAP || 'false') === 'true';
const MAP_SIZE_SQM = parseInt(process.env.MAP_SIZE_SQM || '500');
const TEST_FILE_DOWNLOAD = (process.env.TEST_FILE_DOWNLOAD || 'true') === 'true';

const metrics = [];

const getDefaultHeaders = () => ({
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Device-Auth": DEVICE_SECRET
});

const sleep = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

function getBoundingBoxBySquareMeters(lon, lat, squareMeters) {
    const squareKm = squareMeters / 1_000_000; // convert to km²
    const side = Math.sqrt(squareKm); // side length in km

    // Latitude: 1 deg ≈ 110.574 km
    const deltaLat = (side / 2) / 110.574;

    // Longitude: 1 deg ≈ 111.320*cos(latitude) km
    const deltaLon = (side / 2) / (111.320 * Math.cos(lat * Math.PI / 180));

    const minLat = lat - deltaLat;
    const maxLat = lat + deltaLat;
    const minLon = lon - deltaLon;
    const maxLon = lon + deltaLon;

    return `${minLon},${minLat},${maxLon},${maxLat}`;
}

function generateBBoxArray() {
    const random = () => Math.floor(Math.random() * 10);
    const dataArray = [];

    if (USE_THE_SAME_MAP) {
        console.log("Using the same map");
        // Set a fixed seed-like behavior by using same values
        Math.seedrandom = require('seedrandom');
        Math.random = Math.seedrandom('1');
    }

    for (let i = 0; i < NUMBER_OF_UNIQUE_MAPS; i++) {
        const lon = Number(`34.508${random()}${random()}000`);
        const lat = Number(`31.542${random()}${random()}000`);
        const bbox = getBoundingBoxBySquareMeters(lon, lat, MAP_SIZE_SQM);
        dataArray.push(bbox);
    }

    return dataArray;
}

const bBoxArray = generateBBoxArray();

async function sendMetricsToSplunk() {
    if (!SPLUNK_HEC_URL || !SPLUNK_HEC_TOKEN || !SPLUNK_INDEX) {
        console.log("\nSplunk configuration not provided. Skipping metrics submission.");
        console.log("Collected Metrics:", JSON.stringify(metrics, null, 2));
        return;
    }

    // Use a single timestamp for all events in this bulk upload
    const bulkTimestamp = Math.floor(Date.now() / 1000);

    const splunkPayload = metrics.map(metric => ({
        event: metric,
        source: 'getmap-synthetic-test-splunk',
        index: SPLUNK_INDEX,
        time: bulkTimestamp
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

function recordMetric(testName, success, additionalData = {}) {
    metrics.push({
        test_name: testName,
        success: success ? 1 : 0,
        tag: METRIC_TAG,
        env: DEPLOY_REGION,
        kind: TEST_KIND,
        timestamp: new Date().toISOString(),
        ...additionalData
    });
}

async function testDiscovery(deviceId) {
    console.log('\n--- Discovery Test ---');
    try {
        const url = `${BASE_URL}/api/device/discover/map`;
        const body = {
            "discoveryType": "get-map",
            "general": {
                "personalDevice": {
                    "name": "user-1",
                    "idNumber": "idNumber-123",
                    "personalNumber": "personalNumber-123"
                },
                "situationalDevice": {
                    "weather": 23,
                    "bandwidth": 30,
                    "time": new Date(),
                    "operativeState": true,
                    "power": 94,
                    "location": { "lat": "33.4", "long": "23.3", "alt": "344" }
                },
                "physicalDevice": {
                    "OS": "android",
                    "MAC": "00-B0-D0-63-C2-26",
                    "IP": "129.2.3.4",
                    "ID": `${deviceId}`,
                    "serialNumber": "a36147aa81428033",
                    "possibleBandwidth": "Yes",
                    "availableStorage": "38142328832"
                }
            },
            "softwareData": {
                "formation": "yatush",
                "platform": {
                    "name": "Olar",
                    "platformNumber": "1",
                    "virtualSize": 0,
                    "components": []
                }
            },
            "mapData": {
                "productId": "dummy product",
                "productName": "no-name",
                "productVersion": "3",
                "productType": "osm",
                "description": "bla-bla",
                "boundingBox": "1,2,3,4",
                "crs": "WGS84",
                "imagingTimeStart": "2024-02-26T15:17:14.679733",
                "imagingTimeEnd": "2024-02-26T15:17:14.680871",
                "creationDate": "2024-02-26T15:17:14.681874",
                "source": "DJI Mavic",
                "classification": "raster",
                "compartmentalization": "N/A",
                "region": "ME",
                "sensor": "CCD",
                "precisionLevel": "3.14",
                "resolution": "0.12"
            }
        };

        const response = await axios.post(url, body, { headers: getDefaultHeaders() });
        const success = response.status === 201 && response.data.status === 'Success';
        
        recordMetric('discovery', success);
        
        if (!success) {
            console.error(`Discovery failed. Status: ${response.status}, Response:`, response.data);
        } else {
            console.log('Discovery succeeded');
        }
        
        return success;
    } catch (error) {
        console.error('Discovery error:', error.response ? error.response.data : error.message);
        recordMetric('discovery', false);
        return false;
    }
}

async function testMapImport(deviceId) {
    console.log('\n--- Map Import Test ---');
    let importRequestId = null;

    try {
        // Create Import
        const createUrl = `${BASE_URL}/api/map/import/create`;
        const bbox = bBoxArray[Math.floor(Math.random() * bBoxArray.length)];
        const createBody = {
            "deviceId": deviceId,
            "mapProperties": {
                "productName": "k6",
                "productId": "k6",
                "zoomLevel": 12,
                "boundingBox": bbox,
                "targetResolution": 0,
                "lastUpdateAfter": 0
            }
        };

        const createResponse = await axios.post(createUrl, createBody, { headers: getDefaultHeaders() });
        const createSuccess = createResponse.status === 201 && createResponse.data.status !== 'Error';
        
        recordMetric('map-import-create', createSuccess);

        if (!createSuccess) {
            console.error(`Create Import failed. Status: ${createResponse.status}, Response:`, createResponse.data);
            return null;
        }

        importRequestId = createResponse.data.importRequestId;
        console.log(`Import created with ID: ${importRequestId}`);
        
        await updateDownloadStatus(importRequestId, deviceId);

        // Poll for status
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
                console.error(`Get Import Status failed. Status: ${statusResponse.status}, Response:`, statusResponse.data);
            }
        }

        const statusSuccess = status === 'Done';
        recordMetric('map-import-status', statusSuccess);

        if (statusSuccess) {
            await updateDownloadStatus(importRequestId, deviceId);
            return importRequestId;
        }
        
        return null;
    } catch (error) {
        console.error('Map Import error:', error.response ? error.response.data : error.message);
        recordMetric('map-import-create', false);
        return null;
    }
}

async function updateDownloadStatus(catalogId, deviceId) {
    try {
        const url = `${BASE_URL}/api/delivery/updateDownloadStatus`;
        const body = {
            "deviceId": deviceId,
            "catalogId": catalogId,
            "downloadStart": new Date(),
            "bitNumber": 0,
            "downloadData": 32,
            "currentTime": new Date(),
            "deliveryStatus": "Start",
            "type": "map"
        };

        const response = await axios.post(url, body, { headers: getDefaultHeaders() });
        const success = response.status === 201;
        
        recordMetric('download-status', success);
        
        if (!success) {
            console.error(`Update download status failed. Status: ${response.status}, Response:`, response.data);
        }
        
        return success;
    } catch (error) {
        console.error('Update download status error:', error.response ? error.response.data : error.message);
        recordMetric('download-status', false);
        return false;
    }
}

async function testPrepareDelivery(importRequestId, deviceId) {
    console.log('\n--- Prepare Delivery Test ---');
    let downloadUrls = [];

    try {
        // Prepare Delivery
        const prepareUrl = `${BASE_URL}/api/delivery/prepareDelivery`;
        const prepareBody = {
            "catalogId": importRequestId,
            "deviceId": deviceId,
            "itemType": "map"
        };

        const prepareResponse = await axios.post(prepareUrl, prepareBody, { headers: getDefaultHeaders() });
        const prepareSuccess = prepareResponse.status === 201 && prepareResponse.data.status !== 'error';
        
        recordMetric('prepare-delivery', prepareSuccess);

        if (!prepareSuccess) {
            console.error(`Prepare Delivery failed. Status: ${prepareResponse.status}, Response:`, prepareResponse.data);
            return null;
        }

        console.log('Delivery preparation initiated');

        // Poll for prepared delivery
        let status = '';
        let artifacts = null;
        
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
                console.error(`Get Prepared Delivery failed. Status: ${getResponse.status}, Response:`, getResponse.data);
            }
        }

        const getSuccess = status === 'done';
        recordMetric('get-prepared-delivery', getSuccess);

        if (getSuccess && artifacts && artifacts.length >= 2) {
            downloadUrls.push(artifacts[0].url);
            downloadUrls.push(artifacts[1].url);
            console.log('Download URLs received:', downloadUrls);
            return downloadUrls;
        }

        return null;
    } catch (error) {
        console.error('Prepare Delivery error:', error.response ? error.response.data : error.message);
        recordMetric('prepare-delivery', false);
        return null;
    }
}

async function testFilesDownload(downloadUrls) {
    console.log('\n--- Files Download Test ---');
    
    if (!downloadUrls || downloadUrls.length < 2) {
        console.error('Download URLs are empty or insufficient');
        return false;
    }

    try {
        const startTime = Date.now();
        
        // Download both files in parallel
        const downloadPromises = [
            axios.get(downloadUrls[0], { responseType: 'arraybuffer', timeout: 30 * 60 * 1000 }),
            axios.get(downloadUrls[1], { responseType: 'arraybuffer', timeout: 30 * 60 * 1000 })
        ];

        const results = await Promise.allSettled(downloadPromises);
        
        // Check JSON download (first URL)
        const jsonSuccess = results[0].status === 'fulfilled' && results[0].value.status === 200;
        recordMetric('download-json', jsonSuccess);
        console.log(`JSON download ${jsonSuccess ? 'successful' : 'failed'}`);

        // Check GPKG download (second URL)
        const gpkgSuccess = results[1].status === 'fulfilled' && results[1].value.status === 200;
        
        if (gpkgSuccess) {
            const duration = Date.now() - startTime;
            const contentLength = results[1].value.headers['content-length'];
            
            recordMetric('download-gpkg', true, {
                downloaded_bytes: contentLength ? parseInt(contentLength) : 0,
                duration_ms: duration
            });
            
            console.log(`GPKG download successful. Size: ${contentLength} bytes, Duration: ${duration}ms`);
        } else {
            recordMetric('download-gpkg', false);
            console.log('GPKG download failed');
        }

        return jsonSuccess && gpkgSuccess;
    } catch (error) {
        console.error('Files Download error:', error.message);
        recordMetric('download-json', false);
        recordMetric('download-gpkg', false);
        return false;
    }
}

async function testDeliveryStatusDuringDownload(importRequestId, deviceId) {
    console.log('\n--- Delivery Status Updates Test ---');
    
    for (let i = 1; i <= 5; i++) {
        await updateDownloadStatus(importRequestId, deviceId);
        await sleep(2);
    }
    
    return true;
}

async function testConfig(deviceId) {
    console.log('\n--- Config Test ---');
    
    try {
        const url = `${BASE_URL}/api/device/config/${deviceId}?group=windows`;
        const response = await axios.get(url, { headers: getDefaultHeaders() });
        
        const success = response.status === 200 && response.data.group === 'windows';
        recordMetric('config', success);
        
        if (!success) {
            console.error(`Get config failed. Status: ${response.status}, Response:`, response.data);
        } else {
            console.log('Config test succeeded');
        }
        
        return success;
    } catch (error) {
        console.error('Config test error:', error.response ? error.response.data : error.message);
        recordMetric('config', false);
        return false;
    }
}

async function testInventoryUpdates(deviceId, importRequestId) {
    console.log('\n--- Inventory Updates Test ---');
    
    try {
        const url = `${BASE_URL}/api/map/inventory/updates`;
        const body = {
            "deviceId": deviceId,
            "inventory": { [importRequestId]: "delivery" }
        };
        
        const response = await axios.post(url, body, { headers: getDefaultHeaders() });
        const success = response.status === 201;
        
        recordMetric('inventory-updates', success);
        
        if (!success) {
            console.error(`Inventory Updates failed. Status: ${response.status}, Response:`, response.data);
        } else {
            console.log('Inventory Updates succeeded');
        }
        
        return success;
    } catch (error) {
        console.error('Inventory Updates error:', error.response ? error.response.data : error.message);
        recordMetric('inventory-updates', false);
        return false;
    }
}

async function runSDKTest() {
    const deviceId = `splunk-tester-${Date.now()}`;
    console.log(`\n=== Starting SDK Test for device: ${deviceId} ===`);

    try {
        // Discovery
        const discoverySuccess = await testDiscovery(deviceId);
        
        if (!discoverySuccess) {
            console.log('Discovery failed, stopping test flow');
            return;
        }

        // Map Import
        const importRequestId = await testMapImport(deviceId);
        
        if (!importRequestId) {
            console.log('Map Import failed, stopping test flow');
            return;
        }

        // Prepare Delivery
        const downloadUrls = await testPrepareDelivery(importRequestId, deviceId);
        
        if (!downloadUrls) {
            console.log('Prepare Delivery failed, continuing with remaining tests');
        } else if (TEST_FILE_DOWNLOAD) {
            await testFilesDownload(downloadUrls);
        } else {
            console.log('File download test skipped (TEST_FILE_DOWNLOAD=false)');
        }

        // Delivery Status Updates
        await testDeliveryStatusDuringDownload(importRequestId, deviceId);

        // Config
        await testConfig(deviceId);

        // Inventory Updates
        await testInventoryUpdates(deviceId, importRequestId);

        console.log('\n=== SDK Test Completed ===');
    } catch (error) {
        console.error('\nUnexpected error during SDK test:', error);
    }
}

(async () => {
    try {
        await runSDKTest();
    } catch (error) {
        console.error("\nAn unexpected error occurred during the main test execution:", error);
    } finally {
        console.log("\n--- Test execution finished. Sending metrics to Splunk... ---");
        await sendMetricsToSplunk();
    }
})();
