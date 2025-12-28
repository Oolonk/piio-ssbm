const nedb = require('@seald-io/nedb');
const path = require('path');
const fs = require('fs');
const fse = require('fs-extra');

const exeName = path.basename(process.execPath);

let resFolder, appFolder, userDataFolder, settingsDb;

let defaultSettings = {
    fixedStreamQueue: false,
    autoupdate: false,
    fixedSidebar: true,
    autoupdateThreshold: 500,
    autoscore: false
};

let dbStruct = [
    { "name": "player", "field": "name", "type": "text", "index": -1 },
    { "name": "player", "field": "country", "type": "relation", "relation": "country", "index": -4 },
    { "name": "player", "field": "region", "type": "relation", "relation": "region", "index": -4 },
    { "name": "player", "field": "city", "type": "text" },
    { "name": "player", "field": "firstname", "type": "text", "index": -2 },
    { "name": "player", "field": "lastname", "type": "text", "index": -3 },
    { "name": "player", "field": "birthday", "type": "date", "listhide": true },
    { "name": "player", "field": "pronoun", "type": "text", "listhide": true },
    { "name": "player", "field": "smashgg", "type": "number" },
    { "name": "player", "field": "parrygg", "type": "text" },
    { "name": "player", "field": "twitter", "type": "text" },
    { "name": "player", "field": "twitch", "type": "text", "index": -4 },
    { "name": "player", "field": "steam", "type": "text", "listhide": true },
    { "name": "player", "field": "slippicode", "type": "text" },
    { "name": "player", "field": "bluesky", "type": "text" },
    { "name": "player", "field": "team", "type": "relation", "relation": "team", "multi": true },
    { "name": "player", "field": "pride", "type": "relation", "relation": "pride", "multi": true },
    { "name": "team", "field": "name", "index": -1, "type": "text" },
    { "name": "team", "field": "shorten", "index": -2, "type": "text" },
    { "name": "team", "field": "prefix", "index": -3, "type": "text" },
    { "name": "team", "field": "website", "index": -4, "type": "text" },
    { "name": "team", "field": "delimiter", "type": "text", "default": " | ", "index": -4 },
    { "name": "team", "field": "regex", "type": "text", "index": -4 },
    { "name": "team", "field": "backgroundcolor", "type": "color", "index": -4 },
    { "name": "team", "field": "textcolor", "type": "color", "index": -4 },
    { "name": "country", "field": "name", "index": -1, "type": "text" },
    { "name": "country", "field": "continent", "index": -2, "type": "text" },
    { "name": "country", "field": "nation", "type": "relation", "relation": "country", "multi": null, "index": -2 },
    { "name": "game", "field": "videogameId", "type": "number", "index": -3 },
    { "name": "game", "field": "name", "type": "text", "index": -1 },
    { "name": "game", "field": "shorten", "type": "text", "index": -2 },
    { "name": "character", "field": "name", "type": "text", "relation": null, "multi": null },
    { "name": "character", "field": "shorten", "type": "text", "relation": null, "multi": null },
    { "name": "character", "field": "skins", "type": "text", "multi": true },
    { "name": "character", "field": "slippiId", "type": "number", "relation": null, "multi": null },
    { "name": "character", "field": "game", "type": "relation", "relation": "game", "multi": null },
    { "name": "pride", "field": "name", "index": -1, "type": "text" },
    { "name": "pride", "field": "color", "type": "color", "index": -4 },
    { "name": "region", "field": "name", "index": -1, "type": "text" },
    { "name": "region", "field": "country", "index": -2, "type": "relation", "relation": "country",  },
    { "name": "region", "field": "shortcode", "index": -3, "type": "text" },
];


async function ensure(res, root, userData) {
    resFolder = res;
    appFolder = root;
    userDataFolder = userData;

    defaultSettings.resPath = resFolder;

    await folder();
    await settings();
    await database();
    await theme();
}

async function theme() {
    return new Promise((resolve, reject) => {
        fs.access(path.join(resFolder, 'themes', 'default', 'manifest.json'), fs.constants.F_OK, (err) => {
            if (!err) {
                console.log("default theme exists");
                return resolve();
            }
            console.log("default theme missing");
            fse.copySync(path.join(appFolder, 'themes', 'default'), path.join(resFolder, 'themes', 'default'), { overwrite: true });
            resolve();
        });
    });
}

async function database() {
    var dbstructDB = new nedb({ filename: path.join(resFolder, 'db', 'dbstruct'), autoload: true });

    // check for row count in db struct - if not equal, redo that db

    await new Promise((resolve, reject) => {
        dbstructDB.count({}, (err, rowCount) => {
            if (!err && rowCount == dbStruct.length) {
                return resolve();
            }
            dbstructDB.remove({}, { multi: true }, () => {
                dbstructDB.insert(dbStruct, resolve);
            });
        });
    });
}

async function settings() {
    settingsDb = new nedb({ filename: path.join(userDataFolder, 'settings.db'), autoload: true });
    for (let key in defaultSettings) {
        await settingsEntry(key, defaultSettings[key]);
    }
}

function settingsEntry(name, value) {
    return new Promise((resolve, reject) => {
        settingsDb.findOne({ "name": name }, (err, doc) => {
            if (doc == null) {
                settingsDb.insert({ "name": name, "value": value }, resolve);
            } else {
                resolve(err, doc);
            }
        });
    });
}

async function folder() {
    fse.ensureDirSync(resFolder);
    fse.ensureDirSync(path.join(resFolder, 'db'));
    fse.ensureDirSync(path.join(resFolder, 'logs'));
    fse.ensureDirSync(path.join(resFolder, 'themes'));
    fse.ensureDirSync(path.join(resFolder, 'assets'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'character'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'country'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'pride'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'game'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'team'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'player'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'region'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'player', 'avatar'));
    fse.ensureDirSync(path.join(resFolder, 'assets', 'player', 'photo'));
}


module.exports = ensure;