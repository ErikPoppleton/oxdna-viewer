/// <reference path="../typescript_definitions/index.d.ts" />
/// <reference path="../typescript_definitions/oxView.d.ts" />
/// <reference path="./relax_scenarios.ts" />



// make sure local storage contains the relevant key 
if (window.localStorage.getItem("oxServeIps") === null){
    window.localStorage.setItem("oxServeIps","");   
}

function openConnections() {
    const node = document.getElementById("serverList");
    node.textContent = ''; // clear list before construction 
    let val = window.localStorage.getItem("oxServeIps") ;
    let lst : string[];
    lst = val ? val.split(',') : [] ;
    //console.log(lst);
    lst.forEach(    
        (element,id) => {
            if (element !== ""){
                node.innerHTML += `<p id="oxIP${id}">`;
                node.innerHTML += `<button id="oxIP${id}_1" style="width: 40px; height:30px;" onclick="deleteOXServeCon(${id})" title="Delete entry">x</button> `;
                node.innerHTML += `<button id="oxIP${id}_2"style="width: 40px; height:30px;" onclick="establishConnection(${id})" title="Establish connection">►</button>`;
                node.innerHTML += `<label  id="oxIP${id}_3" for="oxIP${id}_1">${element}</label></p>`;
            } 
        });
            
    //make sure the previous connection is killed before adding a new one  
    if(socket){
        socket.close();
    }
    view.toggleModal('socketConnections');
}


function deleteOXServeCon(id){
    (document.getElementById(`oxIP${id}_3`) as HTMLSelectElement).remove();
    (document.getElementById(`oxIP${id}_2`) as HTMLSelectElement).remove();
    (document.getElementById(`oxIP${id}_1`) as HTMLSelectElement).remove();
    let lst = window.localStorage.oxServeIps.split(',');
    lst.splice(id, 1);
    window.localStorage.setItem("oxServeIps",lst);
}


function addOXServeURL(){
    let host = (document.getElementById("newHostText") as HTMLSelectElement).value;//= window.sessionStorage.inboxingOption ;
    let lst = window.localStorage.oxServeIps.split(',');
    
    if (host !== "ws://some_host"){
        lst.push(host);    
        window.localStorage.setItem("oxServeIps",lst);
        const node = document.getElementById("serverList");
        node.innerHTML += `<p id="oxIP${lst.length -1}>`;
        node.innerHTML += `<button id="oxIP${lst.length -1}_1" style="width: 40px; height:30px;" onclick="deleteOXServeCon(${lst.length-1})" title="Delete entry">x</button> `;
        node.innerHTML += `<button id="oxIP${lst.length -1}_2"style="width: 40px; height:30px;" onclick="establishConnection(${lst.length-1})" title="Establish connection">►</button>`;
        node.innerHTML += `<label  id="oxIP${lst.length -1}_3" for="oxIP$${lst.length}_1">${host}</label></p>`; 
        (document.getElementById("newHostText") as HTMLSelectElement).innerText =  "";
    }

}





class OXServeSocket extends WebSocket{
    constructor(url : string){
        super(url);
    }
    onmessage = (response) => {
        let message = JSON.parse(response.data);
        if ("console_log" in message){
            console.log(message["console_log"]);
        }
        if ("dat_file" in message) {
            let lines = message["dat_file"].split("\n");
            lines =  lines.slice(3) // discard the header
            let system = systems[systems.length-1];
            let numNuc: number = system.systemLength(); //gets # of nuc in system
            let currentNucleotide: BasicElement,
            l: string[];
            for (let lineNum = 0; lineNum < numNuc; lineNum++) {
                currentNucleotide = elements.get(systems[systems.length-1].globalStartId+lineNum);
                // consume a new line
                l = lines[lineNum].split(" ");
                currentNucleotide.calculateNewConfigPositions(l);
            }
    
        system.backbone.geometry["attributes"].instanceOffset.needsUpdate = true;
        system.nucleoside.geometry["attributes"].instanceOffset.needsUpdate = true;
        system.nucleoside.geometry["attributes"].instanceRotation.needsUpdate = true;
        system.connector.geometry["attributes"].instanceOffset.needsUpdate = true;
        system.connector.geometry["attributes"].instanceRotation.needsUpdate = true;
        system.bbconnector.geometry["attributes"].instanceOffset.needsUpdate = true;
        system.bbconnector.geometry["attributes"].instanceRotation.needsUpdate = true;
        system.bbconnector.geometry["attributes"].instanceScale.needsUpdate = true;
        system.dummyBackbone.geometry["attributes"].instanceOffset.needsUpdate = true;
        
        centerAndPBC();
        render();
        }
    };


    onopen = (resonse) => {
        console.log(resonse);
        let connect_button =  (document.getElementById("btnConnect") as HTMLSelectElement);
        connect_button.style.backgroundColor = "green";
        connect_button.textContent = "Connected!"
        view.toggleModal('socketConnections');
    }

    onclose = (resonse) => {
        let connect_button =  (document.getElementById("btnConnect") as HTMLSelectElement);
        connect_button.style.backgroundColor = "";
        connect_button.textContent = "Connect to oxServe";
        notify("lost oxServe Connection");
    }

    
    stop_simulation = () =>{
        this.send("abort");
    }

    start_simulation = () => {
        trap_objs.forEach((obj)=>{
            if(obj.type === "mutual_trap"){
                scene.children.pop();
                scene.children.pop();
            }
        });
        trap_objs = [];

        let reorganized, counts, conf = {};
        {
            let {a, b, file_name, file} = makeTopFile(name);
            reorganized = a;
            counts = b;
            conf["top_file"] = file;
        }
        {
            let {file_name, file} = makeDatFile(name, reorganized);
            conf["dat_file"] = file;	
        }
        if (ANMs.length > 0) {
            let {file_name, file} = makeParFile(name, reorganized, counts);
            conf["par_file"] = file;
        }

        conf["settings"] = {};
        let sim_type = "";
        let backend = (document.getElementsByName("relaxBackend") as NodeListOf<HTMLInputElement>);
        for(let i = 0; i < backend.length; i++) { 
                  
            if(backend[i].type="radio") { 
              
                if(backend[i].checked) 
                     sim_type = backend[i].value;  
            } 
        } 
        console.log(`Simulation type is ${sim_type}`);
        let settings_list = relax_scenarios[sim_type];

        if(trap_file){
            conf["trap_file"] = trap_file;
        }

        //set all var fields 
        for (let [key, value] of Object.entries(settings_list["var"])) {
            
            conf["settings"][key] = (document.getElementById(value["id"]) as HTMLInputElement).value;
            if(key === "T") conf["settings"][key] += "C";
        }  
        
        //set all const fields 
        for (let [key, value] of Object.entries(settings_list["const"])) {
            conf["settings"][key] = value["val"];    
        }
        
        this.send(
            JSON.stringify(conf)
        );
    }
}


let socket : OXServeSocket;
function establishConnection(id){
    let url = window.localStorage.getItem("oxServeIps").split(",")[id];
    socket = new OXServeSocket(url);   

}
