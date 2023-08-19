

HTMLElement.prototype.insertValueResize = function (customParams) {
	let self = this;
	this.animationTimeout = this.animationTimeout || 0;
	this.watchTimeout = this.watchTimeout || 0;
	this.watchValue = this.clientWidth;
	this.savedValue = this.savedValue || "";
	// define default params
	let params = {
		value: "",
		child: null,
		fadeOut: null,
		fadeIn: null,
		crashPrevention: 100,
		visibleClass: null,
		hiddenClass: "hidden",
		classMirror: "",
		callback: null,
		watchResize: true
	};

	// override default params
	if (typeof (customParams) != "object") {
		params.value = String(customParams);
	} else {
		for (let index in customParams) {
			params[index] = customParams[index];
		}
	}



	this.style.whiteSpace = "nowrap";
	if (this.watchTimeout)
		clearTimeout(this.watchTimeout);
	if (params.watchResize) {
		this.watchTimeout = setInterval(() => {
			if (this.watchValue != this.clientWidth) {
				this.watchValue = this.clientWidth;
				_resize(true);
			}
		}, 1000);
	}

	_resize(false);

	function _resize(boxResize) {
		if (self.savedValue == params.value && !boxResize)
			return;
		self.savedValue = params.value;
		let inner = self.querySelector("* > " + params.child);
		if (!inner) {
			inner = self.firstElementChild;
		}

		let mirror = params.classMirror ? document.querySelector(params.classMirror) : null;

		if (!params.child && !inner) {
			self.appendChild(document.createElement("span"));
			inner = self.firstElementChild;
		}
		if (!inner) {
			console.error(params.child + " Element missing");
			self.innerHTML = '<span style="color:#f00">this > ' + params.child + ' Element missing</span>';
			return;
		}

		if (getComputedStyle(inner, null).display != "inline-block")
			inner.style.display = "inline-block";

		if (params.visibleClass && params.visibleClass.length > 0) {
			self.classList.remove(params.visibleClass);
			if (mirror)
				mirror.classList.remove(params.visibleClass);
		}
		if (params.hiddenClass && params.hiddenClass.length > 0) {
			self.classList.add(params.hiddenClass);
			if (mirror)
				mirror.classList.add(params.hiddenClass);
		}

		if (self.animationTimeout)
			clearTimeout(self.animationTimeout);

		if (typeof (params.callback) == "function") params.callback(1); // status callback

		self.animationTimeout = setTimeout(() => {
			if (typeof (params.callback) == "function") params.callback(2); // status callback
			inner.innerHTML = params.value;
			let style = window.getComputedStyle(self, null).getPropertyValue('font-size');
			let fontSize = parseFloat(style);
			inner.style.fontSize = fontSize + "px";
			self.animationTimeout = setTimeout(() => {
				if (typeof (params.callback) == "function") params.callback(3); // status callback
				let crashPreventionCounter = 0;
				while (inner.clientWidth > self.clientWidth) {
					inner.style.fontSize = fontSize-- + "px";
					crashPreventionCounter++;
					if (crashPreventionCounter > params.crashPrevention) {
						console.error("insertValueResize looped infinitly - cancel");
						console.error(params);
						break;
					}
				}
				if (params.visibleClass && params.visibleClass.length > 0 && params.value.toString().length > 0) {
					self.classList.add(params.visibleClass);
					if (mirror)
						mirror.classList.add(params.visibleClass);
				}
				if (params.hiddenClass && params.hiddenClass.length > 0 && params.value.toString().length > 0) {
					self.classList.remove(params.hiddenClass);
					if (mirror)
						mirror.classList.remove(params.hiddenClass);
				}
				self.animationTimeout = setTimeout(() => {
					if (typeof (params.callback) == "function") params.callback(4); // status callback
				}, params.fadeIn || getFadeDuration());
			}, 10);
		}, params.fadeOut || getFadeDuration());
	}

	function getFadeDuration() {
		let val = window.getComputedStyle(self).transitionDuration;
		if (val == "0s")
			val = window.getComputedStyle(self.firstElementChild).transitionDuration;
		val = val.substr(0, val.length - 1);
		val = parseFloat(val);
		val = parseInt(val * 1000);
		return val;
	}

};