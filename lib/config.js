var fs = require('fs');
var log = require('./log');

exports.parseJsonFromFile = function(file, callback) {
    fs.readFile(file, 'utf8', function(err, data) {
        var conf;
        var lines = data.split("\n");
        if (err) {
            callback(err);
        } else {
            try {
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
                callback(err, conf);
            }
            callback(false, conf);
        }
    });
};

exports.parseJsonFromFileSync = function(file) {
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
        return false;
    }
    return conf;
};
