var fs = require('fs'),
	jade = require('jade');

function watchTemplates(path){
	//compile and cache jade template functions for various front-end views
	// https://github.com/visionmedia/jade
	var _self = this;
	this.templates = [];
	this.path = path;
	
	fs.readdir(_self.path, function(err, files){
		files.forEach(function(file){
			if( file.substring(0,1) != '.' ){
				_self.compileTemplate(file);
				fs.watchFile(_self.path+file, {persistent: true, interval: 1000}, function (curr, prev) {
					if (curr.mtime.getTime() != prev.mtime.getTime()){
						console.log('file changed, recompiling');
						_self.compileTemplate(file);
					}
				});			
			}
		});
	});

	this.compileTemplate = function(file){
		var key = file.split('.')[0];
		fs.readFile(path+file, function (err, data) {
			_self.templates.push( key+':'+jade.compile(data, {client: true, debug: false, compileDebug: false}).toString() );	
			console.log('Compiled Template: '+file);
		});		
	}
	//write out a string creating an object with each template function 
	this.writeTemplates = function(){
		var ret = 'var templates = {';
			for (var i = 0, l = _self.templates.length; i < l; i++) {
				ret += _self.templates[i];
				ret += ( i == (l-1) ) ? '' : ',';
			}
		ret += '}';
		return ret;
	}
}


exports.watch = function(path){
	return new watchTemplates(path);
}