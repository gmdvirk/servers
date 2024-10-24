const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mysql = require('mysql2/promise');
const mysqlCallback = require('mysql2');
const fetch = require('node-fetch');
const Config = require('./config.json');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = 3001;

const tokenConfig = {token : Config.token};
const dbConfig = Config.mysqlconnection;
const descordConfig = Config.descordconfig;
const globalServer=Config.globalserver;
app.use(cors({
  origin: true,  // Allows requests from all origins
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
let info={
  serverlist:[],
  timestamp:0,
}
let logs=[]
let logsglobal=[]
// Path to the SQLite database file
const dbPath = path.join(__dirname, 'info.db');
// Function to write info to the database
function writeInfoToDatabase(info) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
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

          const stmt = db.prepare(`INSERT OR REPLACE INTO info (id, serverlist, timestamp) VALUES (1, ?, ?)`);
          const serverlistJSON = JSON.stringify(info.serverlist.map(server => ({
            ...server,
            lastcheckid: parseInt(server.lastcheckid) || 0
          })));
          
          stmt.run(serverlistJSON, info.timestamp, (err) => {
            if (err) {
              console.error('Error inserting data:', err);
              reject(err);
            } else {
              console.log('Data written successfully');
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
function resetLogsTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        db.run(`DROP TABLE IF EXISTS logs`, (err) => {
          if (err) {
            console.error('Error dropping table:', err);
            reject(err);
            return;
          }

          db.run(`CREATE TABLE logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT,
            type TEXT,
            time TEXT
          )`, (err) => {
            if (err) {
              console.error('Error creating table:', err);
              reject(err);
            } else {
              console.log('Logs table reset successfully');
              resolve();
            }
          });
        });
      });

      db.close();
    });
  });
}
function resetGlobalLogsTable() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        db.run(`DROP TABLE IF EXISTS globallogs`, (err) => {
          if (err) {
            console.error('Error dropping table:', err);
            reject(err);
            return;
          }

          db.run(`CREATE TABLE globallogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message TEXT,
            type TEXT,
            time TEXT
          )`, (err) => {
            if (err) {
              console.error('Error creating table:', err);
              reject(err);
            } else {
              console.log('Logs table reset successfully');
              resolve();
            }
          });
        });
      });

      db.close();
    });
  });
}
app.post('/api/reset-logs', async (req, res) => {
  try {
    await resetLogsTable();
    res.status(200).json({ message: 'Logs table reset successfully' });
  } catch (err) {
    console.error('Error resetting logs table:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/api/reset-globallogs', async (req, res) => {
  try {
    await resetGlobalLogsTable();
    res.status(200).json({ message: 'Global Logs table reset successfully' });
  } catch (err) {
    console.error('Error resetting logs table:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
function writeLogsToDatabase(logDataArray) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message TEXT,
          type TEXT,
          time TEXT
        )`, (err) => {
          if (err) {
            console.error('Error creating table:', err);
            reject(err);
            return;
          }

          const stmt = db.prepare(`INSERT INTO logs (message, type, time) VALUES (?, ?, ?)`);

          logDataArray.forEach(logData => {
            stmt.run(logData.message, logData.type, logData.time, (err) => {
              if (err) {
                console.error('Error inserting data:', err);
                reject(err);
              } else {
                console.log('Log data written successfully');
              }
            });
          });

          stmt.finalize((err) => {
            if (err) {
              console.error('Error finalizing statement:', err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });

      db.close();
    });
  });
}
function readLogsFromDatabase(limit = 150, offset = 0) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
          if (err) {
            console.error('Error reading data:', err);
            reject(err);
          } else {
            const logs = rows.map(row => ({
              message: row.message,
              type: row.type,
              time: row.time
            }));
            resolve(logs);
          }
        });
      });

      db.close();
    });
  });
}
app.get('/api/logs', async (req, res) => {
  try {
    const logs = await readLogsFromDatabase();
    res.status(200).json(logs);
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
function writeGlobalLogsToDatabase(logDataArray) {
  console.log(logDataArray)
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS globallogs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message TEXT,
          type TEXT,
          time TEXT
        )`, (err) => {
          if (err) {
            console.error('Error creating table:', err);
            reject(err);
            return;
          }

          const stmt = db.prepare(`INSERT INTO globallogs (message, type, time) VALUES (?, ?, ?)`);

          logDataArray.forEach(logData => {
            stmt.run(logData.message, logData.type, logData.time, (err) => {
              if (err) {
                console.error('Error inserting data:', err);
                reject(err);
              } else {
                console.log('Log data written successfully');
              }
            });
          });

          stmt.finalize((err) => {
            if (err) {
              console.error('Error finalizing statement:', err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });

      db.close();
    });
  });
}
function readGlobalLogsFromDatabase(limit = 150, offset = 0) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }

      db.serialize(() => {
        db.all(`SELECT * FROM globallogs ORDER BY id DESC LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
          if (err) {
            console.error('Error reading data:', err);
            reject(err);
          } else {
            const logs = rows.map(row => ({
              message: row.message,
              type: row.type,
              time: row.time
            }));
            resolve(logs);
          }
        });
      });

      db.close();
    });
  });
}
app.get('/api/globallogs', async (req, res) => {
  try {
    const logs = await readGlobalLogsFromDatabase();
    res.status(200).json(logs);
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/api/rebootserver', async (req, res) => {
  try {
    let data={hostId: req.body.ipv4[0], linodeId: req.body.id,label:req.body.label,type:"website"}
    await reboot(data);
    res.status(200).json({Status:true,Message:"Successfully rebooted"});
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ Status:false,error: 'Internal server error' });
  }
});
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
  let tempdbconfig = { ...dbConfig, host: obj.ipv4[0] };
  
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
        obj.iEvent_num == Eventnum 
        // && isWithin15Minutes(getCurrentEpochTimestamp(),getEpochTimestampInSeconds(obj.dCreated_at))
    );
// console.log(index)
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
app.post('/api/rebootall', async (req, res) => {
  try{
    const tempdescordcong={webhookUrl:descordConfig.webhookUrl,threadId:descordConfig.failurethreadId}
    await sendDiscordMessage({...tempdescordcong,message:"Reboot for : all servers applied throught the website"})
    logs.push({message:"Reboot for : all servers applied throught the website",type:"retry",time: getFormattedDate()})
    const serverChecks = info.serverlist.map(async (obj, index) => {
          info.serverlist[index].laststartup = getCurrentEpochTimestamp();
          await reboot({hostId: obj.ipv4[0], linodeId: obj.id,label:obj.label,type:"child"});
    });

    // Wait for all server checks to complete
    await Promise.all(serverChecks);
    res.status(200).json({message:"Done"})
  }catch(e){
    res.status(200).json([])
  }
    
  });
app.get('/api/getGlobal', async (req, res) => {
  let total=[]
  
  const data1 = Config.globaltestpacketconfig
  for(let i=0;i<info.serverlist.length;i++){
    let resultglobal=await checkGlobalEvent(data1,info.serverlist[i])
    total=[...total,...resultglobal]
  }
  res.status(200).json(total)
})
async function checkGlobalEvent (serverData, obj) {
  const { Eventtype } = serverData;
  let tempdbconfig = { ...dbConfig, host: obj.ipv4[0] };
  let lastid=obj.globalcheckid
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
    const higestid=getObjectWithHighestIdGlobal(results)
    const index=results.filter((obj)=>obj.vEvent_type==Eventtype
     && obj.iId>lastid
  )
    return index
  } catch (error) {
    return []
  } finally {
    if(connection){
      await connection.end();
    }
    
  }
}
function getFormattedDate() {
  const now = new Date();
  return now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone: 'America/New_York'  // Adjust this to your preferred timezone
  });
}
async function reboot(rebootdata){
  const { hostId,linodeId,type } = rebootdata;
  const tempdescordcong={webhookUrl:descordConfig.webhookUrl,threadId:descordConfig.failurethreadId}
  if(type==="website"){
    logs.push({message:"Reboot for : "+rebootdata.label +" applied throught he website",type:"retry",time: getFormattedDate()})
    await sendDiscordMessage({...tempdescordcong,message:"Reboot for : "+rebootdata.label +" applied throught the website"})
  }
  const url = `https://${hostId}/v4/linode/instances/${linodeId}/reboot`;
  
  const options = {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${tokenConfig.token}`
    }
  };

  fetch(url, options)
  .then((res) => {
    res.json()})
  .then(async(json) => {
    if(type==="global"){
      await sendDiscordMessage({...tempdescordcong,message:"Successfully rebooted Globally for : " + rebootdata.label})
      logsglobal.push({message:"Successfully rebooted Globally for : " + rebootdata.label,type:"retry successful",time: getFormattedDate()})
    }else if(type==="website"){
      logs.push({message:"Successfully rebooted for : " +rebootdata.label +" applied throught he website",type:"retry successful",time: getFormattedDate()})
    await sendDiscordMessage({...tempdescordcong,message:"Successfully rebooted for : " +rebootdata.label +" applied throught he website"}) 
    }
    else{
      await sendDiscordMessage({...tempdescordcong,message:"Successfully rebooted for : " + rebootdata.label})
      logs.push({message:"Successfully rebooted for : " + rebootdata.label,type:"retry successful",time: getFormattedDate()})
    }
  
    return json;
  })
  .catch(async(err) => {
    console.error( err.message)
    if(type==="global"){
    await sendDiscordMessage({...tempdescordcong,message:"Error in rebooting Globally for : "+rebootdata.label+" : "+err.message})
    logsglobal.push({message:"Error in rebooting Globally for : "+rebootdata.label+" : "+err.message,type:"retry failed",time: getFormattedDate()})
    }else if(type==="website"){
      logs.push({message:"Error in rebooting for : "+rebootdata.label+" : "+err.message,type:"retry failed",time: getFormattedDate()})
      await sendDiscordMessage({...tempdescordcong,message:"Error in rebooting for : "+rebootdata.label+" : "+err.message})   
    }
    else{
     await sendDiscordMessage({...tempdescordcong,message:"Error in rebooting for : "+rebootdata.label+" : "+err.message})
      logs.push({message:"Error in rebooting for : "+rebootdata.label+" : "+err.message,type:"retry failed",time: getFormattedDate()})
    }
    return err.message;
  });

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
  function containsUnderscore(label) {
    return label.includes('_');
}
let allmeassages=[]

let allmeassagesglobal=[]
let count =0;
let globalcount =0
let successCount = 0;
let totalAttempts = 0;
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
async function sendDiscordMessagesWithDelay() {
  for (const obj of allmeassages) {
    await sendDiscordMessage(obj);
    await delay(10000); // Wait for 10 seconds
  }
  allmeassages.length=0;
}
async function sendDiscordMessagesWithDelayforGlobal() {
  for (const obj of allmeassagesglobal) {
    await sendDiscordMessage(obj);
    await delay(10000); // Wait for 10 seconds
  }
  allmeassagesglobal.length=0;
}
async function sendDiscordMessagesTotalAttempts() {
    await sendDiscordMessage({
      webhookUrl: descordConfig.webhookUrl,
      threadId: descordConfig.threadId,
      message: `${successCount} attempts succeeded out of ${totalAttempts} attempts`
    });
    logs.push({  message: `${successCount} attempts succeeded out of ${totalAttempts} attempts`,type:"total",time: getFormattedDate()})
    successCount = 0;
    totalAttempts = 0;
}
function getObjectWithHighestIdGlobal(arr) {
  if (arr.length === 0) return null; // Return null if the array is empty

  return arr.reduce((maxObj, currentObj) => {
    return currentObj.iId > maxObj.iId ? currentObj : maxObj;
  });
}
function getObjectWithHighestId(arr) {
  if (arr.length === 0) return null; // Return null if the array is empty

  return arr.reduce((maxObj, currentObj) => {
    return currentObj.iId > maxObj.iId ? currentObj : maxObj;
  });
}

 async function checkserverstatus() {
  const data = Config.testpacketconfig
    const data1 = Config.globaltestpacketconfig
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
          authorization: `Bearer ${tokenConfig.token}`
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
        userData.data[i].lastcheckid=info.serverlist[tempindex].lastcheckid
        userData.data[i].globalcheckid=0
        
      }else{
        userData.data[i].laststartup=0
        userData.data[i].lastcheckid=0
        userData.data[i].globalcheckid=0
      }
        tempdata.push(userData.data[i])
      }
    }
        info.serverlist=tempdata;
        info.timestamp=getCurrentEpochTimestamp()
        // allmeassages.length=0
        let globalcheck=true
        let countglobalevent=0
        if(count===5){
          globalcount=0;
          for(let i=0;i<info.serverlist.length;i++){
            let resultglobal=await checkGlobalEvent(data1,info.serverlist[i])
            if(resultglobal.length>0){
              const higestid=getObjectWithHighestIdGlobal(resultglobal)
              countglobalevent =+ resultglobal.length
              info.serverlist[i].globalcheckid=higestid
              globalcheck=false
            }
          }
          if(countglobalevent<1){
            const tempdescordcong={webhookUrl:descordConfig.webhookUrl,threadId:descordConfig.failurethreadId}
            await reboot({hostId: globalServer.hostid, linodeId: globalServer.id,label:globalServer.label,type:"global"});
            allmeassagesglobal.push({...tempdescordcong,message:"Got : "+countglobalevent +" from all the servers for global server test packet."})
            logsglobal.push({message:"Got : "+countglobalevent +" from all the servers for global server test packet.",type:"total",time: getFormattedDate()})
          }else{
            const tempdescordcong={webhookUrl:descordConfig.webhookUrl,threadId:descordConfig.threadId}
            allmeassagesglobal.push({...tempdescordcong,message:"Got : "+countglobalevent +" from all the servers for global server test packet."})
            logsglobal.push({message:"Got : "+countglobalevent +" from all the servers for global server test packet.",type:"total",time: getFormattedDate()})
          }
          
        }
        globalcount++;
        const serverChecks = info.serverlist.map(async (obj, index) => {
          let result = await processServerEvent(data, obj);
          const id=getObjectWithHighestId(result)

          if (result.length === 0 || (obj.lastcheckid && obj.lastcheckid>=id.iId)) {
            const tempdescordcong={webhookUrl:descordConfig.webhookUrl,threadId:descordConfig.failurethreadId}
            allmeassages.push({...tempdescordcong, message: `Server with Label : ${obj.label} didn't respond to test packet.`});
            logs.push({message: `Server with Label : ${obj.label} didn't respond to test packet.`,type:"no response",time: getFormattedDate()})
            if (!(isWithin60Minutes(obj.laststartup, getCurrentEpochTimestamp()))) {
              info.serverlist[index].laststartup = getCurrentEpochTimestamp();
              allmeassages.push({...tempdescordcong,message:"Reboot for : "+obj.label +" applied"})
              logs.push({message:"Reboot for : "+obj.label +" applied",type:"retry",time: getFormattedDate()})
              await reboot({hostId: obj.ipv4[0], linodeId: obj.id,label:obj.label,type:"child"});
              totalAttempts++;
            }
          } else {
            info.serverlist[index].check = "success";
            info.serverlist[index].lastcheckid=id.iId
            successCount++
            totalAttempts++
         
          }
        });
    
        // Wait for all server checks to complete
        await Promise.all(serverChecks);
        try {
          await writeInfoToDatabase(info);
          if(count == 5){
            await sendDiscordMessagesTotalAttempts();
            count =0;
          }
          count ++;
        } catch (err) {
          console.error('Error writing to JSON file:', err);
        }
        writeLogsToDatabase(logs)
        .then(() => {
         console.log("All log messages stored successfully");
        
            logs.length=0
         })
          .catch((err) => {
           console.error("Error storing log messages:", err);
          });
          writeGlobalLogsToDatabase(logsglobal)
          .then(() => {
            console.log("All globallog messages stored successfully");
           
            logsglobal.length=0
            })
             .catch((err) => {
              console.error("Error storing globallog messages:", err);
             });
        await sendDiscordMessagesWithDelayforGlobal();
        await sendDiscordMessagesWithDelay();
        await delay(300000); // 5 minutes in milliseconds
        })
        .catch(err => console.error('error:' + err));
      }catch(e){

      }
    }
  } 
  function scheduleServerStatusCheck() {
    checkserverstatus();
  }
  
  const FIFTEEN_MINUTES = 2 * 60 * 1000; // 15 minutes in milliseconds
  
  // Start the periodic check
  setInterval(scheduleServerStatusCheck, FIFTEEN_MINUTES);
  
  // Also run it immediately on startup
  scheduleServerStatusCheck();
  app.use(express.static(path.join(__dirname, './client/build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, './client/build', 'index.html'));
});
  app.listen(port, () => {
});
