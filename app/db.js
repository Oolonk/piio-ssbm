
const path = require("path");
const nedb = require("@seald-io/nedb");
const EventEmitter = require('events');
var event = new EventEmitter();

var _db = [];
var _resPath = "";

function setPath(val) {
    _resPath = val;
}

async function load() {
    var promises = [];
    for (let i in _db) {
        promises.push(new Promise((resolve, reject) => {
            _db[i].loadDatabase((err) => {
                if (err) { return reject(err) }
                event.emit(i + "-ready");
                event.emit("load", i);
                resolve();
            });
        }));
    }
    await Promise.all(promises);
    event.emit("ready");
}

function add(dbName, docs) {
    return new Promise((resolve, reject) => {
        if (!dbExists(dbName)) {
            return reject(new Error(`Database ${dbName} not found`));
        }
        delete docs._id;
        _db[dbName].insert(docs, (err, newDocs) => {
            if (err)
                return reject(err);
            event.emit("changed", dbName);
            event.emit("added", dbName);
            event.emit(dbName + "-changed", [newDocs]);
            event.emit(dbName + "-added", [newDocs]);
            resolve(newDocs);
        });
    });
}

function remove(dbName, arg, noEmit) {
    noEmit = (noEmit == null ? false : noEmit);
    // currently limited to 1 at a time - TODO: make multi
    return new Promise(async (resolve, reject) => {
        if (!dbExists(dbName)) {
            return reject(new Error(`Database ${dbName} not found`));
        }

        let docs = [];

        // arg is only ID string - convert to object
        if (typeof arg != "object") {
            docs = await get(dbName, { "_id": arg });
        }

        // make sure its an array
        if (!Array.isArray(docs)) {
            docs = [docs];
        }

        if (docs.length == 0) {
            return reject(new Error(`entry in ${dbName} not found (ID was given)`));
        }

        _db[dbName].remove({ "_id": docs[0]._id }, (err, numRemoved) => {
            if (err) {
                return reject(err);
            }

            if (!noEmit) {
                event.emit("changed", dbName);
                event.emit("removed", dbName);
                event.emit(dbName + "-changed", docs);
                event.emit(dbName + "-removed", docs);
            }

            resolve(numRemoved);
        });
    });
}

function update(dbName, query, setDoc, noEmit) {
    noEmit = (noEmit == null ? false : noEmit);
    return new Promise((resolve, reject) => {
        if (!dbExists(dbName)) {
            return reject(new Error(`Database ${dbName} not found`));
        }

        if (typeof query == "string") {
            query = { "_id": query };
        }

        _db[dbName].update(query, { $set: setDoc }, { "multi": true, "returnUpdatedDocs": true }, (err, numUpdated, updatedDocs) => {
            if (err) {
                return reject(err);
            }

            if (!noEmit) {
                event.emit("changed", dbName);
                event.emit(dbName + "-changed", updatedDocs);
            }

            resolve(updatedDocs);
        });
    });
}

function get(dbName, ...args) {
    let query = args[0] || {};
    let params = args[1] || {};

    return new Promise((resolve, reject) => {
        if (!dbExists(dbName)) {
            return reject(new Error(`Database ${dbName} not found`));
        }

        if (typeof query == "string") {
            query = { "_id": query };
        }

        var c = _db[dbName].find(query);
        if (params && params.sort)
            c.sort(params.sort);
        if (params && params.page && params.limit)
            c.skip(params.page * params.limit - params.limit);
        if (params && params.limit)
            c.limit(params.limit);

        c.exec(async (err, docs) => {
            if (err) { return reject(err); }

            if (params && params.resolve && docs && docs.length > 0) {
                for (let doc of docs) {
                    doc = await resolveRelations(dbName, doc, params.resolve);
                }
            }

            resolve(docs);
        });
    });
}

function getSingle(dbName, query, params) {
    return new Promise((resolve, reject) => {
        params = params || {};
        params.limit = 1;
        get(dbName, query, params).then((data) => {
            resolve(data[0] || null);
        }).catch(reject);
    });
}

async function resolveRelations(dbName, data, level) {
    if (!dbExists(dbName)) {
        throw new Error(`Database ${dbName} not found`);
    }
    if (typeof level != "number") { level = 50; }
    level--;
    if (level <= 0) { return resolve(data); } // went too deep - quit out
    let structue = await getStruct(dbName);
    for (let row of structue) {
        if (row.type != "relation" || data[row.field] == null || data[row.field].length == 0) { continue; }
        if (row.multi) {
            if (Array.isArray(data[row.field])) {
                for (let rowFieldIdx in data[row.field]) {
                    data[row.field][rowFieldIdx] = await getSingle(row.relation, data[row.field][rowFieldIdx], { "resolve": level });
                }
            }
        } else {
            data[row.field] = await getSingle(row.relation, data[row.field], { "resolve": level });
        }
    }
    return data;
}

function getDatabaseList() {
    return Object.keys(_db);
}

/*
create new entry for database "dbName" using its structure
*/
function createStruct(dbName) {
    return new Promise(async (resolve, reject) => {
        if (!dbExists(dbName)) {
            reject(new Error(`Database ${dbName} not found`));
        }
        let docs = await get("dbstruct", { "name": dbName }, { sort: { "index": -1 } });
        var entry = { "_id": null };
        docs.forEach((field) => {
            entry[field.field] = field.default || (field.multi ? [] : "");
        });
        resolve(entry);
    });
}

async function getStruct(dbName) {
    return await get("dbstruct", { "name": dbName }, { sort: { "index": -1 } });
}

function count(dbName, query) {
    return new Promise((resolve, reject) => {
        if (!dbExists(dbName)) {
            reject(new Error(`Database ${dbName} not found`));
        }
        _db[dbName].count(query || {}).exec((err, count) => {
            if (err) { return reject(err) }
            resolve(count);
        });
    });
}

function newDb(arg) {
    if (Array.isArray(arg)) {
        return arg.forEach(dbName => newDb(dbName));
    }
    _db[arg] = new nedb({ "filename": `${_resPath}/db/${arg}` });
}

function dbExists(name) {
    return _db.hasOwnProperty(name);
}

async function action(arg) {
    switch (arg.type) {
        case "update": return await update(arg.dbName, arg.dataset._id, arg.dataset); break;
        case "insert": return await add(arg.dbName, arg.dataset); break;
        case "remove": return await remove(arg.dbName, arg.dataset); break;
    }
}



module.exports = {
    setPath: setPath,
    load: load,
    count: count,
    get: get,
    getSingle: getSingle,
    add: add,
    update: update,
    remove: remove,
    getStruct: getStruct,
    createStruct: createStruct,
    resolveRelations: resolveRelations,
    newDb: newDb,
    dbExists: dbExists,
    getDatabaseList: getDatabaseList,

    action: action,

    event: event,
    on: (...args) => event.addListener(...args),
    addListener: (...args) => event.addListener(...args),
    removeListener: (...args) => event.removeListener(...args)
};