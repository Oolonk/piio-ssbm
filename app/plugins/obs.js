// import { OBSWebSocket } from 'obs-websocket-js';
const { OBSWebSocket } = require("obs-websocket-js");

const EventEmitter = require('events');
const watch = require('object-watcher').watch;

function Obs(){
    this.obs = new OBSWebSocket();
    this.ip = '127.0.0.1';
    this.port = 4455;
    this.password = '';
}

Obs.prototype.on = function on(...args) {
    this.event.on(...args);
}
Obs.prototype.setIp = function setIp(ip){
    this.ip = ip;
}
Obs.prototype.setPort = function setPort(port){
    this.port = port;
}
Obs.prototype.setPassword = function setPassword(password){
    this.password = password;
}
Obs.prototype.startObs = async function startObs() {
    await this.obs.connect(`ws://${this.ip}:${this.port}`, password);
    try {
        await this.obs.connect(`ws://${this.ip}:${this.port}`, password);
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
    try{
        await this.obs.disconnect();
        return true;
    }
    catch (error){
        console.error(error);
        return false;
    }
}
module.exports = Obs;