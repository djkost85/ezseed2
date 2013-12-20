var Buffer = require('buffer').Buffer
  , _ = require('underscore')
  , _s = require('underscore.string')
  , allocine = require('allocine-api')
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

var getMovieInformations = function(movie, cb) {

	console.log('Gathering infos on', movie.name);

	//searching in the allocine API (could be others)
  	allocine.api('search', { q:movie.name, filter: movie.movieType, count: '5'}, function(err, res) {

  		if(err) {
  			console.error('Allocine error', err);
			return cb(err, movie);

  		} 

  		if(!_.isUndefined(res.feed)) {
      		var infos = Object.byString(res.feed, movie.movieType);

      		if(infos !== undefined) {

      			//Index allocine info
      			var index = false;

      			var m_name = _s.slugify(movie.name);

      			//Parse each infos founded, if title matchs, break
      			var nb_resultats = infos.length, i = 0;

      			//loop beginning with best match !
      			while(i < nb_resultats - 1 && index === false) {
      				
      				var e = infos[i],
      					//slugifying names - matches are better
      					e_title = _s.slugify(e.title), 
      					e_original = _s.slugify(e.originalTitle);

      				if(

      					( e.title !== undefined && e_title.indexOf(m_name) !== -1 ) 
      					||
      					( e.originalTitle !== undefined && e_original.indexOf(m_name) !== -1 )

      				)	{
      						index = i;
      					}

      				i++;
      			}

  				if(index === false)
  					index = 0;

          		movie.code = infos[index].code;

          		//Searching for a specific code
          		allocine.api(movie.movieType, {code: movie.code}, function(err, result) { 
          			var specific_infos = Object.byString(result, movie.movieType);

          			console.log('Founded specific infos on', movie.name);

          			if(specific_infos) {
	          			movie.title = specific_infos.title !== undefined ? specific_infos.title : specific_infos.originalTitle;
	          			movie.synopsis = specific_infos.synopsis ? _s.trim(specific_infos.synopsis.replace(/(<([^>]+)>)/ig, '')) : '';
	          			movie.picture = specific_infos.poster !== undefined ? specific_infos.poster.href : null;
	          			movie.trailer = _.isEmpty(specific_infos.trailer) ? null : specific_infos.trailer.href;
	          		} else {
	          			infos = infos[index];

	          			movie.title = infos.title !== undefined ? infos.title : infos.originalTitle;
	          			movie.picture = infos.poster !== undefined ? infos.poster.href : null;
	          			movie.synopsis = infos.link !== undefined && infos.link.href !== undefined ? '<a href="'+infos.link.href+'">Fiche allociné</a>' : null;
	          		}

          			return cb(err, movie);

          		});
          	} else {

          		var words = _s.words(movie.name);

          		if(words.length >= 2 && words[0].length > 3) {
          			movie.name = words.splice(1, words.length).join(' ');
          			getMovieInformations(movie , cb);
          		} else {
        			 //No movie founded
	          		movie.title = movie.name;
	          		return cb(err, movie);  			
          		}

          	}
      	} else {
      		return cb(err, movie);
      	}
  	});
}

module.exports.getMovieInformations = getMovieInformations;

