var fs = require('fs');
var log = require('./log');

exports.parseJsonFromFile = function(file, callback) {
	var conf;
	try {
		var lines = fs.readFileSync(file, 'utf8').split("\n");

		// Strip comments from the JSON
		for (var i=0, l=lines.length; i<l; i++) {
			if (lines[i].match(/^\s*\/\//)) {
				delete lines[i];
			}
		}
		lines = lines.join("\n");
		conf = JSON.parse(lines);
	}
	catch (err) {
		log.warn('Unable to read configuration from file (' + file + '): ' + err);
		callback(conf, err);
	}
	log.debug("yay");
	callback(conf);
}
