/* --exclude-from-all */

class DBWrapper {
	constructor(path) {
		this.nedb = require("@seald-io/nedb");
		this.fs = require("fs");
		this._callbacks = { on: {}, once: {}, any: [] };
		this.db = {};
		this.path = path || ".";

	}

	async load() {
		let promises = [];
		for (let i in this.db) {
			promises.push(new Promise((resolve, reject) => {


				if (this.db[i].inMemoryOnly) {
					this.fs.readFile(this.db[i].filename, 'utf8', (err, data) => {
						if (err)
							return reject(err);
						//console.log("filename data", data);


						try {
							let treatedData = this.db[i].persistence.treatRawData(data);
						} catch (e) {
							return reject(e);
						}

						// Recreate all indexes in the datafile
						Object.keys(treatedData.indexes).forEach(function (key) {
							this.db[i].indexes[key] = new Index(treatedData.indexes[key]);
						});

						// Fill cached database (i.e. all indexes) with data
						try {
							this.db[i].resetIndexes(treatedData.data);
						} catch (e) {
							this.db[i].resetIndexes();   // Rollback any index which didn't fail
							return reject(e);
						}
						resolve();
					});

				} else {
					this.db[i].loadDatabase(err => {
						if (err)
							return reject(err);
						resolve();
						this.emit(i + "-ready");
						this.emit("load", i);
					});
				}
			}));
		}
		await Promise.all(promises);
		this.emit("ready");
	}

	reload(dbName) {
		return new Promise((resolve, reject) => {
			console.log("reload", dbName);
			if (this.db.hasOwnProperty(dbName)) {
				if (this.db[dbName].inMemoryOnly) {
					this.fs.readFile(this.db[dbName].filename, 'utf8', (err, data) => {
						if (err)
							return reject(err);
						//console.log("filename data", data);


						try {
							let treatedData = this.db[dbName].persistence.treatRawData(data);
						} catch (e) {
							return reject(e);
						}

						// Recreate all indexes in the datafile
						Object.keys(treatedData.indexes).forEach(function (key) {
							this.db[dbName].indexes[key] = new Index(treatedData.indexes[key]);
						});

						// Fill cached database (i.e. all indexes) with data
						try {
							this.db[dbName].resetIndexes(treatedData.data);
						} catch (e) {
							this.db[dbName].resetIndexes();   // Rollback any index which didn't fail
							return reject(e);
						}
						resolve();
					});

				} else {
					this.db[dbName].loadDatabase(err => {
						if (err)
							return reject(err);
						resolve();
						this.emit(dbName + "-ready");
						this.emit("load", dbName);
					});
				}
			}
		});
	}

	add(dbName, docs) {
		return new Promise((resolve, reject) => {
			if (!this.db.hasOwnProperty(dbName)) {
				return reject("Database not found");
			}
			delete docs._id;
			this.db[dbName].insert(docs, (err, newDocs) => {
				if (err)
					return reject(err);
				resolve();
				this.emit("changed", dbName);
				this.emit("added", dbName);
				this.emit(dbName + "-changed", [newDocs]);
				this.emit(dbName + "-added", [newDocs]);
			});
		});
	}

	remove(dbName, doc) {
		return new Promise((resolve, reject) => {
			if (!this.db.hasOwnProperty(dbName))
				return reject("Database not found");

			let promise;
			if (typeof doc != "object") {
				promise = this.get(dbName, { _id: doc });
			} else {
				promise = Promise.resolve([doc]);
			}
			promise.then(doc => {
				console.log("after promise.then", doc);
				if (doc.length == 0)
					return reject("player not found (ID given)");

				this.db[dbName].remove({ _id: doc[0]._id }, (err, numRemoved) => {
					if (err)
						return reject(err);
					resolve(numRemoved);
					this.emit("changed", dbName);
					this.emit("removed", dbName);
					this.emit(dbName + "-changed", doc);
					this.emit(dbName + "-removed", doc);
				});
			});
		});
	}

	update(dbName, query, setDoc, noEmit) {
		noEmit = noEmit || false;
		return new Promise((resolve, reject) => {
			if (!this.db.hasOwnProperty(dbName)) {
				return reject("Database not found");
			}
			if (typeof query == "string") {
				query = { "_id": query };
			}
			this.db[dbName].update(query, { $set: setDoc }, { multi: true, returnUpdatedDocs: true }, (err, numUpdated, updatedDocs) => {
				if (err)
					return reject(err);
				resolve(updatedDocs);
				if (!noEmit) {
					this.emit("changed", dbName);
					this.emit(dbName + "-changed", updatedDocs);
				}
			});
		});
	}

