class Countdown {
	constructor() {
		this._due = null;
		this._visible = true;
		this._margin = 7200000; // 2 hours in ms 
	}
	get String() {
		let arr = [];
		let c = this.Components;
		if (c.h != "00")
			arr.push(c.h);
		if (c.m != "00" || c.h != "00")
			arr.push(c.m);
		arr.push(c.s);
		return arr.join(":");
	}
	get LongString() {
		let arr = [];
		let c = this.Components;
		if (c.h != "00")
			arr.push(c.h);
		arr.push(c.m);
		arr.push(c.s);
		return arr.join(":");
	}
	get FullString() {
		let c = this.Components;
		return c.h + ":" + c.m + ":" + c.s;
	}
	get Components() {
		let s = Math.ceil(this.Value / 1000);
		let m = Math.floor(s / 60);
		let h = Math.floor(m / 60);
		s = s % 60;
		m = m % 60;
		h = (h < 10 ? '0' + h : h).toString();
		m = (m < 10 ? '0' + m : m).toString();
		s = (s < 10 ? '0' + s : s).toString();
		return { s: s, m: m, h: h };
	}
	get Value() {
		if (this.isPast)
			return 0;
		return this._due.getTime() - new Date().getTime();
	}
	get isVisible() {
		return this._visible && this.isFuture;
	}
	set Visible(state) {
		this._visible = state;
	}
	set Due(value) {
		let now = new Date();
		if (typeof value == "string") { // local date/time string
			let timeArr = value.split(":");
			value = (timeArr[0] || "00") + ":" + (timeArr[1] || "00") + ":" + (timeArr[2] || "00");
			value = new Date(now.getFullYear() + "-" + (now.getMonth() + 1) + "-" + now.getDate() + " " + value);
			if (now > value)
				value.setDate(value.getDate() + 1);
		}
		if (typeof value == "number") // unix timestamp
			value = new Date(value);
		if (value instanceof Date)
			this._due = value;
	}
	get Due() {
		return this._due;
	}
	get isPast() {
		return this._due < new Date();
	}
	get isFuture() {
		return this._due > new Date();
	}
}