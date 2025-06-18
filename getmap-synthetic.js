// k6 run --out json=results/test_results.json --out experimental-prometheus-rw=http://prometheus:9090/api/v1/write getmap-synthetic.js

import http from "k6/http";
import { SharedArray } from 'k6/data';
import { group, check, sleep, randomSeed } from "k6";
import { Rate, Trend, Counter } from 'k6/metrics';
import exec, { test } from 'k6/execution';


export const options = {
  scenarios: {
    one_iteration: {
      executor: 'per-vu-iterations',
      vus: 1, // One virtual user
      iterations: 1, // One iteration 1
    },
  },
};


// let exportDuration = new Trend('export_duration', true);
// const exportTimeoutRate = new Rate('export_timeout_rate');
const getapp_success = new Rate('getapp_success');

export const filesDownloaded = new Counter('map_downloaded');
export const totalDownloadedBytes = new Counter('total_downloaded_map_bytes');
export const fileDownloadDuration = new Trend('map_download_duration', true);

const BASE_URL = __ENV.BASE_URL || "https://api-getapp.apps.getapp.sh";
// const BASE_URL = __ENV.BASE_URL || "https://api-project-refactor.apps.getapp.sh";


const NUMBER_OF_UNIQUE_MAPS = __ENV.NUMBER_OF_UNIQUE_MAPS || 1
const USE_THE_SAME_MAP = (__ENV.USE_THE_SAME_MAP ?? 'false') === 'true';
const MAP_SIZE_SQM = __ENV.MAP_SIZE_SQM || 500;
const TEST_FILE_DOWNLOAD = (__ENV.TEST_FILE_DOWNLOAD ?? 'true') === 'true';
const DEVICE_SECRET = __ENV.DEVICE_SECRET || "DEVICE_SECRET";

// let authToken;

export default function () {
  runSDKTest()
  // runHeathCheck()
  // getRecords()

}

function runSDKTest() {
  const deviceId = "k6-" + exec.vu.idInTest
  // login();
  testDiscovery(deviceId);

  let importRequestId = testMapImport(deviceId);

  let downloadUrls = testPrepareDelivery(importRequestId, deviceId);  

  // const downloadUrls = ['https://freetestdata.com/wp-content/uploads/2021/09/Free_Test_Data_1MB_XLS.xls', 'https://testfile.org/1.3GBiconpng']; // for testing purposes
  if (TEST_FILE_DOWNLOAD){
    testFilesDownload(downloadUrls);
  }

  testDeliveryStatusDuringDownload(importRequestId, deviceId);

  testConfig(deviceId);
 
  testInventoryUpdates(deviceId);
}

function testDiscovery(deviceId) {
  group("Discovery", () => {
    {
      let url = BASE_URL + `/api/device/discover/map`;
      let body = { "discoveryType": "get-map", "general": { "personalDevice": { "name": "user-1", "idNumber": "idNumber-123", "personalNumber": "personalNumber-123" }, "situationalDevice": { "weather": 23, "bandwidth": 30, "time": new Date(), "operativeState": true, "power": 94, "location": { "lat": "33.4", "long": "23.3", "alt": "344" } }, "physicalDevice": { "OS": "android", "MAC": "00-B0-D0-63-C2-26", "IP": "129.2.3.4", "ID": `${deviceId}`, "serialNumber": "a36147aa81428033", "possibleBandwidth": "Yes", "availableStorage": "38142328832" } }, "softwareData": { "formation": "yatush", "platform": { "name": "Olar", "platformNumber": "1", "virtualSize": 0, "components": [] } }, "mapData": { "productId": "dummy product", "productName": "no-name", "productVersion": "3", "productType": "osm", "description": "bla-bla", "boundingBox": "1,2,3,4", "crs": "WGS84", "imagingTimeStart": "2024-02-26T15:17:14.679733", "imagingTimeEnd": "2024-02-26T15:17:14.680871", "creationDate": "2024-02-26T15:17:14.681874", "source": "DJI Mavic", "classification": "raster", "compartmentalization": "N/A", "region": "ME", "sensor": "CCD", "precisionLevel": "3.14", "resolution": "0.12" } };
      let params = { headers: getDefaultHeaders() };
      let request = http.post(url, JSON.stringify(body), params);

      const success = check(request, {
        "Discovery status code": (r) => r.status === 201,
        "Discovery map offering status": (r) => r.json("status") === "Success",
      });
      if (!success) {
        console.error(`Discovery failed with status ${request.status}. Response:`, request.json());
      }
      getapp_success.add(success, { test_name: "discovery" });
    }
  });
}

