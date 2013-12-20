var Buffer = require('buffer').Buffer
  , _ = require('underscore')
  , _s = require('underscore.string')
  , fs = require('fs')
  , pathInfos = require('path')
  , mime = require('mime')
  , itunes = require('./helpers/iTunes')
  , ID3 = require('id3');


/*
* Get an object by the string
* Example :
* var file.type = "movie";
* var x = {movie:[0,1,2,3]}
* Object.byString(x, file.type);
* Output [0,1,2,3 ]
*/
Object.byString = function(o, s) {
    s = s.replace(/\[(\w+)\]/g, '.$1');  // convert indexes to properties
    s = s.replace(/^\./, ''); // strip leading dot
    var a = s.split('.');
    while (a.length) {
        var n = a.shift();
        if (n in o) {
            o = o[n];
        } else {
            return;
        }
    }
    return o;
}

//Tags (to be improved)
var qualities = ['720p', '1080p', 'cam', 'ts', 'dvdscr', 'r5', 'dvdrip', 'dvdr', 'tvrip', 'hdtvrip', 'hdtv', 'brrip']

  , subtitles = ['fastsub', 'proper', 'subforced', 'fansub']

  , languages = ['vf', 'vo', 'vostfr', 'multi', 'french', 'truefrench']

  , audios = ['ac3', 'dts']

  , format = ['xvid', 'x264'];

//Dummy name by replacing the founded vars
var dummyName = function (name, obj) {
	if(name !== undefined)
		name = name.replace(obj.quality, '').replace(obj.subtitles, '').replace(obj.language, '').replace(obj.format, '');
	return _s.trim(name);
}


/**
* Searches for a cover in a directory
**/
var findCoverInDirectory = function(dir) {
	var files = fs.readdirSync(dir);
	
	var m, type, cover;

	for(var i in files) {
		m = mime.lookup(files[i]);
		type = m.split('/');
		if(type[0] == 'image') {
			cover = files[i];
			break;
		}
	}
	
	return cover === undefined ? null : pathInfos.join(dir, cover).replace(global.config.path, '/downloads');
}

module.exports.getTags  = {
	//Searches the video type
	//Algorithm from : https://github.com/muttsnutts/mp4autotag/issues/2
	video: function(path) {

		var basename = pathInfos.basename(path), prevDir = path.replace('/' + basename, '').split('/');

		prevDir = prevDir[prevDir.length - 1];

		if(prevDir.length > basename.length)
			basename = prevDir;

		var err = null

		  , name = basename.replace(pathInfos.extname(basename), '')
		  		.replace(/^\-[\w\d]+$/i, '') //team name
		  		.replace(/\-|_|\(|\)/g, ' ') //special chars
		  		.replace(/([\w\d]{2})\./ig, "$1 ") //Replacing dot with min 2 chars before
		  		.replace(/\.\.?([\w\d]{2})/ig, " $1") //same with 2 chars after

		  , array = _s.words(name)

		  , movie = {
				quality : _.find(array, function(v) { return _.contains(qualities, v.toLowerCase()) }),
				subtitles : _.find(array, function(v) { return _.contains(subtitles, v.toLowerCase()) }),
				language : _.find(array, function(v) { return _.contains(languages, v.toLowerCase()) }),
				audio : _.find(array, function(v) { return _.contains(audios, v.toLowerCase()) }),
				format : _.find(array, function(v) { return _.contains(format, v.toLowerCase()) }),
				movieType : 'movie',
			}
			
		  , r = new RegExp(/E[0-9]{1,2}|[0-9]{1,2}x[0-9]{1,2}/i) //searches for the tv show
		  , y = new RegExp(/([0-9]{4})/) //Year regex
		  ;

		//Found a tv show
		if(r.test(name)) {

			movie.movieType = 'tvseries';

			//Searches for the Season number + Episode number
			r = new RegExp(/(.+)S([0-9]+)E([0-9]+)/i);
			var r2 = new RegExp(/(.+)([0-9]+)x([0-9])+/i);

			var ar = name.match(r);

			//If it matches
			if(ar != null) {
				movie = _.extend(movie, {
					name : _s.trim(ar[1]),
					season : ar[2],
					episode : ar[3]
				});
			} else {
				ar = name.match(r2);
				if(ar) {
					movie = _.extend(movie, {
						name: _s.trim(ar[1]),
						season: ar[2],
						episode: ar[3]
					});
				} else {
					movie.name = dummyName(name, movie);
				}
			}
		} else if(y.test(name)) {

			movie.movieType = 'movie';

			var ar = name.match(y);

			//year > 1900
			if(ar != null && ar[0] > 1900) {
				var parts = name.split(ar[0]);
				movie : _.extend(movie, {
					name : _s.trim(parts[0]),
					year : ar[1]
				});
			} else {
				movie.name = dummyName(name, movie);
			}
		} else {
			movie.name = dummyName(name, movie);
		}

		return movie;
	}, 
	audio: function(filePath, picture, cb) {

		picture = picture === undefined ? false : picture;

		//Picture should be < than 16 Mb = 1677721 bytes
		var bufferSize = picture ? 1677721 + 32768 : 32768; //http://getid3.sourceforge.net/source/write.id3v2.phps fread_buffer_size

		fs.open(filePath, 'r', function(status, fd) {
			var buffer = new Buffer(bufferSize); 

			if(status) {
				console.error(status);
				cb(status, {});
			} else {

				fs.read(fd, buffer, 0, bufferSize, 0, function(err, bytesRead, buffer) {		

					var id3 = new ID3(buffer); //memory issue large file

					delete buffer;
					fs.closeSync(fd);

					id3.parse();

					var tags = {
							"title" : id3.get("title"),
							"artist" :id3.get("artist"),
							"album"  :id3.get("album"),
							"year"   :id3.get("year"),
							"genre"  :id3.get("genre")
						};

					var datas = id3.get('picture');

					id3 = null;

					if(picture) {
						var pictureFounded = false;

						if(datas !== null && (datas.data !== undefined && datas.format !== undefined) ) {

							var coverName = new Buffer(tags.artist + tags.album).toString().replace(/[^a-zA-Z0-9]+/ig,'')

							  , file = pathInfos.join(global.config.root, '/public/tmp/', coverName)

							  , type = datas.format.split('/');

							if(type[0] == 'image') {
								pictureFounded = true;

								file = file + '.' + type[1];

								if(!fs.existsSync(file))
									fs.writeFileSync(file, datas.data);

								delete datas;
								
								tags = _.extend(tags, {picture: file.replace(global.config.root + '/public', '')});
							}

						}
						
						if(!pictureFounded)
							tags = _.extend(tags, {picture: findCoverInDirectory(pathInfos.dirname(filePath)) });
						
					}

					cb(err, tags);
				});
			}
		});
	}
};

var getAlbumInformations = function(album, cb) {
	var search = album.album !== null && album.artist !== null ? album.artist + ' ' + album.album : null;

	console.log('Gathering infos on', search);

	if(search === null) {
		if(album.album !== null)
			search = album.album;
		else if(album.artist !== null)
			search = album.artist;
	}

	if(search) {
		itunes.lucky(search, function(err, results) {
			cb(err, results);
		});
	} else 
		cb("Nothing to search", {});
}

module.exports.getAlbumInformations = getAlbumInformations;

module.exports.getMovieInformations = require(__dirname + '/helpers/movies/themoviedb');

