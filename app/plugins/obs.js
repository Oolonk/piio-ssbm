// import { OBSWebSocket } from 'obs-websocket-js';
const {OBSWebSocket} = require("obs-websocket-js");

const EventEmitter = require('events');
const watch = require('object-watcher').watch;

function Obs() {
    this.obs = new OBSWebSocket();
    this.ip = '127.0.0.1';
    this.port = 4455;
    this.password = '';
    this.event = new EventEmitter();
    this.sceneList = [];
}

Obs.prototype.on = function on(...args) {
    this.event.on(...args);
}
Obs.prototype.setIp = function setIp(ip) {
    if (ip == '' || ip == null) {
        ip = '127.0.0.1';
    }
    this.ip = ip;
    // console.log(ip);
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
        let thisObs = this;
        await this.obs.connect(`ws://${this.ip}:${this.port}`, this.password);
        // this.obs
        console.log(`Connected to OBS Websocket`);
        this.obs.on('CurrentProgramSceneChanged', function(event){
            thisObs.event.emit('CurrentSceneChanged', event.sceneName);
        });
        this.obs.on('SceneListChanged', function(value){
            thisObs.sceneList = [];
            value.scenes.forEach(function(scene){
                thisObs.sceneList.push(scene.sceneName);
            })
            setTimeout(function(){
                thisObs.event.emit('SceneListChanged', thisObs.sceneList);
            }, 20)
        });
        this.obs.on('CurrentSceneCollectionChanged', function(value1){
            thisObs.obs.call('GetSceneList').then(async (value)=>{
                thisObs.sceneList.length = 0;
                value.scenes.forEach(function(scene){
                    thisObs.sceneList.push(scene.sceneName);
                    // console.log(thisObs.sceneList);
                })
                setTimeout(function(){
                    thisObs.event.emit('SceneListChanged', thisObs.sceneList);
                }, 20)
            });
        });
        this.obs.call('GetSceneList').then((value)=>{
            // console.log(value)
            thisObs.sceneList = [];
            value.scenes.forEach(function(scene){
                // console.log(scene);
                if(scene.sceneName !== undefined){
                    thisObs.sceneList.push(scene.sceneName);
                }
            })
            // console.log(this.sceneList);
            setTimeout(function(){
                thisObs.event.emit('SceneListChanged', thisObs.sceneList);
            }, 20)
        });
        this.obs.call('GetCurrentProgramScene').then((value)=>{
            // console.log('test', value.sceneName);
            thisObs.event.emit('CurrentSceneChanged', value.sceneName);
        });
        this.obs.call('GetSceneList').then((value)=>{
            // console.log(value)
            thisObs.sceneList = [];
            value.scenes.forEach(function(scene){
                // console.log(scene);
                thisObs.sceneList.push(scene.sceneName);
            })
            // console.log(this.sceneList);
            thisObs.event.emit('SceneListChanged', this.sceneList);
        });
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
Obs.prototype.setCurrentScene = async function setCurrentScene(currentSceneName) {
    try {
        await this.obs.call('SetCurrentProgramScene', {sceneName: currentSceneName});
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}
module.exports = Obs;