function testMapImport(deviceId){
  let importRequestId = '0';
  group("Import Map", () => {
    const mapImport = () => {
      let url = BASE_URL + `/api/map/import/create`;
      const bbox = bBoxArray[Math.floor(Math.random() * bBoxArray.length)];
      let body = { "deviceId": deviceId, "mapProperties": { "productName": "k6", "productId": "k6", "zoomLevel": 12, "boundingBox": bbox, "targetResolution": 0, "lastUpdateAfter": 0 } };
      let params = { headers: getDefaultHeaders() };
      let request = http.post(url, JSON.stringify(body), params);

      const success = check(request, {
        "Create Import status code": (r) => r.status === 201,
        "Import status ok": (r) => r.json("status") !== "Error",
      });
      if (!success) {
        console.error(`Create Import failed with status ${request.status}. Response: ${JSON.stringify(request.body)}`);
      }
      getapp_success.add(success, { test_name: "map-import" });
      importRequestId = request.json("importRequestId")
      downloadStatus(importRequestId, deviceId)
    }

    
    let status;
    const mapStatus = () => {
      let url = BASE_URL + `/api/map/import/status/${importRequestId}`;
      let params = { headers: getDefaultHeaders() };
      let request = http.get(url, params);

      const success = check(request, {
        "Get Import status code": (r) => r.status === 200,
        "Import status ok": (r) => r.json("status") !== "Error",
      });
      if (!success) {
        console.error(`Get Import Status failed with status ${request.status}. Response: ${JSON.stringify(request.body)}`);
      }
      getapp_success.add(success, { test_name: "map-import" });
      status = request.json("status")
      console.log(request.json())
    }

    mapImport()

    if (importRequestId && importRequestId !== '0') {
      while (status !== 'Done' && status !== 'Error') {
        mapStatus()
        sleep(2)
      }
      downloadStatus(importRequestId, deviceId)
    }
    
  });
  return importRequestId;
}

function testPrepareDelivery(importRequestId, deviceId) {
  let downloadUrls = [];

  group("Prepare Delivery", () => {
    let status = 'start';
    const prepareDelivery = () => {
      let url = BASE_URL + `/api/delivery/prepareDelivery`;
      let body = { "catalogId": importRequestId, "deviceId": deviceId, "itemType": "map" };
      let params = { headers: getDefaultHeaders() };
      let request = http.post(url, JSON.stringify(body), params);

      const success = check(request, {
        "Prepare Delivery status code": (r) => r.status === 201,
        "Prepare Delivery status ok": (r) => r.json("status") !== "error",
      });
      if (!success) {
        console.error(`Prepare Delivery failed with status ${request.status}. Response: ${JSON.stringify(request.body)}`);
      }
      getapp_success.add(success, { test_name: "prepare-delivery" });
    }


    let artifacts
    const getPreparedDelivery = () => {
      let url = BASE_URL + `/api/delivery/preparedDelivery/${importRequestId}`;
      let params = { headers: getDefaultHeaders() };
      let request = http.get(url, params);

      const success = check(request, {
        "Get Prepared Delivery status code": (r) =>  r.status === 200,
        "Get Prepared Delivery status ok": (r) => r.json("status") !== "error",    
      });

      if (!success) {
        console.error(`Get Prepared Delivery failed with status ${request.status}. Response: ${JSON.stringify(request.body)}`);
      }
      getapp_success.add(success, { test_name: "prepare-delivery" });

      status = request.json("status");
      artifacts = request.json("artifacts")
    }

    if (importRequestId && importRequestId !== '0') {
      prepareDelivery()
      while (status !== 'done' && status !== 'error') {
        sleep(2)
        getPreparedDelivery()

      }
      downloadUrls.push(artifacts[0]["url"]);
      downloadUrls.push(artifacts[1]["url"]);
      console.log(downloadUrls)
    }
  });

  return downloadUrls;
}


function testDeliveryStatusDuringDownload(importRequestId, deviceId) {
  group("Delivery", () => {
    for (let i = 1; i <= 5; i++) {
      downloadStatus(importRequestId, deviceId)
      sleep(2)
    }
  });
}

