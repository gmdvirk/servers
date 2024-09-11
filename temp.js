const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mysql = require('mysql2/promise');
const fetch = require('node-fetch');
const CONFIG = require('./config.json');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const port = 3001;
app.use(cors({
  origin: function(origin, callback) {
      const allowedOrigins = [
          'http://localhost:3001',
          'http://localhost:3000',
          'http://45.79.134.38:3001',
          'http://45.79.134.38:3001/servers'
          // Add other allowed origins here
      ];
      if (allowedOrigins.includes(origin) || !origin) {
          callback(null, true);
      } else {
          callback(new Error('Not allowed by CORS'));
      }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
let info={
  serverlist:[],
  timestamp:0,
}
// Path to the SQLite database file
const dbPath = path.join(__dirname, 'info.db');
// Function to write info to the database
function writeInfoToDatabase(info) {
  //console.log('Attempting to write to database:', info);
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        // Create the table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS info (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serverlist TEXT,
          timestamp INTEGER
        )`, (err) => {
          if (err) {
            console.error('Error creating table:', err);
            reject(err);
            return;
          }

          // Insert or update the info
          const stmt = db.prepare(`INSERT OR REPLACE INTO info (id, serverlist, timestamp) VALUES (1, ?, ?)`);
          stmt.run(JSON.stringify(info.serverlist), info.timestamp, (err) => {
            if (err) {
              console.error('Error inserting data:', err);
              reject(err);
            } else {
              //console.log('Data written successfully');
              resolve();
            }
          });
          stmt.finalize();
        });
      });

      db.close();
    });
  });
}
function getEpochTimestampInSeconds(dateString) {
  return Math.floor(new Date(dateString).getTime() / 1000);
}

function readInfoFromDatabase() {
  //console.log('Attempting to read from database');
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        // Create the table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS info (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          serverlist TEXT,
          timestamp INTEGER
        )`, (err) => {
          if (err) {
            console.error('Error creating table:', err);
            db.close();
            reject(err);
            return;
          }

          // Now try to read the data
          db.get(`SELECT serverlist, timestamp FROM info WHERE id = 1`, (err, row) => {
            if (err) {
              console.error('Error reading data:', err);
              reject(err);
            } else if (row) {
              //console.log('Data read successfully:', row);
              resolve({
                serverlist: JSON.parse(row.serverlist),
                timestamp: row.timestamp
              });
            } else {
              //console.log('No data found, returning default values');
              resolve({
                serverlist: [],
                timestamp: 0
              });
            }
            db.close();
          });
        });
      });
    });
  });
}
async function processServerEvent(serverData, obj) {
  const { ...eventData } = serverData;
  const host = obj.ipv4[0];
  const { Eventnum, BadgeId, ReaderId, Eventtype, Timestamp } = serverData;
  let tempdbconfig = { ...CONFIG.mysqlconnection, host: obj.ipv4[0] };
  
  if (!host) {
    return { error: 'Host is required in the request body' };
  }

  const url = `http://${host}/api/events/createEvent`;
  let connection;

  try {
    connection = await mysql.createConnection(tempdbconfig);

    // First, create the event
    const response = await axios.post(url, eventData, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Get the maximum ID
    const [maxIdResult] = await connection.query('SELECT MAX(iId) as maxId FROM events');
    const maxId = maxIdResult[0].maxId;

    // Get all rows between maxId - 1000 and maxId
    const query = `
      SELECT * FROM events
      WHERE iId > ?
      ORDER BY iId DESC
    `;
    const [results] = await connection.query(query, [Math.max(1, maxId - 1000)]);
// console.log(results)
    // Filter the results
    const index = results.filter(
      (obj) =>
        obj.vEvent_type == Eventtype &&
        obj.vBadge_serial == BadgeId &&
        obj.vReader_serial == ReaderId &&
        obj.iEvent_num == Eventnum &&
        isWithin15Minutes(getCurrentEpochTimestamp(),getEpochTimestampInSeconds(obj.dCreated_at))
    );
    return [...index];
  } catch (error) {
    console.error('Error in processServerEvent:',error);
    return [];
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
app.post('/api/checkEvent', async (req, res) => {
  const data = {
    Eventnum: 0,
    BadgeId: "10",
    ReaderId: "10",
    Eventtype: 22,
    Timestamp: getCurrentEpochTimestamp()
  };
  const {Eventnum,
    BadgeId,
    ReaderId,
    Eventtype,
    Timestamp}=data
    const {host}=req.body
    let tempdbconfig=CONFIG.mysqlconnection
    tempdbconfig.host=host
    const connection = await mysql.createConnection(tempdbconfig);
  
  try {
    const query = `
      SELECT * FROM events
      ORDER BY iId DESC
      LIMIT 1000
    `;
   
    const [results] = await connection.query(query); // Use promise-based query
    const index=results.filter((obj)=>obj.vEvent_type==Eventtype&&obj.vBadge_serial==BadgeId&&obj.vReader_serial==ReaderId&&obj.iEvent_num==Eventnum)
    res.json(index);
  } catch (error) {
    res.status(500).send(error.message);
  } finally {
    await connection.end();
  }
});
app.get('/api/getList', async (req, res) => {
try{
// res.status(200).json(info)
readInfoFromDatabase()
    .then(info => {
      //console.log('Info read from database:', info);
      res.status(200).json(info)
      // Use the info object here
    })
    .catch(err => {
      console.error('Error reading from database:', err);
      // Handle the error, maybe set info to default values
      info = {
        serverlist: [],
        timestamp: 0
      };
    });
}catch(e){
  res.status(200).json([])
}
  
});
async function checkGlobalEvent (serverData, obj) {
  const { Eventnum, BadgeId, ReaderId, Eventtype, Timestamp } = serverData;
  let tempdbconfig = { ...CONFIG.mysqlconnection, host: obj.ipv4[0] };
  let  connection=null
  
  try {
    connection = await mysql.createConnection(tempdbconfig);
    // Get the maximum ID// Get the maximum ID
    const [maxIdResult] = await connection.query('SELECT MAX(iId) as maxId FROM events');
    const maxId = maxIdResult[0].maxId;

    // Get all rows between maxId - 1000 and maxId
    const query = `
      SELECT * FROM events
      WHERE iId > ?
      ORDER BY iId DESC
    `;
    const [results] = await connection.query(query, [Math.max(1, maxId - 1000)]);
    const index=results.filter((obj)=>obj.vEvent_type==Eventtype && 
    isWithin60Minutes(getCurrentEpochTimestamp(),getEpochTimestampInSeconds(obj.dCreated_at)))
    return index
  } catch (error) {
    return []
  } finally {
    if(connection){
      await connection.end();
    }
    
  }
}
async function rebootglobal(){
//console.log("Print Globally")
}
async function reboot(rebootdata){
  const { hostId,linodeId } = rebootdata;
  const url = `https://${hostId}/v4/linode/instances/${linodeId}/reboot`;
  
  const options = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${CONFIG.token}`
    }
  };

try{
  fetch(url, options)
  .then((res) => {
    res.json()})
  .then((json) => {
    // //console.log(json)
    return json;
  })
  .catch(err => console.error('error:' + err));
}catch(e){
  return e.message;
}
}
  async function sendDiscordMessage(descorddata){
    const { message, webhookUrl, threadId } = descorddata;
  
    if (!message || !webhookUrl) {
      return 'Message and webhook URL are required' ;
    }
  
    const data = {
      content: message
    };
  
    let url = webhookUrl;
  
    // If threadId is provided, append it to the webhook URL
    if (threadId) {
      url = `${webhookUrl}?thread_id=${threadId}`;
    }
  
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
  
      if (response.ok) {
        return 'Message sent to Discord' ;
      } else {
        const errorData = await response.json();
        return 'Error in sending Message to Discord' ;
       
      }
    } catch (error) {
      console.error('Error sending message to Discord:', error);
      return 'Internal server error' 
    }
  }
  function getCurrentEpochTimestamp() {
    // Create a new date object
    const date = new Date();
    
    // Convert to UTC and get the offset for New York (Eastern Time)
    const options = { timeZone: 'America/New_York', hour12: false };
    
    // Format the date to ISO string (UTC format) and convert to Unix Timestamp (seconds)
    const usaTime = new Date(date.toLocaleString('en-US', options));
    const timestamp = Math.floor(usaTime.getTime() / 1000);
    
    return timestamp;
  }
  function getUSATimestamp() {
    return Math.floor(Date.now() / 1000);
  }
  function isWithin15Minutes(timestamp1, timestamp2) {
    const differenceInSeconds = Math.abs(timestamp1 - timestamp2);
    const fifteenMinutesInSeconds = 15 * 60; // 15 minutes * 60 seconds
    return differenceInSeconds <= fifteenMinutesInSeconds;
  }
  function isWithin60Minutes(timestamp1, timestamp2) {
    const differenceInSeconds = Math.abs(timestamp1 - timestamp2);
    const fifteenMinutesInSeconds = 60 * 60; // 15 minutes * 60 seconds
    return differenceInSeconds <= fifteenMinutesInSeconds;
  }
  function isWithin601Minutes(timestamp1, timestamp2) {
    const differenceInSeconds = Math.abs(timestamp1 - timestamp2);
    const fifteenMinutesInSeconds = 60 * 60; // 15 minutes * 60 seconds
    return differenceInSeconds - fifteenMinutesInSeconds;
  }
  function containsUnderscore(label) {
    return label.includes('_');
}
let allmeassages=[]
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function sendDiscordMessagesWithDelay() {
  for (const obj of allmeassages) {
    await sendDiscordMessage(obj);
    await delay(10000); // Wait for 10 seconds
  }
}
 async function checkserverstatus() {
    let data=CONFIG.testpacketconfig
    data.Timestamp= getCurrentEpochTimestamp()
    let data1=CONFIG.globaltestpacketconfig
    data.Timestamp= getCurrentEpochTimestamp()
    readInfoFromDatabase()
    .then((info1) => {
      //console.log('Info read from database:', info);
      // Use the info object here
      info=info1
    })
    .catch(err => {
      console.error('Error reading from database:', err);
      // Handle the error, maybe set info to default values
      info = {
        serverlist: [],
        timestamp: 0
      };
    });
    if(info.serverlist.length===0 || info.timestamp===0|| !(isWithin15Minutes(getCurrentEpochTimestamp(),info.timestamp))){

      const url = 'https://api.linode.com/v4/linode/instances?page=1&page_size=100';
      const options = {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${CONFIG.token}`
        }
      };
      try{
        fetch(url, options)
        .then(res => res.json())
        .then(async(json) => {
          let userData=json

    let tempdata=[]
    for(let i=0;i<userData.data.length;i++){
      if(userData.data[i].status=="running"&&(!containsUnderscore(userData.data[i].label))){
      userData.data[i].check="pending"
      let tempindex=info.serverlist.findIndex((obj)=>obj.id===userData.data[i].id)
      if(tempindex!==-1){
        userData.data[i].laststartup=info.serverlist[tempindex].laststartup

      }else{
        userData.data[i].laststartup=0
      }
        tempdata.push(userData.data[i])
        
      }
    }
        info.serverlist=tempdata;
        info.timestamp=getCurrentEpochTimestamp()
        allmeassages.length=0
        let globalcheck=true
          for(let i=0;i<info.serverlist.length;i++){
            let resultglobal=await checkGlobalEvent(data1,info.serverlist[i])
            if(resultglobal.length>0){
              i=info.serverlist.length
              globalcheck=false
            }
          }
          if(globalcheck){
            rebootglobal()
            allmeassages.push({...CONFIG.descordconfig,message:`No server responded for the global test packet`})
          }else{
            allmeassages.push({...CONFIG.descordconfig,message:`Global Test packet was received successfully from the servers`})
          }
      
        const serverChecks = info.serverlist.map(async (obj, index) => {
          let result = await processServerEvent(data, obj);
          if (result.length === 0) {
            info.serverlist[index].check = "no response";
            allmeassages.push({...CONFIG.descordconfig, message: `Host ip ${obj.ipv4[0]} and Label : ${obj.label} didn't respond to test packet.`});
            if (!(isWithin60Minutes(obj.laststartup, getCurrentEpochTimestamp()))) {
              info.serverlist[index].laststartup = getCurrentEpochTimestamp();
             
              await reboot({hostId: obj.ipv4[0], linodeId: obj.id});
            }
          } else {
            info.serverlist[index].check = "success";
            allmeassages.push({...CONFIG.descordconfig, message: `Host ip ${obj.ipv4[0]} and Label : ${obj.label} responded successfully to test packet.`});
          }
        });
    
        // Wait for all server checks to complete
        await Promise.all(serverChecks);
    
        writeInfoToDatabase(info)
        .then(() => {
          console.log('Info written to database')
          }
          )
        .catch(err => console.error('Error writing to database:', err));
        await sendDiscordMessagesWithDelay();
        })
        .catch(err => console.error('error:' + err));
      }catch(e){

      }
    }
  } 
  function scheduleServerStatusCheck() {
    checkserverstatus();
    //console.log("Server status checked at:", new Date().toISOString());
  }
  
  const FIFTEEN_MINUTES = 15 * 60 * 1000; // 15 minutes in milliseconds
  
  // Start the periodic check
  setInterval(scheduleServerStatusCheck, FIFTEEN_MINUTES);
  
  // Also run it immediately on startup
  scheduleServerStatusCheck();
  app.use(express.static(path.join(__dirname, './client/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './client/build', 'index.html'));
});
  app.listen(port, () => {
  //console.log(`Server running on http://localhost:${port}`);
});
