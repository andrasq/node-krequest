/**
 * request with a nicer api
 */

'use strict';

var request = require('request');
var krequest = request.defaults({});

krequest = fixupApi(krequest);
krequest.createJsonClient = createJsonClient;

module.exports = krequest;

function fixupApi( client ) {
    client._kreq = { options: { headers: {} } };

    var _defaults = client.defaults;
    client.defaults = function( options ) {
        options = options || {};
        var req = _defaults.call(client, options);
        req = fixupApi(req);
        var _kreq = { baseUrl: '', options: { headers: {} } };
        _kreq.baseUrl = options.baseUrl || options.url || '';
        _kreq.options = copyFields({}, options);
        _kreq.options.headers = copyFields({}, options.headers);
        req._kreq = _kreq;
        return req;
    };

    client.createJsonClient = createJsonClient;

    var _requestMethods = {};
    var methodsToFix = ['get', 'head', 'post', 'put', 'patch', 'del'];
    for (var i in methodsToFix) {
        var name = methodsToFix[i];
        _requestMethods[name] = client[name];
        client[name] = fixMethodApi(name);
    }

    client.call = function(method, url, body, options, callback) {
        return client[method.toLowerCase()](url, body, options, callback);
    };

    function fixMethodApi(name) {
        return function( url, body, options, callback ) {
            if (!callback) { callback = options; options = null; }
            if (!callback) { callback = body; body = null; }
            if (!callback) { callback = url; url = null; }
            try {
                var typeMap = { text: 'text/plain', binary: 'application/octet-stream', default: 'application/json' };
                var uri = buildUri(client, url, options, body, typeMap);
                return _requestMethods[name].call(client, uri, function(err, res, body) {
                    // TODO: see if the request object can be returned to the callback
                    if (err) callback(err);
                    res.body = body;
                    callback(err, res, body);
                });
            }
            catch (err) {
                return callback(err)
            }
        }
    }

    return client;
}

function createJsonClient( userOpts ) {
    userOpts = userOpts || {};
    var _kreq = { options: { headers: {} } };
    // inherit defaults from the parent jsonClient object, else start from scratch if bare request
    _kreq.options = copyFields({ encoding: null }, this._kreq && this._kreq.options, userOpts);
    _kreq.options.headers = copyFields({}, this._kreq && this._kreq.options && this._kreq.options.headers, userOpts.headers);
    _kreq.baseUrl = userOpts.baseUrl || userOpts.url || userOpts.uri;
    delete _kreq.options.baseUrl;
    delete _kreq.options.url;
    delete _kreq.options.uri;

    if (_kreq.baseUrl && _kreq.baseUrl.indexOf('://') < 0) throw new Error("base url must be fully qualified");

    var client = request.defaults({});
    client._kreq = _kreq;

    client.basicAuth = function( username, password ) {
        client._kreq.options.auth = { username: username, password: password };
        return client;
    }

    var _requestMethods = {};
    var methodsToFix = ['get', 'head', 'post', 'put', 'patch', 'del'];
    for (var i in methodsToFix) {
        var name = methodsToFix[i];
        _requestMethods[name] = client[name];
        client[name] = fixMethodApi(name);
    }
    client.delete = client.del;

    function fixMethodApi(name) {
        return function( url, body, callback ) {
            if (!callback) { callback = body; body = null; }
            if (!callback) { callback = url; url = null; }
            try {
                var typeMap = { text: 'application/json', binary: 'application/bson', default: 'application/json' };
                var uri = buildUri(client, url, null, body, typeMap);
                return _requestMethods[name].call(client, uri, function(err, res, body) {
                    // TODO: see if the request object can be returned to the callback
                    var req = { options: uri, headers: uri.headers, body: uri.body };
                    returnJsonClientResponse(err, req, res, body, callback);
                });
            }
            catch (err) {
                return callback(err)
            }
        }
    }

    // emulate restify.createJsonClient responses
    function returnJsonClientResponse( err, req, res, body, cb ) {
        if (err || !res) return cb(err, req, res, null);

        var obj;
        res.body = body;

        switch (res.headers['content-type']) {
        case 'application/bson':
        case 'application/octet-stream':
            try { obj = BSON.deserialize(body) } catch (err) { obj = {} }
            break;
        case 'application/json':
        case undefined:
            if (body) try { obj = JSON.parse(body) } catch (err) { obj = {} }
            else body = body;
            break;
        case 'text/plain':
        default:
            obj = {};
            break;
        }
        if (!err && res.statusCode >= 400) {
            // superficial jsonClient error return emulation
            err = new Error();
            err.statusCode = res.statusCode;
            err.body = obj;
        }
        return cb(err, req, res, obj);
    }

    return client;
}


function copyFields( to, from /* VARARGS */ ) {
    for (var i=1; i<arguments.length; i++) {
        for (var k in arguments[i]) to[k] = arguments[i][k];
    }
    return to;
}

function buildUri( req, url, options, body, typeMap ) {
    // merge defaults with just-specified options
    var uri = copyFields({}, req._kreq.options, typeof url === 'object' ? url : {url: url}, options);
    uri.headers = copyFields({}, req._kreq.options.headers, url && url.headers, options && options.headers);

    // fill out /-relative paths
    var path = uri.url || uri.uri || uri.path || uri.baseUrl;
    if (path[0] === '/') {
        var baseUrl =
            uri.baseUrl ? uri.baseUrl :
            req._kreq.baseUrl ? req._kreq.baseUrl :
            (uri.host) ? (uri.protocol || 'http:') + '//' + uri.host :
            (uri.hostname) ? (uri.protocol || 'http:') + '//' + uri.hostname + (uri.port ? ':'+uri.port : '') :
            null;
        if (baseUrl) path = baseUrl + path;
    }
    delete uri.url;
    delete uri.uri;
    delete uri.baseUrl;
    uri.url = path || uri.baseUrl;

    // body is optional, auto-detect encoding.  Body must not be null or undefined.
    // uri.body must already be stringified, it is not re-encoded.
    if (body != null) uri.body = encodeBody(uri.headers, body, typeMap);

    typeMap = typeMap || {
        text: 'text/plain',
        binary: 'application/bson',
        default: 'application/json',
    };

    // body encoder borrowed from qhttp:
    function encodeBody( headers, body, typeMap ) {
        var type;
        if (typeof body === 'string')   { type = typeMap.text; }
        else if (Buffer.isBuffer(body)) { type = typeMap.binary; }          // restify expects app/bson
        // TODO: how to pass an empty body?  empty string or perhaps an empty object?
        else if (body == null)          { type = typeMap.default; body = ""; }
        else                            { type = typeMap.default; body = JSON.stringify(body); }
        if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = type;
        return body;
    }

    return uri;
}
