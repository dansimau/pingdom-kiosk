var fs = require('fs'),
	jade = require('jade');

//compile and cache jade template functions for various front-end views
// https://github.com/visionmedia/jade
var templates = [];
var path = __dirname+'/../public/templates/';

fs.readdir(path, function(err, files){
	files.forEach(function(file){
		if( file.substring(0,1) != '.' ){
			compileTemplate(file);
			fs.watchFile(path+file, {persistent: true, interval: 1000}, function (curr, prev) {
				if (curr.mtime != prev.mtime){
					compileTemplate(file);
				}
			});			
		}
	});
});

function compileTemplate(file){
	var key = file.split('.')[0];
	fs.readFile(path+file, function (err, data) {
		templates.push( key+':'+jade.compile(data, {client: true, debug: false, compileDebug: false}).toString() );	
		console.log('Compiled Template: '+file);
	});		
}

//write out a string creating an object with each template function 
exports.writeTemplates = function(){
	var ret = 'var templates = {';
		for (var i = 0, l = templates.length; i < l; i++) {
			ret += templates[i];
			ret += ( i == (l-1) ) ? '' : ',';
		}
	ret += '}';
	return ret;
}