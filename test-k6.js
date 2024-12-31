import http from "k6/http";
import { SharedArray } from 'k6/data';
import { group, check, sleep, fail } from "k6";
import exec from 'k6/execution';

  export const options = {
    scenarios: {
        one_iteration: {
            executor: 'per-vu-iterations',
            vus: 1, // One virtual user
            iterations: 1, // One iteration
        },
    },
};
  
let authToken;
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";


//Do not put high value may overload Libot
const NUMBER_OF_UNIQUE_MAPS = 1

const bBoxArray = new SharedArray('bbox', function () {
  const random = () => Math.floor(Math.random() * 10)
  const dataArray = [];

  for (let i=0;i<NUMBER_OF_UNIQUE_MAPS; i++) {
    const bbox = `34.472849${random()}${random()},31.519675${random()}${random()},34.476277${random()}${random()},31.522433${random()}${random()}`
    dataArray.push(bbox)
  }

  // more operations
  return dataArray; // must be an array
});

export default function(){
  runSDKTest()
  
  // runHeathCheck()
  // getRecords()

}

function runSDKTest() {
    const deviceId = "k6-" + exec.vu.idInTest
    if (!authToken || exec.vu.iterationInScenario === 0){
      group("Login", () => {
        {
            let url = BASE_URL + `/api/login`;
            // TODO: edit the parameters of the request body.
            let body = {"username": "rony@example.com", "password": "rony123"};
            let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
            let request = http.post(url, JSON.stringify(body), params);

            check(request, {
                "Login": (r) => {
                  if (r.status !== 201) {
                    fail(`Login failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
                }
                return true;
                }
            });
            authToken = request.json("accessToken"); // Assuming token is returned in the response
            // console.log("Received token:", authToken); // Print the token
        }
      });
    }

    group("Discovery", () => {

      {
          let url = BASE_URL + `/api/device/discover`;
          let body = {"discoveryType":"get-map","general":{"personalDevice":{"name":"user-1","idNumber":"idNumber-123","personalNumber":"personalNumber-123"},"situationalDevice":{"weather":23,"bandwidth":30,"time": new Date(),"operativeState":true,"power":94,"location":{"lat":"33.4","long":"23.3","alt":"344"}},"physicalDevice":{"OS":"android","MAC":"00-B0-D0-63-C2-26","IP":"129.2.3.4","ID":"a36147aa81428033","serialNumber":"a36147aa81428033","possibleBandwidth":"Yes","availableStorage":"38142328832"}},"softwareData":{"formation":"yatush","platform":{"name":"Olar","platformNumber":"1","virtualSize":0,"components":[]}},"mapData":{"productId":"dummy product","productName":"no-name","productVersion":"3","productType":"osm","description":"bla-bla","boundingBox":"1,2,3,4","crs":"WGS84","imagingTimeStart":"2024-02-26T15:17:14.679733","imagingTimeEnd":"2024-02-26T15:17:14.680871","creationDate":"2024-02-26T15:17:14.681874","source":"DJI Mavic","classification":"raster","compartmentalization":"N/A","region":"ME","sensor":"CCD","precisionLevel":"3.14","resolution":"0.12"}};
          // let body = {"discoveryType":"get-map","general":{"personalDevice":{"name":"user-1","idNumber":"idNumber-123","personalNumber":"personalNumber-123"},"situationalDevice":{"weather":23,"bandwidth":30,"time": new Date(),"operativeState":true,"power":94,"location":{"lat":"33.4","long":"23.3","alt":"344"}},"physicalDevice":{"OS":"android","MAC":"00-B0-D0-63-C2-26","IP":"129.2.3.4","ID":"a36147aa81428033","serialNumber":"a36147aa81428033","possibleBandwidth":"Yes","availableStorage":"38142328832"}},"softwareData":{"formation":"yatush","platform":{"name":"Olar","platformNumber":"1","virtualSize":0,"components":[]}}};
          let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
          let request = http.post(url, JSON.stringify(body), params);

          check(request, {
              "Discovery": (r) => {if (r.status !== 201) {
                fail(`Discovery failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
            }
            return true;}
          });
          sleep(1)
      }
    });

    const downloadStatus = (catalogId)=>{
        let url = BASE_URL + `/api/delivery/updateDownloadStatus`;

        let body = {"deviceId": deviceId, "catalogId": catalogId, "downloadStart": new Date(), "bitNumber": 0, "downloadData": 32, "currentTime": new Date(), "deliveryStatus": "Start", "type": "map"};
        let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
        let request = http.post(url, JSON.stringify(body), params);

        check(request, {
            "Update download status": (r) => {
              if (r.status !== 201) {
                fail(`Update download status failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
            }
            return true;
            }
        });
      }

    
    let importRequestId = '0';
    group("Import Map", () => {
      const mapImport = () => {
          let url = BASE_URL + `/api/map/import/create`;
          const bbox = bBoxArray[Math.floor(Math.random() * bBoxArray.length)];
          let body = {"deviceId": deviceId, "mapProperties": {"productName": "k6", "productId": "k6", "zoomLevel": 12, "boundingBox": bbox, "targetResolution": 0, "lastUpdateAfter": 0}};
          let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
          let request = http.post(url, JSON.stringify(body), params);
          
          check(request, {
              "Create Import": (r) => {
                if (r.status !== 201) {
                  fail(`Create Import failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
              }
              return true;
              }
          });
          importRequestId  = request.json("importRequestId")
          downloadStatus(importRequestId)
      }

      let status;
      const mapStatus = () => {
        let url = BASE_URL + `/api/map/import/status/${importRequestId}`;
        let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
        let request = http.get(url, params);

        check(request, {
            "Get Import Status": (r) => {
              if (r.status !== 200) {
                fail(`Get Import Status failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
            }
            return true;
            },

        });
        status = request.json("status")
      } 

      // if (exec.vu.idInTest % 10 == 0){
        mapImport()
      // }

      sleep(1)
      while (status !== 'Done' && status !== 'Error'){
        mapStatus()
        sleep(2)
      }
      downloadStatus(importRequestId)
    });

    let downloadUrl
    group("Prepare Delivery", () => {
      {
          let url = BASE_URL + `/api/delivery/prepareDelivery`;
          let body = {"catalogId": importRequestId, "deviceId": deviceId, "itemType": "map"};
          let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
          let request = http.post(url, JSON.stringify(body), params);

          check(request, {
              "Prepare Delivery": (r) => {
                if (r.status !== 201) {
                  fail(`Prepare Delivery failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
              }
              return true;
              }
          });
          sleep(1)
      }

      {
          let url = BASE_URL + `/api/delivery/preparedDelivery/${importRequestId}`;
          let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
          let request = http.get(url, params);
        
          check(request, {
              "Get Prepared Delivery": (r) => {
                if (r.status !== 200) {
                  fail(`Get Prepared Delivery failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
              }
              return true;
              }
          });
          downloadUrl = request.json("url")
          sleep(1)
      }

    });

    // put in a comment if you want to skip file download
    filesDownload(downloadUrl);

    group("Delivery", () => {
      for (let i=1;i<=5; i++) {
        downloadStatus(importRequestId)
        sleep(2)
      }
    });


    group("Config", () => {
      {
          let url = BASE_URL + `/api/map/configs/${deviceId}`;
          let params = {headers: {"Authorization": `Bearer ${authToken}`}};
          let request = http.get(url, params);

          check(request, {
              "Get map config": (r) => {
                if (r.status !== 200) {
                  fail(`Get Map Config failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
              }
              return true;
              }
          });
          sleep(1)
      }
    });


    group("Inventory Updates", () => {

      {
          let url = BASE_URL + `/api/map/inventory/updates`;
          let body = {"deviceId": deviceId, "inventory": {importRequestId: "delivery"}};
          let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
          let request = http.post(url, JSON.stringify(body), params);

          check(request, {
              "Inventory Updates": (r) => {
                if (r.status !== 201) {
                  fail(`Inventory Updates with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
              }
              return true;
              }
          });
          sleep(1)
      }

    });
}

function filesDownload(downloadUrl){
  group("File download", () => {
    if (!downloadUrl){
      fail("Download url is empty")
    }

    let params = {headers: {"Content-Type": "application/json", "Accept": "application/json"}};
    // let request = http.get(downloadUrl, params);

    const responses = http.batch([
      ['GET', changeFileExtension(downloadUrl), params],
      ['GET', downloadUrl, params],
    ]);


    check(responses[0], {
      "Download json": (r) => {
        if (r.status !== 200) {
          fail(`Download json failed with status ${r.status}. Response: ${JSON.stringify(r.body).slice(0, 100)}`);
      }
      return true;
      },

    });

    check(responses[1], {
        "Download gpkg": (r) => {
          if (r.status !== 200) {
            fail(`Download gpkg failed with status ${r.status}. Response: ${JSON.stringify(r.body).slice(0, 100)}`);
        }
        return true;
        },

    });

  });
}

function changeFileExtension(url) {
  // Check if the URL ends with .gpkg
  if (url.endsWith('.gpkg')) {
      // Replace the .gpkg with .json
      return url.slice(0, -5) + '.json';
  } else {
      // If the URL doesn't end with .gpkg, return it unchanged
      return url;
  }
}
function runHeathCheck(){
  group ("Health", () => {
    {
      let url = BASE_URL + '/api/delivery/checkHealth'
      let request = http.get(url);

      check(request, {
          "Delivery Health": (r) => {
            if (r.status !== 200) {
              fail(`Delivery Health failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
          },

      });
    }
      
    {
      let url = BASE_URL + '/api/device/checkHealth'
      let request = http.get(url);

      check(request, {
          "device Health": (r) => {
            if (r.status !== 200) {
              fail(`device Health failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
          },

      });
    }
    {
      let url = BASE_URL + '/api/offering/checkHealth'
      let request = http.get(url);

      check(request, {
          "offering Health": (r) => {
            if (r.status !== 200) {
              fail(`offering Health failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
          },

      });
    }
    {
      let url = BASE_URL + '/api/map/checkHealth'
      let request = http.get(url);

      check(request, {
          "map Health": (r) => {
            if (r.status !== 200) {
              fail(`map Health failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
          },

      });
    }
  
    sleep(1)
  });
}



export function handleSummary(data) {
  return {
    "k6-results.json": JSON.stringify(convertAndCombine(data))
  };
}

function convertAndCombine(json) {
  const combinedResult = {};

  function processGroups(groups) {
      groups.forEach(group => {
          if (group.checks && group.checks.length > 0) {
              group.checks.forEach(check => {
                  if (!combinedResult[check.name]) {
                      // Add new entry if not already present
                      combinedResult[check.name] = {
                          name: check.name,
                          path: check.path,
                          fails: check.fails,
                          passes: check.passes
                      };
                  } else {
                      // Combine fails and passes if the name already exists
                      combinedResult[check.name].fails += check.fails;
                      combinedResult[check.name].passes += check.passes;
                  }
              });
          }
          if (group.groups && group.groups.length > 0) {
              processGroups(group.groups); // Recursively process nested groups
          }
      });
  }

  if (json.root_group && json.root_group.groups) {
      processGroups(json.root_group.groups);
  }

  // Convert the combined result object into an array of objects
  return Object.values(combinedResult).map(item => ({
      name: item.name,
      path: item.path,
      success: (item.fails == 0)
  }));
}
