var _ = require('underscore')
  , _s = require('underscore.string')
  , mdb = require('moviedb')('7c5105894b0446bb59b01a30cf235f3b')
  , jf = require('jsonfile');

var getMovieInformations = function(movie, cb) {

	jf.writeFileSync(
		global.config.root + '/../node_modules/moviedb/lib/endpoints.json', 
		jf.readFileSync(__dirname + '/themoviedb.json')
	);

	console.log('Gathering infos on', movie.name);

	//searching in the allocine API (could be others)
	
	var type = movie.movieType == 'movie' ? 'Movie' : 'TV';

	mdb['search'+type]({query: movie.name, page: 1, year: movie.year }, function(err, res){
	  	if(err)
			return cb(err, movie);

		console.log('Search', movie.name, res.results);

		var infos = res.results;

		if(infos.length) {

			var index = false;

			var m_name = _s.slugify(movie.name);

			//Parse each infos founded, if title matchs, break
			var nb_resultats = infos.length, i = 0;

			//loop beginning with best match !
			while(i < nb_resultats - 1 && index === false) {
				
				var e = infos[i],
					//slugifying names - matches are better
					e_title = _s.slugify(e.title), 
					e_original = _s.slugify(e.original_title);

				if(

					( e.title !== undefined && e_title.indexOf(m_name) !== -1 ) 
					||
					( e.original_title !== undefined && e_original.indexOf(m_name) !== -1 )

				)	{
						index = i;
					}

				i++;
			}

			if(index === false)
				index = 0;

			movie.code = infos[index].id;

			mdb[type]({id: movie.code}, function(err, result) {
	          	console.log('Founded specific infos on', movie.name);


	  			if(result) {
	      			movie.title = result.title !== undefined ? result.title : result.original_title;
	      			movie.synopsis = result.overview ? _s.trim(result.overview.replace(/(<([^>]+)>)/ig, '')) : '';
	      			movie.picture = result.poster_path !== undefined ? result.poster_path : null;
	      			movie.trailer = null;
	      		} else {
	      			infos = infos[index];

	      			movie.title = infos.title !== undefined ? infos.title : infos.original_title;
	      			movie.picture = infos.poster_path !== undefined ? infos.poster_path : null;
	      			movie.synopsis = null;
	      		}

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

	});
}

module.exports = getMovieInformations;