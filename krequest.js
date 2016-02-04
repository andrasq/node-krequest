/**
 * request with a nicer api
 *
 * Copyright (c) 2016, Kinvey, Inc. All rights reserved.
 *
 * This software is licensed to you under the Kinvey terms of service located at
 * http://www.kinvey.com/terms-of-use. By downloading, accessing and/or using this
 * software, you hereby accept such terms of service  (and any agreement referenced
 * therein) and agree that you have read, understand and agree to be bound by such
 * terms of service and are of legal age to agree to such terms with Kinvey.
 *
 * This software contains valuable confidential and proprietary information of
 * KINVEY, INC and is subject to applicable licensing agreements.
 * Unauthorized reproduction, transmission or distribution of this file and its
 * contents is a violation of applicable laws.
 *
 * 2016-02-01 - AR.
 */

'use strict';

var request = require('request');
var krequest = request.defaults({});
var http = require('http');

krequest = fixupApi(krequest);
krequest.createJsonClient = createJsonClient;

module.exports = krequest;

function fixupApi( client ) {
    client._kreq = { options: { headers: {} } };

    var _defaults = client.defaults;
    client.defaults = function( options ) {
        options = copyFields({}, options);
        var _kreq = { baseUrl: '', options: { headers: {} } };
        _kreq.baseUrl = options.baseUrl || options.url || '';
        _kreq.options = options;
        _kreq.options.headers = copyFields({}, options.headers);
        delete options.baseUrl;
        var req = request.defaults(options);
        req = fixupApi(req);
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
        method = method.toLowerCase();
        switch (arguments.length) {
        case 1: return client[method]();
        case 2: return client[method](url);
        case 3: return client[method](url, body);
        case 4: return client[method](url, body, options);
        default:
        case 5: return client[method](url, body, options, callback);
        }
    };

    function fixMethodApi(name) {
        return function( url, body, options, callback ) {
            if (!callback && typeof arguments[arguments.length - 1] === 'function') { 
                if (!callback) { callback = options; options = null; }
                if (!callback) { callback = body; body = null; }
                if (!callback) { callback = url; url = null; }
            }
            try {
                var typeMap = { text: 'text/plain', binary: 'application/octet-stream', empty: 'text/plain', other: 'application/json' };
                var uri = buildUri(client, url, body, options, typeMap);
                // return untranslated responses by default
                if (uri.encoding === undefined) uri.encoding = null;
                var ret = _requestMethods[name].call(client, uri);

                // fix encoding:null, which many versions of request dont honor
                if (callback) {
                    gatherChunks(ret, function(err, buffer) {
                        var res = ret.response;
                        res.body = buffer;
                        callback(err, res, uri.encoding === null ? buffer : buffer.toString(uri.encoding));
                    })
                }
                return ret;
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
                var typeMap = { text: 'application/json', binary: 'application/bson', empty: 'application/json', other: 'application/json' };
                var uri = buildUri(client, url, body, null, typeMap);
                var ret = _requestMethods[name].call(client, uri);
                gatherChunks(ret, function(err, buffer) {
                    // `request` attaches the http req and res to its return object ret
                    return returnJsonClientResponse(err, ret.req, ret.response, buffer, callback);
                })
                return ret;
            }
            catch (err) {
                return callback(err)
            }
        }
    }

    function returnJsonClientResponse( err, req, res, body, cb ) {
        if (err || !res) return cb(err, req, res, null);

        var obj;
        // restify jsonClient json-decodes all responses regardless of content-type
        try { obj = JSON.parse(body) } catch (e) { obj = {} }

        // restify jsonClient returns its own custom http errors, these are vanilla Errors
        if (!err && res && res.statusCode >= 400) {
            err = new Error(http.STATUS_CODES[res.statusCode] || "http error");
            err.message = body.toString();
            err.statusCode = res.statusCode;
            err.body = obj;
        }

        // restify jsonClient returned body is always a string
        res.body = body.toString();
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

function buildUri( req, url, body, options, typeMap ) {
    // merge defaults with just-specified options
    var uri = copyFields({}, req._kreq.options, typeof url === 'object' ? url : {url: url}, options);
    uri.headers = copyFields({}, req._kreq.options.headers, url && url.headers, options && options.headers);

    // combine the many ways of specifying the destination into a single fully qualified url
    var path = uri.url || uri.uri || uri.path || uri.baseUrl || req._kreq.baseUrl;
    if (path && path[0] === '/') {
        // fill out /-relative paths
        var baseUrl =
            uri.baseUrl ? uri.baseUrl :
            req._kreq.baseUrl ? req._kreq.baseUrl :
            // TODO: what is the precedence of duplicated fields host/hostname/port?
            (uri.host) ? (uri.protocol || 'http:') + '//' + uri.host + (uri.port && uri.host.indexOf(':') < 0 ? ':'+uri.port : ''):
            (uri.hostname) ? (uri.protocol || 'http:') + '//' + uri.hostname + (uri.port ? ':'+uri.port : '') :
            null;
        if (baseUrl) path = baseUrl + path;
    }
    delete uri.url;
    delete uri.uri;
    delete uri.path;
    uri.uri = path;     // request: "options.uri is a required argument"
    delete uri.baseUrl;

    // body is optional, auto-detect encoding.
    // If body is passed in uri.body, it must already be stringified.
    typeMap = typeMap || { text: 'text/plain', binary: 'application/bson', empty: 'application/json', other: 'application/json' };
    if (body != null || uri.body == null) uri.body = encodeBody(uri.headers, body, typeMap);

    function encodeBody( headers, body, typeMap ) {
        var type;
        if (typeof body === 'string')   { type = typeMap.text; }
        else if (Buffer.isBuffer(body)) { type = typeMap.binary; }
        // restify jsonClient converts null body into "{}", errors out on "" and undefined
        else if (body == null)          { type = typeMap.empty; body = "{}"; }
        else                            { type = typeMap.other; body = JSON.stringify(body); }
        if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = type;
        return body;
    }

    return uri;
}

var emptyBuffer = new Buffer("");
function gatherChunks( ret, callback ) {
    var chunks = [];
    var done = 0;

    ret.on('data', function(chunk) {
        chunks.push(chunk);
    })
    ret.on('error', function(err) {
        if (!done++) callback(err, err);
    })
    ret.on('end', function() {
        var data = chunks.length > 1 ? Buffer.concat(chunks) : chunks.length > 0 ? chunks[0] : emptyBuffer;
        if (!done++) callback(null, data);
    })
}
