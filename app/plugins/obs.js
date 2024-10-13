// import { OBSWebSocket } from 'obs-websocket-js';
const {OBSWebSocket} = require("obs-websocket-js");

const EventEmitter = require('events');
const watch = require('object-watcher').watch;

function Obs() {
    this.obs = new OBSWebSocket();
    this.ip = '127.0.0.1';
    this.port = 4455;
    this.password = '';
}

Obs.prototype.on = function on(...args) {
    this.event.on(...args);
}
Obs.prototype.setIp = function setIp(ip) {
    if (ip == '' || ip == null) {
        ip = '127.0.0.1';
    }
    this.ip = ip;
    console.log(ip);
}
Obs.prototype.setPort = function setPort(port) {
    if (port == null) {
        port = 4455;
    }
    this.port = port;
}
Obs.prototype.setPassword = function setPassword(password) {
    this.password = password;
}
Obs.prototype.startObs = async function startObs() {
    try {
        await this.obs.connect(`ws://${this.ip}:${this.port}`, this.password);
        this.obs
        console.log(`Connected to OBS Websocket`);
        return true;
    } catch (error) {
        console.log(`Couldn't connect to OBS Websocket`);
        console.error(error);
        return false;
    }
}
Obs.prototype.stopObs = async function stopObs() {
    try {
        await this.obs.disconnect();
        console.log('Disconnected from OBS Websocket')
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}
module.exports = Obs;