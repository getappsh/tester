import http from "k6/http";
import { group, check, sleep, fail } from "k6";
import exec from 'k6/execution';

export const options = {
    thresholds: {
      checks: [{threshold: 'rate>0.99', abortOnFail: true}], 
    },
    scenarios: {
        one_iteration: {
            executor: 'per-vu-iterations',
            vus: 1, // One virtual user
            iterations: 1, // One iteration 1
        },
    },
};

const random = () => Math.floor(Math.random() * 10)

  


let authToken;
const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";


export default function(){
  runTest()

}

export function runTest(){
  if (!authToken || exec.vu.iterationInScenario === 0){
    login();
  }

  const projectId = createProject();

  const {version, catalogId} = createRelease(projectId);
  createReleaseArtifact(projectId, version);
  getRelease(projectId, version);

  discovery(catalogId);

  deleteProject(projectId);


}

export function teardown(data) {
  login();
  let projects = searchProjects("k6-test");
  console.log(`Tear down: Found ${projects.length} projects to delete`);``
  for (let i = 0; i < projects.length; i++) {
    deleteProject(projects[i].id);
  }
}

function discovery(catalogId){
  group("Discovery", () => {
  
    let url = BASE_URL + `/api/v2/device/discover/component`;
    let body = {"discoveryType":"get-app","general":{"personalDevice":{"name":"user-1","idNumber":"idNumber-123","personalNumber":"personalNumber-123"},"situationalDevice":{"weather":23,"bandwidth":30,"time": new Date(),"operativeState":true,"power":94,"location":{"lat":"33.4","long":"23.3","alt":"344"}},"physicalDevice":{"OS":"android","MAC":"00-B0-D0-63-C2-26","IP":"129.2.3.4","ID": "k6","serialNumber":"k6-serial","possibleBandwidth":"Yes","availableStorage":"38142328832"}},"softwareData":{"formations": [],"platforms": ['k6']}};
    let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
    let response = http.post(url, JSON.stringify(body), params);

    check(response, {
        "Discovery": (r) => {
          if (r.status !== 201) {
            fail(`Discovery failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          let offer = r.json('offer');
          console.log(`Offering: ${JSON.stringify(offer)}`);

          if (offer.some(o => o.id == catalogId) == false){
            fail(`Offering dose not contain catalogId: ${catalogId}. Response: ${JSON.stringify(r.body)}`);
          }

          return true;
        }
    });
    
  });
}


function createRelease(projectId){
  let version = "2.3.5";
  let catalogId;
  group("Release", () => {
    let url = BASE_URL + `/api/v1/releases/project/${projectId}`;

    let body = {"version": version, 'isDraft': false};
    let params = {
      headers: {
          "Content-Type": "application/json", "Accept": "application/json",  "Authorization": `Bearer ${authToken}`
      }
    };

    let response = http.post(url, JSON.stringify(body), params);

    check(response, {
        "Create Release": (r) => {
          if (r.status !== 201) {
            fail(`Create Release failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
        }
    });
    catalogId = response.json("id");
    console.log("Release CatalogId:", catalogId)
    console.log("Release Version:", version)

  });
  return {version, catalogId}
}

function createReleaseArtifact(projectId, version){
  group("Release", () => {
    let url = BASE_URL + `/api/v1/releases/project/${projectId}/version/${version}/artifact`;

    let body = {artifactName: 'k6-image:${version}', dockerImageUrl: 'k6.sh/k6-image:${version}', type: 'docker_image', isInstallationFile: true};
    let params = {
      headers: {
          "Content-Type": "application/json", "Accept": "application/json",  "Authorization": `Bearer ${authToken}`
      }
    };

    let response = http.post(url, JSON.stringify(body), params);

    check(response, {
        "Create Release Artifact": (r) => {
          if (r.status !== 201) {
            fail(`Create Release Artifact failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
        }
    });
  })
    sleep(5);
}

function getRelease(projectId, version){
  group("Release", () => {
    let url = BASE_URL + `/api/v1/releases/project/${projectId}/version/${version}`;

    let params = {
      headers: {
          "Content-Type": "application/json", "Accept": "application/json",  "Authorization": `Bearer ${authToken}`
      }
    };

    let response = http.get(url, params);

    check(response, {
        "Get Release": (r) => {
          if (r.status !== 200) {
            fail(`Get Release failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          const status = r.json("status");
          console.log(`Release status: ${status}`);
          if (status !== "released"){
            fail(`Release is not released. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
        }
    });
  })  
}


function createProject(){
  let projectId;
  group("Project", () => {
    let url = BASE_URL + `/api/v1/project`;
    let body = {"name": `K6-Test-${random()}${random()}${random()}`, "description": "k6 tests", "projectType": "product", "platforms": ["k6"]};
    let params = {
        headers: {
            "Content-Type": "application/json", "Accept": "application/json",  "Authorization": `Bearer ${authToken}`
        }
    };
    let response = http.post(url, JSON.stringify(body), params);

    check(response, {
        "Create Project": (r) => {
          if (r.status !== 201) {
            fail(`Create Project failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
        }
    });
    projectId = response.json("id");
    console.log("Project Id:", projectId)

  });          

  return projectId
}

function deleteProject(projectId){

  group("Project", () => {
    
    let url = BASE_URL + `/api/v1/project/${projectId}`;
    let params = {
      headers: {
         "Authorization": `Bearer ${authToken}`
      }
    };
    let response = http.del(url, null, params);

    check(response, {
        "Delete Project": (r) => {
          if (r.status !== 200) {
            fail(`Delete Project failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
        }
    });
            
  })
}

function searchProjects(query){
  let projects;
  group("Project", () => {

    let perPage = '1000';
    let page = '1';
    let type = 'product';
    let status = 'active'; 

    let params = {
      headers: {
          "Content-Type": "application/json", "Accept": "application/json",  "Authorization": `Bearer ${authToken}`
      }
    };
    
    let url = BASE_URL + `/api/v1/project/search?query=${query}&status=${status}&type=${type}&page=${page}&perPage=${perPage}`;
    let response = http.get(url, params);

    check(response, {
        "Search Projects": (r) => {
          if (r.status !== 200) {
            fail(`Search Projects failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
          }
          return true;
        }
    });
     
    projects = response.json("data");
  });

  return projects
}


function login(){
  group("Login", () => {
    {
        let url = BASE_URL + `/api/login`;
        // TODO: edit the parameters of the request body.
        const username = __ENV.USER_NAME || "k6@getapp.sh";
        const password = __ENV.USER_PASSWORD;

        let body = {"username": username, "password": password};
        let params = {headers: {"Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${authToken}`}};
        let response = http.post(url, JSON.stringify(body), params);

        check(response, {
            "Login": (r) => {
              if (r.status !== 201) {
                fail(`Login failed with status ${r.status}. Response: ${JSON.stringify(r.body)}`);
            }
            return true;
            }
        });
        authToken = response.json("accessToken"); // Assuming token is returned in the response
        // console.log("Received token:", authToken); // Print the token
    }
  });
}