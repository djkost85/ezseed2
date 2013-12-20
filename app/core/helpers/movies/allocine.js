var _ = require('underscore')
  , _s = require('underscore.string')
  , allocine = require('allocine-api');

var getMovieInformations = function(movie, cb) {

  console.log('Gathering infos on', movie.name);

  //searching in the allocine API (could be others)
    allocine.api('search', { q:movie.name, filter: movie.movieType, count: '5'}, function(err, res) {

      if(err)
      return cb(err, movie);


      if(!_.isUndefined(res.feed)) {
          var infos = Object.byString(res.feed, movie.movieType);

      console.log('Infos on ', movie.name, infos);

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

              ) {
                  index = i;
                }

              i++;
            }

          if(index === false)
            index = 0;

              movie.code = infos[index].code;

              console.log('Searching specific infos', movie.movieType, {code: movie.code});

              //Searching for a specific code
              allocine.api(movie.movieType, {code: movie.code}, function(err, result) { 

                if(err)
                  console.error(err);

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

module.exports = getMovieInformations;