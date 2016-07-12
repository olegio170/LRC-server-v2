const WebSocketServer = require('ws').Server;
const log = require('./modules/log.js');
const lrcreader = require('./modules/lrcdata-reader.js');
const tools = require('./modules/tools.js');
const datahandler = require('./modules/data-handler.js');

var clients = [];

var wsServer = new WebSocketServer({ port: 8080 });
log.info('Server is runing');

wsServer.on('connection', onConnection);

function onConnection(ws) {
    log.info('Client connected');

    //If noAuth in 60 sec close connection
    setTimeout(function() {
        if(clients[ws] == undefined){
            ws.close();
        }
    },60000);

    ws.on('message' , function onMessage(message, flags) {
        if(flags['binary']){
            parseBinaryMessage(message);
        }
        else {
            parseJSONMessage(message);
        }
    });

    ws.on('close' , function onClose () {
        if (clients[ws] != undefined) {
            log.info('Conection closed id ' + clients[ws]['id']);
            delete clients[ws];
        }
        log.info('Conection closed client unauthorized');
    });

    //On binary message
    function parseBinaryMessage(message) {
        if (clients[ws] == undefined) {
            log.error('Binary message from unauthorized user. Disconnecting.');
            ws.close();
            return;
        }

        // Parse binary data from client into object
        var lrcdata = lrcreader.read(message);

        // Skip binary message if cannot parse data into object
        if (!lrcdata.ok) {
            log.error('Can\'t parse LRCData');
            return;
        }

        // Save parsed data into database
        datahandler.saveData(clients[ws].id, lrcdata);
    }

    //On json message
    function parseJSONMessage(message) {
        var jsonObj = {};

        try {
            jsonObj = JSON.parse(message);
            log.info('[Client]' + message);
        }
        catch(err) {
            log.error('Can\'t parse json' + err);
            return;
        }

        //check for valid
        if(jsonObj.name == undefined || jsonObj.data == undefined) {
            log.error('Json is not valid');
            return;
        }

        switch(jsonObj.name) {
            //On client request uid
            case 'get-uid':
                var uid = tools.newUID();
                ws.send('uid:' + uid);
                break;
            case 'set-uid':
                if(clients[ws] == undefined) {
                    datahandler.getUserId(ws,jsonObj.data,authClient);
                }
                break;
            default:
                ws.close();
                break;
        }
    }

    //Add user to clients array
    function authClient (userId, sha256) {
        if(!userId) {
            return;
        }
        clients[ws] = {
            id:userId,
            sha256:sha256
        };

        ws.send('inf:uid-accepted');
    }
}