function testConfig(deviceId) {
   group("Config", () => {
    {
      let url = BASE_URL + `/api/device/config/${deviceId}?group=windows`;
      let params = { headers: getDefaultHeaders() };
      let request = http.get(url, params);

      const success = check(request, {
        "Get map config": (r) => r.status === 200,
        "Get map config correct group": (r) => r.json("group") === "windows",
      });

      if (!success) {
        console.error(`Get map config failed with status ${request.status}. Response: ${JSON.stringify(request.body)}`);
      }
      getapp_success.add(success, { test_name: "config" });

      sleep(1)
    }
  });
}

function testInventoryUpdates(deviceId) {
  group("Inventory Updates", () => {
    {
      let url = BASE_URL + `/api/map/inventory/updates`;
      let body = { "deviceId": deviceId, "inventory": { importRequestId: "delivery" } };
      let params = { headers: getDefaultHeaders() };
      let request = http.post(url, JSON.stringify(body), params);

      const success = check(request, {
        "Inventory Updates": (r) => {
          if (r.status !== 201) {
            console.error(`Inventory Updates with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
            return false;
          }
          return true;
        }
      });
      getapp_success.add(success, { test_name: "inventory-updates" });

      sleep(1)
    }

  });
}

function testFilesDownload(downloadUrls) {
  group("File download", () => {
    if (!downloadUrls?.length || downloadUrls?.length < 2 ) {
      console.error("Download url is empty");
      return
    }

    let params = { headers: getDefaultHeaders(), responseType: 'none', timeout: '30m' };
    // let request = http.get(downloadUrl, params);

    const responses = http.batch([
      ['GET', downloadUrls[0], null, params],
      ['GET', downloadUrls[1], null, params],
    ]);
    

    let success = check(responses[0], {
      "Download json": (r) => {
        if (r.status !== 200) {
          console.error(`Download json failed with status ${r.status}. Response: ${JSON.stringify(r.body).slice(0, 100)}`);
          return false;
        }
        return true;
      },

    });
    getapp_success.add(success, { test_name: "download-json" });

    success = check(responses[1], {
      "Download gpkg": (r) => {
        if (r.status !== 200) {
          console.error(`Download gpkg failed with status ${r.status}. Response: ${JSON.stringify(r.body).slice(0, 100)}`);
          return false;
        }
        return true;
      },
    });
    getapp_success.add(success, { test_name: "download-gpkg" });

    if (success){
      filesDownloaded.add(1);
      totalDownloadedBytes.add(responses[1]?.headers['Content-Length']);
      fileDownloadDuration.add(responses[1]?.timings?.duration); // in ms
    }
  });
}

const downloadStatus = (catalogId, deviceId) => {
    let url = BASE_URL + `/api/delivery/updateDownloadStatus`;

    let body = { "deviceId": deviceId, "catalogId": catalogId, "downloadStart": new Date(), "bitNumber": 0, "downloadData": 32, "currentTime": new Date(), "deliveryStatus": "Start", "type": "map" };
    let params = { headers: getDefaultHeaders() };
    let request = http.post(url, JSON.stringify(body), params);

    const success = check(request, {
      "Update download status": (r) => {
        if (r.status !== 201) {
          console.error(`Update download status failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          return false;
        }
        return true;
      }
    });
    getapp_success.add(success, { test_name: "download-status" });
}

const bBoxArray = new SharedArray('bbox', function () {
  if (USE_THE_SAME_MAP){
      randomSeed(1);
      console.log("Using the same map")
  }
  const random = () => Math.floor(Math.random() * 10)
  const dataArray = [];

  for (let i = 0; i < NUMBER_OF_UNIQUE_MAPS; i++) {
    // const bbox = `34.508809${random()}${random()},31.542892${random()}${random()},34.508848${random()}${random()},31.542919${random()}${random()}`
    
    const lon =  Number(`34.508${random()}${random()}000`);
    const lat =  Number(`31.542${random()}${random()}000`);
    const bbox = getBoundingBoxBySquareMeters(lon, lat, MAP_SIZE_SQM);

    dataArray.push(bbox)
  }

  return dataArray; // must be an array
});


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

const getDefaultHeaders = () => {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Device-Auth": DEVICE_SECRET
    // "Authorization": `Bearer ${authToken}`
  }
}