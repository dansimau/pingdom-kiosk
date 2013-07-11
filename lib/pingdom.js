var https = require('https');
var util = require('util');
var log = require('./log.js');
var extend = require('./extend.js');
var EventEmitter = require('events').EventEmitter;

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
	this.options = extend({
		'name': '',
		'username': '',
		'password': '',
		'app_key': '',
		'include':[],
		'exclude':[],
		'status': true,
		'protocol': 'https',
		'host':'api.pingdom.com',
		'port': 443,
		'pollfreq':60000
	}, options);
}

exports.ApiConnector = ApiConnector;

exports.createConnector = function(options) {
	return new ApiConnector(options);
};

ApiConnector.prototype.apiCall = function(method, cb) {
	var self = this;
	log.debug('Account \''+self.options.name+'\' connecting to API server: ' + this.options.host + ':' + this.options.port);
	var req = require(self.options.protocol).get({
			host: self.options.host,
			port: self.options.port,
			path: '/api/2.0/' + method,
			headers: {
				'Authorization': 'Basic ' + new Buffer(this.options.username + ':' + this.options.password).toString('base64'),
				'App-Key': this.options.app_key
			}
		}, function(res) {

			var buffer = '';
			var apiResponse = {
				'statusCode': res.statusCode,
				'data': '',
				'obj': null
			};
			res.addListener('data', function(chunk) {
				buffer += chunk.toString('utf8');
			});
			res.addListener('end', function() {
				//log.debug('Pingdom API response: ' + util.inspect(req), 6);
				apiResponse.data = buffer;
				if (apiResponse.statusCode !== 200) {
					log.warn('Invalid API response: status code: ' + apiResponse.statusCode);
				} else {
					// Check API rate limits
					var apiLimits = self._parseRequestLimits(res.headers);
					for (var i = 0, l = apiLimits.length; i < l; i++) {
						log.debug('Pingdom API: Account \''+self.options.name+'\' Rate limit: ' + apiLimits[i]['remaining'] + ' requests remaining in the next ' + apiLimits[i]['time'] + ' seconds');
					}
					try {
						apiResponse.obj = JSON.parse(apiResponse.data);
					} catch (e) {
						log.warn('Invalid API response: parse error: ' + e);
					}
				}
				cb(apiResponse, self);
			});
			
		}).on('error', function(e) {
			log.warn('Invalid HTTP response: parse error: ' + e.message);
		});
	req.end();
	return req;
};

ApiConnector.prototype._parseRequestLimits = function(headers) {

	var limits = [];
	var n;

        if (typeof headers['req-limit-short'] == 'undefined' || typeof headers['req-limit-long'] == 'undefined') {
             return limits;
        }

	// Parse req-limit-short header
	n = headers['req-limit-short'].match(/[0-9]+/g);
	limits.push({
		'remaining': n[0],
		'time': n[1]
	});

	// Parse req-limit-long header
	n = headers['req-limit-long'].match(/[0-9]+/g);
	limits.push({
		'remaining': n[0],
		'time': n[1]
	});

	return limits;
};

function Monitor(connectors, statusChangeCallback) {
	this.connectors = connectors || [];

	if (statusChangeCallback) {
		this.addListener('statusChange', statusChangeCallback);
	}

	this._checkStatuses = {};
	this._queues = {};

	// Set up polling of the checks
	log.info('Setting up poller...');
	setInterval(function(self) {
		self._updateStatuses();
	}, 30000, this);
	this._updateStatuses();
}

util.inherits(Monitor, EventEmitter);
exports.Monitor = Monitor;

exports.createMonitor = function(connectors) {
	return new Monitor(connectors);
};
Monitor.prototype.addApiConnector = function(connector) {
	this.connectors.push(connector);
};

Monitor.prototype.getChecks = function(type, callback) {
	var checks = [],
		check;
	type = type || 'all';
	switch(type){
		case 'all':
			for (check in this._checkStatuses) {
				checks.push(this._checkStatuses[check]);
			}
		break;
		case 'acknowledged':
			for (check in this._checkStatuses) {
				if (this._checkStatuses[check].acknowledged) {
					checks.push(this._checkStatuses[check]);
				}
			}
		break;
		case 'down':
		case 'up':
			for (check in this._checkStatuses) {
				if (this._checkStatuses[check].status == type) {
					checks.push(this._checkStatuses[check]);
				}
			}
		break;
	}

	callback(checks);
};

