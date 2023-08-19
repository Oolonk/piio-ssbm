/* --exclude-from-all */


class Trigger {
	constructor() {
		this.instances = [];
		this.handlers = [];
		this.delay = 0;
	}



	bind(instance) {
		console.log(instance);
		let instanceName = instance.__proto__.constructor.NAME;
		this.instances.push({ "name": instanceName, "instance": instance });
		instance.on((name, data) => this.triggerHandlers(instanceName, name, data));
	}

	triggerHandlers(instance, event, data) {
		this.handlers.forEach(handler => {
			if (handler.enabled && handler.instance == instance && handler.event == event) {
				console.log(handler.eventData, data);

				let matchList = handler.eventData.split(",");
				let matchSucceed = true;
				matchList.forEach(match => {
					["==", "!=", "<", ">", "<=", ">="].forEach(op => {
						if (match.indexOf(op) !== -1) {
							let parts = match.split(op);
							let res = eval('"' + data[parts[0]] + '" ' + op + ' "' + parts[1] + '"');
							if (!res)
								matchSucceed = false;
						}
					});
				});
				if (matchSucceed) {
					for (let i in this.instances) {
						if (this.instances[i].name == handler.dest) {
							this.instances[i].instance.cmd(handler.cmd);
						}
					}
				}


			}
		});
	}

}

class TriggerHandler {
	constructor() {
		this.enabled = true;
		this.instance = "";
		this.event = "";
		this.dest = "";
		this.cmd = "";
		this.eventData = "";
		this.delay = 0;
	}



}

