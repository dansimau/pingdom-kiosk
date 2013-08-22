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
    * monitor.monitorStatus(callback)
    * monitor.getChecks(status, callback)
    * monitor.acknowledge(checkid, callback)

**/

function copyObj(obj) {
    var clone = (obj instanceof Array) ? [] : {};
    for (var i in obj) {
        if (typeof(obj[i]) === 'object') {
            clone[i] = copyObj(obj[i]);
        } else {
            clone[i] = obj[i];
        }
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
        'allowed_contacts':[],
        'allowed_contactIDs': [],
        'contacts': [],
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
        switch (this._checkStatuses[check].status) {
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
        if (this._checkStatuses[check].acknowledged) {
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
    if (typeof(callback) == 'function') { callback(ret); }
};

Monitor.prototype._updateContacts = function(connector, cb){
    var self = this;
    connector.apiCall('contacts', function(apiResponse, connector){
        if (apiResponse.statusCode !== 200) {
            if (connector.options.status) {
                connector.options.status = false;
                self.emit('connectorDown', self.connectors[i]);
            }
            return false;
        }

        // Add the contacts to the connector obj
        connector.options.contacts = apiResponse.obj.contacts;

        // Get IDs for allowed contact names
        var allowed_contactIDs = Array();
        for (var i = 0; i < connector.options.contacts.length; i++) {
            if (connector.options.allowed_contacts.indexOf(connector.options.contacts[i].name) != -1) {
                allowed_contactIDs.push(connector.options.contacts[i].id);
            }
        }
        connector.options.allowed_contactIDs = allowed_contactIDs;

        cb();
    });
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
            if (!connector.options.status) {
                connector.options.status = true;
                self.emit('connectorUp', self.connectors[i]);
            }

            if (connector.options.allowed_contacts.length > 0) {
                // Allowed contacts is defined, lets update the connectors contacts and then run the update
                self._updateContacts(connector, function(){
                    self.__updateStatuses(apiResponse.obj.checks, prevCheckStatuses, connector);
                });
            } else {
                connector.options.allowed_contactIDs = [];
                // Just update
                self.__updateStatuses(apiResponse.obj.checks, prevCheckStatuses, connector);
            }
        });
    }
};

Monitor.prototype.__updateStatuses = function(checks, prevChecks, connector){
    var self = this;

    // Need to keep track of how many checks have updated (asynchronously) before firing the event
    // next() must be called regardless of if the check is being tracked
    var updated = 0;
    var count = checks.length;
    function next(){
        updated++;
        if (updated == count) {
            self._fire('statusChange');
        }
    }

    for (var j = 0, m = checks.length; j < m; j++) {
        var checkID = checks[j].id;
        //include only these checks
        if (connector.options.include.length > 0 && connector.options.include.indexOf(checks[j].name) == -1) {
            next();
            continue;
        }
        //exclude these too
        if (connector.options.exclude.length > 0 && connector.options.exclude.indexOf(checks[j].name) != -1) {
            next();
            continue;
        }

        // Only track checks associated with specific contacts
        if (connector.options.allowed_contactIDs.length > 0) {
            // Closure to keep track of the current check object
            (function(check, prevCheck){
                // Get detailed check info
                connector.apiCall('checks/'+checks[j].id, function(apiResponse, connector){
                    if (apiResponse.statusCode !== 200) {
                        if (connector.options.status) {
                            connector.options.status = false;
                            self.emit('connectorDown', self.connectors[i]);
                        }
                        return false;
                    }

                    var check_contacts = apiResponse.obj.check.contactids;
                    if (typeof apiResponse.obj.check.contactids != 'undefined'){
                        for (var i = 0; i < connector.options.allowed_contactIDs.length; i++) {
                            if (check_contacts.indexOf(connector.options.allowed_contactIDs[i]) !== -1) {
                                // Found a matching contact, add/update the check and return
                                self._updateStatus(check, prevCheck, connector, next);
                                return;
                            }
                        }
                        next();
                    }else{
                        next();
                    }
                });
            })(checks[j], prevChecks[checkID]);
        } else {
            self._updateStatus(checks[j], prevChecks[checkID], connector, next);
        }
    }
};

Monitor.prototype._updateStatus = function(check, prevCheck, connector, next){
    var self = this;
    var checkid = check.id;

    self._checkStatuses[checkid] = check;
    self._checkStatuses[checkid].account = connector.options.name;

    // If the check is not previously defined then it must be newly-added
    if (typeof(prevCheck) !== 'undefined') {
        self._checkStatuses[checkid].acknowledged = prevCheck.acknowledged;
        self._checkStatuses[checkid].acknowledgedtime = prevCheck.acknowledgedtime;
        self._checkStatuses[checkid].laststatuschange = prevCheck.laststatuschange;

        // Determine if check has a different status compared to last time
        if (prevCheck.status !== self._checkStatuses[checkid].status) {
            self._checkStatuses[checkid]['laststatuschange'] = Math.round((new Date()).getTime() / 1000);
            // Add to event queue
            log.info('Check \'' + self._checkStatuses[checkid].name + '\' has changed status. Adding to event queue...');
            self._queue('statusChange', self._checkStatuses[checkid]);
        }
    } else {
        log.info('Tracking check: \'' + self._checkStatuses[checkid].name + '\'');
        self._checkStatuses[checkid].acknowledged = false;
        self._checkStatuses[checkid].acknowledgedtime = 0;
        self._checkStatuses[checkid]['laststatuschange'] = Math.round((new Date()).getTime() / 1000);
    }
    next();
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
