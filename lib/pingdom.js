var console = require("console");
var https = require("https");
var util = require("util");
var log = require("./log.js");

var EventEmitter = require("events").EventEmitter;

/**

 * Pingdom
 * pingdom.ApiConnector
 	* pingdom.createConnector(options)
 	* connector.apiCall(method, callback)
 * pingdom.Monitor
 	* Event: 'statusChange'
 	* pingdom.createMonitor([connectors])
 	* monitor.addApiConnector(connector)

**/

function copyObj(obj) {
	var clone = (obj instanceof Array) ? [] : {};
	for (var i in obj) {
		if (typeof(obj[i]) === 'object')
			clone[i] = copyObj(obj[i]);
		else
			clone[i] = obj[i];
	}
	return clone;
}

function ApiConnector(options) {
	var self = this;
	this.options = options || {
		"username": "",
		"password": "",
		"app_key": ""
	};
	this.options["protocol"] = this.options["protocol"] || "https";
	this.options["host"] = this.options["host"] || "api.pingdom.com";
	this.options["port"] = this.options["port"] || 443;
	this.options["pollfreq"] = this.options["pollfreq"] || 60000;
}

exports.ApiConnector = ApiConnector;

exports.createConnector = function(options) {
	return new ApiConnector(options);
}

ApiConnector.prototype.apiCall = function(method, cb) {
	var self = this;
	log.debug("Connecting to API server: " + this.options.host + ":" + this.options.port);
	var req = require(self.options.protocol).get({
		host: self.options.host,
		port: self.options.port,
		path: "/api/2.0/" + method,
		headers: {
			"Authorization": "Basic " + new Buffer(this.options.username + ":" + this.options.password).toString("base64"),
			"App-Key": this.options.app_key,
		}
	}, function(res) {

		var buffer = "";
		var apiResponse = {
			"statusCode": res.statusCode,
			"data": "",
			"obj": null
		};
		res.addListener("data", function(chunk) {
			buffer += chunk.toString("utf8");
		});
		res.addListener("end", function() {
			//log.debug("Pingdom API response: " + util.inspect(req), 6);
			apiResponse.data = buffer;
			if (apiResponse.statusCode !== 200) {
				log.warn("Invalid API response: status code: " + apiResponse.statusCode);
			} else {
				try {
					apiResponse.obj = JSON.parse(apiResponse.data);
				} catch (e) {
					log.warn("Invalid API response: parse error: " + e);
				}
			}
			cb(apiResponse);
		});

		// Check API rate limits
		var apiLimits = self._parseRequestLimits(res.headers);
		for (var i = 0, l = apiLimits.length; i < l; i++) {
			log.debug("Pingdom API: Rate limit: " + apiLimits[i]["remaining"] + " requests remaining in the next " + apiLimits[i]["time"] + " seconds");
		}
	});

	req.end();
	return req;
}

ApiConnector.prototype._parseRequestLimits = function(headers) {

	var limits = [];
	var n;

	// Parse req-limit-short header
	n = headers['req-limit-short'].match(/[0-9]+/g);
	limits.push({
		"remaining": n[0],
		"time": n[1],
	});

	// Parse req-limit-long header
	n = headers['req-limit-long'].match(/[0-9]+/g);
	limits.push({
		"remaining": n[0],
		"time": n[1],
	});

	return limits;
}

function Monitor(connectors, statusChangeCallback) {
	this.connectors = connectors || [];

	if (statusChangeCallback) {
		this.addListener("statusChange", statusChangeCallback);
	}

	this._checkStatuses = {};
	this._queues = {};

	// Set up polling of the checks
	log.info("Setting up poller...");
	setInterval(function(self) {
		self._updateStatuses();
	}, 60000, this);
	this._updateStatuses();
}

util.inherits(Monitor, EventEmitter);
exports.Monitor = Monitor;

exports.createMonitor = function(connectors) {
	return new Monitor(connectors);
}

Monitor.prototype.addApiConnector = function(connector) {
	this.connectors.push(connector);
}

Monitor.prototype.getDownStates = function(callback) {
	var downChecks = [];
	log.debug(util.inspect(this._checkStatuses));
	for (check in this._checkStatuses) {
		if (check.status == 'down') {
			downChecks.push(check);
		}
	}
	callback(downChecks);
}

Monitor.prototype._updateStatuses = function() {
	var self = this;
	log.debug("Updating check statuses.");

	// Pingdom doesn't tell us how long a check has been down for so we need to keep track
	// of this ourselves. Here we add the 'laststatuschange' value to the check data.
	var prevCheckStatuses = copyObj(self._checkStatuses);

	for (var i = 0, l = self.connectors.length; i < l; i++) {
		this.connectors[i].apiCall("checks", function(apiResponse) {
			if (apiResponse.statusCode !== 200) {
				return false;
			}

			for (var j = 0, m = apiResponse.obj.checks.length; j < m; j++) {
				// Unique key for storing this check info
				var k = i + apiResponse.obj.checks[j].id;

				self._checkStatuses[k] = apiResponse.obj.checks[j];

				// If the check is not previously defined then it must be newly-added
				if (typeof(prevCheckStatuses[k]) !== "undefined") {

					// Determine if check has a different status compared to last time
					if (prevCheckStatuses[k].status !== self._checkStatuses[k].status) {
						self._checkStatuses[k]["laststatuschange"] = Math.round((new Date()).getTime() / 1000);
						// Add to event queue
						log.info("Check \"" + self._checkStatuses[k].name + "\" has changed status. Adding to event queue...");
						self._queue("statusChange", self._checkStatuses[k]);
					}
				} else {
					log.info("Tracking check: \"" + self._checkStatuses[k].name + "\"");
				}
			}
			self._fire("statusChange");
		});
	}
}

Monitor.prototype._queue = function(queue, data) {
	this._queues[queue] = data;
}

Monitor.prototype._fire = function(queues) {
	if (typeof(queues) === "string") {
		queues = [queues];
	}
	for (var i = 0, l = queues.length; i < l; i++) {
		if (typeof(this._queues[queues[i]]) !== "undefined") {
			log.debug("Emitting \"" + queues[i] + "\" event");
			this.emit(queues[i], this._queues[queues[i]]);
			delete(this._queues[queues[i]]);
		}
	}
}
