'use strict';

var path = require('path');
var _ = require('lodash');
var minimist = require('minimist');
var Textventure = require('./lib/textventure.js');

module.exports = Textventure;

/**
 * Command line, woo
 */
if (require.main === module) {
    var argv = minimist(process.argv.slice(2));
    var defaults = {
        filename: 'demo/script.md',
        hostname: 'http://text.dog',
        destination: 'txtventure',
        basePath: 'demo/out',
        pathMapper: function(id, destination) {
            if (id === 'humans-txt') {
                return 'humans.txt';
            } else {
                return path.join(destination, id + '.txt')
            }
        },
        logging: true,
    };
    var options = _.extend({}, defaults, _.pick(argv, _.keys(defaults)));
    var textventure = new Textventure(options);
    textventure.generate();
}

