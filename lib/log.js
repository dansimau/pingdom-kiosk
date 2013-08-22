var console = require("console");
var util = require("util");

var types = [
    "",
    "ERROR",
    "WARNING",
    "INFO",
    "DEBUG1",
    "DEBUG2",
    "DEBUG3"
];

exports.debug = function(msg, level) {
    level = level || 4;
    _log(msg, 4);
};

exports.info = function(msg) {
    _log(msg, 3);
};

exports.warn = function(msg) {
    _log(msg, 2);
};

exports.err = function(msg) {
    _log(msg, 1);
};

function _log(msg, level) {
    level = level || 3;
    var ts = (new Date()).toString();
    var o = "[" + ts + "]: " + types[level] + ": " + msg;
    if (level < 3) {
        console.error(o);
    } else {
        console.log(o);
    }
}