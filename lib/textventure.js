'use strict';

var fs = require('fs');
var path = require('path');
var url = require('url');
var _ = require('lodash');
var mkdirp = require('mkdirp');
var chalk = require('chalk');

/**
 * ## splitText
 *
 * Split the text on a Markdown asterisk horizontal rule
 *
 * @param  {string} text: the text to split
 * @return {array} the split sections
 */
function splitText(text) {
    return text.split(/^\*{3,}$/gim);
}

/**
 * ## parseSection
 *
 * Parse the body content of a section and determine its ID and connect any links
 *
 * , grabbing the first H2 header for the ID and determining the filename for the
 * section when it's saved
 *
 * @param {string} text: the text to parse
 * @param {function} [urlDestination]: takes the section ID and creates a full URL for it
 * @param {function} [textDestination]: takes the header and determines the output filename
 * @return {object} id, filename,and body content
 */
function parseSection(text, urlDestination, textDestination) {
    urlDestination = urlDestination || _.identity;
    textDestination = textDestination || _.identity;
    var body = text;

    // Parse out header filename from the first second-level header
    var sectionId = '';
    body = body.replace(/^#{2,}\s*(.*)/m, function(match, id) {
        sectionId = _.kebabCase(id.toLowerCase());
        return '';
    });

    // Replace links
    body = body.replace(/<#([^>]+)>/gm, function(link) {
        return urlDestination(_.kebabCase(link.replace(/<#([^>]+)>/, '$1')));
    });

    return {
        id: sectionId,
        filename: textDestination(sectionId),
        body: _.trim(body) + '\n',
    };
}

/**
 * ## defaultPathMapper
 *
 * Default path mapper behavior, which just combines the id and the destination with the extension
 */
function defaultPathMapper(id, destination) {
    return path.join(destination, id + '.txt');
}

/**
 * # Textventure
 *
 * Parses a single Markdown-ish file and generates plain text output with "links" between sections.
 *
 * Upload the resulting files somewhere, and you can "play" the "game"!
 */

function Textventure(options) {
    options = options || {};
    var defaults = {
        filename: '',
        text: '',
        artPath: '',
        hostname: '',
        destination: '',
        basePath: '',
        logging: false,
        pathMapper: defaultPathMapper,
    };
    _.extend(this, defaults, _.pick(options, _.keys(defaults)));
}

/**
 * ## log
 *
 * Log a thing if we want to log
 */
Textventure.prototype.log = function() {
    if (this.logging) {
        return console.log.apply(console.log, arguments);
    }
};

/**
 * ## generate
 *
 * Split and parse the file and write the sections to separate text files
 *
 * @param  {object} [options]: text generation options
 * @return {array} parsed sections
 */
Textventure.prototype.generate = function(options) {
    this.log(chalk.cyan('Generating Textventure...'));
    this.log('');
    options = _.extend({
        filename: this.filename,
        text: this.text,
        encoding: 'utf8',
        write: true,
    }, options);

    var text = '';

    if (options.text) {
        text = options.text;
    } else {
        this.log('Reading file \'%s\'...', chalk.blue(options.filename));
        this.log('');

        text = fs.readFileSync(options.filename, {
            encoding: options.encoding,
        }).toString();
    }

    var sections = _.map(splitText(text), this.parseSection, this);
    this.log('');
    this.log('[%s %s]', chalk.magenta(sections.length), chalk.blue('sections parsed'));
    this.log('');

    if (options.write) {
        this.log('Writing files...');
        this.log('');
        Promise.all(_.map(sections, this.writeSection, this))
            .then(function(results) {
                this.log('');
                this.log('[%s %s]', chalk.magenta(results.length), chalk.blue('files written'));
                this.log('');
                this.log(chalk.green('Please enjoy your Textventure™ responsibly!'));
                this.log('');
            }.bind(this))
            .catch(function() {
                this.log('');
                this.log(chalk.red(':('));
                this.log('');
            }.bind(this));
    } else {
        this.log(chalk.green('Parsing complete.'));
    }

    return sections;
};

/**
 * ## parseSection
 *
 * Parse the section, reading headers and converting links
 */
Textventure.prototype.parseSection = function(text) {
    var section = parseSection(text, _.bind(this.idToDestinationUrl, this), _.bind(this.idToDestinationFilename, this));
    var art = this.getAsciiArt(section.id)
    if (art) {
        section.body = art + '\n\n' + section.body;
    }
    return section;
};

/**
 * ## getPathMapper
 *
 * Get the path mapper for a given section ID
 */
Textventure.prototype.getPathMapper = function(id) {
    if (_.isFunction(this.pathMapper)) {
        return this.pathMapper;
    } else {
        return _.result(this.pathMapper, id, defaultPathMapper);
    }
}

/**
 * ## getAsciiArt
 *
 * Grab ascii art for the section ID, if it exists
 */
Textventure.prototype.getAsciiArt = function(id) {
    var filename = path.join(this.artPath, id + '.txt');
    var exists = true;

    try {
        fs.accessSync(filename);
    } catch (e) {
        exists = false;
    }

    if (exists) {
        var art = fs.readFileSync(filename, {
            encoding: 'utf8',
        }).toString();

        this.log('  Found art for \'%s\'!', chalk.cyan(id));

        return art;
    } else {
        return false;
    }
}

/**
 * ## idToDestinationUrl
 *
 * Generates the URL for a section ID
 *
 * @param {string} id: section ID (parsed from header of the section)
 * @param {string} [destination]: destination path
 * @param {string} [hostname]: base domain URL (missing protocol is automatically added)
 */
Textventure.prototype.idToDestinationUrl = function(id, destination, hostname) {
    destination = destination || this.destination;
    hostname = hostname || this.hostname;

    if (!/^(?:f|ht)tps?\:\/\//.test(hostname)) {
        hostname = 'http://' + hostname;
    }

    var pathMapper = this.getPathMapper(id);
    var resolvedUrl = url.resolve(hostname, pathMapper(id, destination));

    this.log('  Section \'%s\' will link to \'%s\'', chalk.cyan(id), chalk.blue(resolvedUrl));

    return resolvedUrl;
};

/**
 * ## idToDestinationFilename
 *
 * Generates the filename to save the txt file from a section ID
 *
 * @param {string} id: section ID (parsed from header of the section)
 * @param {string} [destination]: destination path
 * @param {string} [basePath]: base path
 */
Textventure.prototype.idToDestinationFilename = function(id, destination, basePath) {
    destination = destination || this.destination;
    basePath = basePath || this.basePath;

    if (!id) {
        return '';
    }

    var pathMapper = this.getPathMapper(id);
    var resolvedFilename = path.join(basePath, pathMapper(id, destination));

    this.log('  Section \'%s\' will be written to \'%s\'', chalk.cyan(id), chalk.blue(resolvedFilename));

    return resolvedFilename;
};

/**
 * ## writeSection
 *
 * Generates the filename to save the txt file from a section ID
 *
 * @param {object} section: section object (@see #parseSection)
 */
Textventure.prototype.writeSection = function(section) {
    if (!section.filename) {
        return;
    }

    var deferred = Promise.defer();

    mkdirp(path.dirname(section.filename), function(err) {
        if (err) {
            this.log(chalk.red('Error: %s'), err);
            deferred.reject(err);
        } else {
            this.log('  Writing %s', chalk.blue(section.filename));
            fs.writeFile(section.filename, section.body, {
                encoding: 'utf8',
                mode: parseInt('0644', 8),
            }, function(err) {
                if (err) {
                    deferred.reject(err);
                } else {
                    deferred.resolve(section.filename);
                }
            });
        }
    }.bind(this));

    return deferred.promise;
};

module.exports = Textventure;
