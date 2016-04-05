/** ********************
 *  *** DEPENDENCIES ***
 *  ********************
 */
var rssParser = require('parse-rss');
var request   = require('request');
var cheerio   = require('cheerio');
var config    = require('config');

const lastSeen  = 137942;

function postLinksToJd(links) {
    if (links.length <= 0) {
        return false;
    }

    request.post(
        'http://127.0.0.1:9666/flash/add',
        { form: { urls: links.join("\r\n") } },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                logger(body);
            }
        }
    );
}

/**
 * @function parse
 * 
 * Fetches an RSS feed by the given URL, checks if the
 * title of each entry matches the configuration and passes
 * the matched entries to the given callback function for
 * further processing.
 *
 * @param {String} url
 * @param {Function} callback - The function used for further processing of the findings.
 */
function parse(url, callback) {
    var urls = [];
    var hGuid = lastSeen; // save the highest analysed GUID for later

    var titles = config.get('titles');

    logger('Fetching feed from ' + url);

    rssParser(url, function(err, rss){

        logger('Parsing result and checking for ' + titles.length + ' titles.');

        if (!err) {
            for(var i=0; i<rss.length; i++){
                // check if Entry needs to be checked
                var guidRe = /[0-9]*$/;
                var res = rss[i].guid.match(guidRe);

                if(res !== null){
                    var curGuid = parseInt(res[0], 10);

                    // analyse only if it is a new entry
                    if (curGuid > lastSeen){

                        if (curGuid > hGuid) {
                            hGuid = curGuid; // set new highest GUID
                        }

                        // check if entry title is in the wishlist
                        var re = new RegExp(titles.join("|"), "i");
                        if(rss[i].title.match(re) !== null){
                            logger('Found new entry for ' + rss[i].title);

                            urls.push([
                                rss[i].title,
                                rss[i].guid
                            ]);
                        }
                    }
                }
            }

            callback({ guid : hGuid, urls : urls }, postLinksToJd);
        }
    });
}

function logger(data) {
    if (config.get('debug')) {
        console.log(data);
    }
}

function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
}

/**
 * @function analyzePage
 */
function analyzePage(data, callback) {
  var urls = data.urls;

  /**
   * Check the page from the RSS feed for links
   * matching the hoster and format configuration.
   */
  for(var i=0 ; i < urls.length ; i++ ){
    var url   = urls[i][1];
    var title = urls[i][0];

    request(url, ( function(title, callback) {
        return function(err, resp, body) {
            if (err){
                throw err;
            }
            var $ = cheerio.load(body);
            var links = [];

            var hoster = config.get('hoster') ? escapeRegExp(config.get('hoster')) : 'S+';
            var format = config.get('format') ? escapeRegExp(config.get('format')) : 'S+';
            
            var re = new RegExp('\\w+:\\/\\/' + hoster + '\\/\\S+' + format + '\\S+');

            logger("Analysing " + title);

            /**  scraping! */
            $('a').each(function(index, elem){
              var link = elem.attribs.href;

              logger('Looking for links at ' + config.get('hoster'))
              
              if (link.match(re) !== null){
                  logger('Adding link -- ' + link);
                  links.push(link);
              }
            });

            /** Send found links to JDownloader. */
            callback(links);
        };
    })(title, callback));
  }
}

logger("Hello rippaz!");

parse(config.get('feedUrl'), analyzePage);