	get(dbName, query, assignPrototype, params) {
		if (typeof query == "function") {
			assignPrototype = query;
			query = null;
		}
		return new Promise((resolve, reject) => {
			if (!this.db.hasOwnProperty(dbName)) {
				return reject("Database not found");
			}
			if (typeof query == "string") {
				query = { "_id": query };
			}
			let c = this.db[dbName].find(query || {});
			if (params && params.sort)
				c.sort(params.sort);
			if (params && params.page && params.limit)
				c.skip(params.page * params.limit - params.limit);
			if (params && params.limit)
				c.limit(params.limit);

			c.exec(async (err, docs) => {
				if (err) { return reject(err); }

				if (assignPrototype != null) {
					docs = this.assignPrototype(docs, assignPrototype);
				}
				if (params && params.resolve && docs && docs.length > 0) {
					for (let doc of docs) {
						doc = await this.resolveRelations(dbName, doc, params.resolve);
					}
				}

				resolve(docs);
			});
		});
	}

	getSingle(dbName, query, assignPrototype, params) {
		return new Promise((resolve, reject) => {
			if (!query) { return reject("Parameter 2 (query) is required"); }
			params = params || {};
			params.limit = 1;
			this.get(dbName, query, assignPrototype, params).then((data) => {
				resolve(data[0] || null)
			}).catch(reject);
		});
	}

	resolveRelations(dbName, data, level) {
		return new Promise(async (resolve, reject) => {
			if (typeof level != "number") { level = 50; }
			level--;
			if (level <= 0) { return resolve(data); } // went too deep - quit out
			let structue = await this.getStruct(dbName);
			for (let row of structue) {
				if (row.type != "relation" || data[row.field] == null || data[row.field].length == 0) { continue; }
				if (row.multi) {
					if (Array.isArray(data[row.field])) {
						for (let rowFieldIdx in data[row.field]) {
							data[row.field][rowFieldIdx] = await this.getSingle(row.relation, data[row.field][rowFieldIdx], null, { "resolve": level });
						}
					}
				} else {
					data[row.field] = await this.getSingle(row.relation, data[row.field], null, { "resolve": level });
				}
			}
			resolve(data);
		});
	}

	createStruct(dbName) {
		return new Promise((resolve, reject) => {
			if (!this.db["dbstruct"]) {
				return reject("Database 'dbstruct' not loaded");
			}
			this.get("dbstruct", { "name": dbName }, null, { sort: { "index": -1 } }).then(docs => {
				let entry = { _id: null };
				docs.forEach((field) => {
					entry[field.field] = field.default || (field.multi ? [] : "");
				});
				resolve(entry);
			}).catch(reject);
		});
	}

	getStruct(dbName) {
		return new Promise((resolve, reject) => {
			if (!this.db["dbstruct"]) {
				return reject("Database 'dbstruct' not loaded");
			}
			this.get("dbstruct", { "name": dbName }, null, { sort: { "index": -1 } }).then(resolve).catch(reject);
		});
	}

	count(dbName, query) {
		return new Promise((resolve, reject) => {
			if (!this.db.hasOwnProperty(dbName))
				return reject("Database not found");
			this.db[dbName].count(query || {}).exec((err, count) => {
				if (err)
					return reject(err);
				resolve(count);
			});
		});
	}

	assignPrototype(docs, proto) {
		for (let i in docs) {
			if (proto.length == 1) {
				docs[i] = new proto(docs[i]);
			} else {
				docs[i].__proto__ = proto.prototype;
			}
		}
		return docs;
	}
	newDb(name, inMemoryOnly) {
		inMemoryOnly = inMemoryOnly || false;
		if (Array.isArray(name)) {
			name.forEach(dbName => this.newDb(dbName, inMemoryOnly));
			return;
		}
		this.db[name] = new this.nedb({ filename: this.path + '/db/' + name, inMemoryOnly: inMemoryOnly });
	}

	dbExists(name) {
		return this.db.hasOwnProperty(name);
	}

	action(arg) {
		switch (arg.type) {
			case "update": return this.update(arg.dbName, arg.dataset._id, arg.dataset); break;
			case "insert": return this.add(arg.dbName, arg.dataset); break;
			case "remove": return this.remove(arg.dbName, arg.dataset); break;
		}
	}

	on(name, callback) {
		if (Array.isArray(name)) {
			name.forEach(val => this.on(val, callback));
		} else {
			if (callback == undefined) {
				this._callbacks.any.push(name); // name is callback
			} else {
				if (!this._callbacks.on.hasOwnProperty(name)) {
					this._callbacks.on[name] = [];
				}
				this._callbacks.on[name].push(callback);
			}
		}
	}

	once(name, callback) {
		if (Array.isArray(name)) {
			name.forEach(val => this.once(val, callback));
		} else {
			if (!this._callbacks.once.hasOwnProperty(name))
				this._callbacks.once[name] = [];
			this._callbacks.once[name].push(callback);
		}
	}

	emit(name, data) {
		this._callbacks.any.forEach(cb => cb(name, data));
		if (this._callbacks.on.hasOwnProperty(name)) {
			this._callbacks.on[name].forEach(cb => cb(data));
		}
		if (this._callbacks.once.hasOwnProperty(name)) {
			this._callbacks.once[name].forEach(cb => cb(data));
			this._callbacks.once[name] = [];
		}
	}

}