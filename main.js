const fs = require('fs');
const https = require('https');
const ical = require('node-ical');
const google = require('./googleAuth.js');

if(!fs.existsSync('config.json')){
  console.log('No config file found');
  return false;
}
let {workURL,googleURL,description,name} = JSON.parse(fs.readFileSync('config.json'))

let workIcs = '_work.ics'
let googleIcs = '_google.ics'

//Parse Date Function
let ds = function(date){
    let az = function(v){
        return v<10 ? '0'+v : v ;
    }
    let d = new Date(date);
    let x = `${az(d.getFullYear())}-${az(d.getMonth()+1)}-${az(d.getDate())}`
    return x
};    

//Download FIle Function
async function downloadFile (url, targetFile) {  
    return await new Promise((resolve, reject) => {
      https.get(url, response => {
        const code = response.statusCode ?? 0
  
        if (code >= 400) {
          return reject(new Error(response.statusMessage))
        }
  
        // handle redirects
        if (code > 300 && code < 400 && !!response.headers.location) {
          return resolve(
            downloadFile(response.headers.location, targetFile)
          )
        }
  
        // save the file to disk
        const fileWriter = fs
          .createWriteStream(targetFile)
          .on('finish', () => {
            resolve({})
          })
  
        response.pipe(fileWriter)
      }).on('error', error => {
        reject(error)
      })
    })
  }

let main = async function(){
    //Download ICS files
    await downloadFile(workURL, workIcs);
    await downloadFile(googleURL, googleIcs);

    //Parse Google Calender Data and sort
    let googleRaw = ical.sync.parseFile(googleIcs);
    let googleEvents = []
    for (const event of Object.values(googleRaw)) {
        googleEvents.push({
            event:event.summary,
            start:event.start,
            end: event.end
        })
    };

    //Parse Work Calender Data and sort
    let workRaw = ical.sync.parseFile(workIcs);
    let workEvents = []
    for (const event of Object.values(workRaw)) {
        if(event.summary && event.summary.indexOf(name) !== -1){
            workEvents.push({
            event:event.summary,
            start:event.start,
            end: event.end
        })
    }
    };

    //If Starting Date and Event String Matches from both calenders, don't bother uploading
    let pushEvents = [];
    for(let e = 0; e < workEvents.length; e++){
        let found = undefined;

        let wstart = (ds(workEvents[e].start))

        for(let i = 0; i < googleEvents.length; i++){
            let gstart = (ds(googleEvents[i].start))

            if(googleEvents[i].event === workEvents[e].event && wstart === gstart){
                found = true;
            }
        }

        if(!found){
            pushEvents.push(workEvents[e]);
        }
    }

    //Push up Work events to Google Calender
    for(let i = 0; i < pushEvents.length; i++){
        console.log('Creating... ' + pushEvents[i].event + ' ' + ds(pushEvents[i].start))
        let event = {
            summary: pushEvents[i].event,
            description:description,
            start: {
              date:  ds(pushEvents[i].start)
            },
            end:{
                date: ds(pushEvents[i].end)
            }
        }
        await google.insertEvent(event)
    };
    
}
main();