Monitor.prototype.monitorStatus = function(callback) {

	var ret = {};
	ret.accounts = [];
	for (var i = 0, l = this.connectors.length; i < l; i++) {
		var account = {'username':this.connectors[i].options.name, 'status':this.connectors[i].options.status};
		ret.accounts.push(account);
	}
	
	var upChecks = 0;
	var downChecks = 0;
	var unconfirmedChecks = 0;
	var ackChecks = 0;
	var pausedChecks = 0;
	var totalChecks = 0;

	for (var check in this._checkStatuses) {
		totalChecks++;
		switch( this._checkStatuses[check].status ){
			case 'up':
				upChecks++;
			break;
			case 'down':
				downChecks++;
			break;
			case 'unconfirmed_down':
				unconfirmedChecks++;
			break;
			case 'paused':
				pausedChecks++;
			break;
		}
		if(this._checkStatuses[check].acknowledged) {
			ackChecks++;
		}
	}

	ret.checks = {
		'total': totalChecks,
		'paused': pausedChecks,
		'unconfirmed': unconfirmedChecks,
		'up': upChecks,
		'acknowledged': ackChecks,
		'down': downChecks
	};

	callback(ret);
};

Monitor.prototype.acknowledge = function(id, callback) {
	//toggle acknowledge flag, if it fails (wrong id or something) then return false
	var ret = false;
	for (var check in this._checkStatuses) {
		if (this._checkStatuses[check].id == id) {
			this._checkStatuses[check].acknowledged = (this._checkStatuses[check].acknowledged) ? false : true;
			this._checkStatuses[check].acknowledgedtime = (this._checkStatuses[check].acknowledged) ? Math.round((new Date()).getTime() / 1000) : 0;
			ret = this._checkStatuses[check];
			break;
		}
	}
	if( typeof(callback) == 'function') { callback(ret); }
};

Monitor.prototype._updateStatuses = function() {
	var self = this;
	log.debug('Updating check statuses.');

	// Pingdom doesn't tell us how long a check has been down for so we need to keep track
	// of this ourselves. Here we add the 'laststatuschange' value to the check data.
	var prevCheckStatuses = copyObj(self._checkStatuses);

	for (var i = 0, l = self.connectors.length; i < l; i++) {
		self.connectors[i].apiCall('checks', function(apiResponse, connector) {
			if (apiResponse.statusCode !== 200) {
				if( connector.options.status){
					connector.options.status = false;
					self.emit('connectorDown', self.connectors[i]);
				}
				return false;
			}
			if( !connector.options.status ){
				connector.options.status = true;
				self.emit('connectorUp', self.connectors[i]);
			}
			for (var j = 0, m = apiResponse.obj.checks.length; j < m; j++) {
				// Unique key for storing this check info
				
				//include only these checks
				if( connector.options.include.length > 0 &&
					connector.options.include.indexOf(apiResponse.obj.checks[j].name) == -1
				){
					continue;
				}
				//exclude these too
				if( connector.options.exclude.length > 0 &&
					connector.options.exclude.indexOf(apiResponse.obj.checks[j].name) != -1
				){
					continue;
				}
				var k = apiResponse.obj.checks[j].id;
				self._checkStatuses[k] = apiResponse.obj.checks[j];
				self._checkStatuses[k].account = connector.options.name;

				// If the check is not previously defined then it must be newly-added
				if (typeof(prevCheckStatuses[k]) !== 'undefined') {
					self._checkStatuses[k].acknowledged = prevCheckStatuses[k].acknowledged;
					self._checkStatuses[k].acknowledgedtime = prevCheckStatuses[k].acknowledgedtime;
					self._checkStatuses[k].laststatuschange = prevCheckStatuses[k].laststatuschange;

					// Determine if check has a different status compared to last time
					if (prevCheckStatuses[k].status !== self._checkStatuses[k].status) {
						self._checkStatuses[k]['laststatuschange'] = Math.round((new Date()).getTime() / 1000);
						// Add to event queue
						log.info('Check \'' + self._checkStatuses[k].name + '\' has changed status. Adding to event queue...');
						self._queue('statusChange', self._checkStatuses[k]);
					}
				} else {
					log.info('Tracking check: \'' + self._checkStatuses[k].name + '\'');
					self._checkStatuses[k].acknowledged = false;
					self._checkStatuses[k].acknowledgedtime = 0;
					self._checkStatuses[k]['laststatuschange'] = Math.round((new Date()).getTime() / 1000);
				}
			}
			self._fire('statusChange');
		});
	}
};

Monitor.prototype._queue = function(queue, data) {
	this._queues[queue] = data;
};

Monitor.prototype._fire = function(queues) {
	if (typeof(queues) === 'string') {
		queues = [queues];
	}
	for (var i = 0, l = queues.length; i < l; i++) {
		if (typeof(this._queues[queues[i]]) !== 'undefined') {
			log.debug('Emitting \'' + queues[i] + '\' event');
			this.emit(queues[i], this._queues[queues[i]]);
			delete(this._queues[queues[i]]);
		}
	}
};
