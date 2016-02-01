'use strict';

var assert = require('assert');
var net = require('net');
var http = require('http');
var url = require('url');
var events = require('events');
var krequest = require('./');

describe ('krequest', function() {
    var server;
    var unique = Math.floor(Math.random() * 0x100000000).toString(16);
    var baseUrl = "http://localhost:1337";
    var serverChunk;
    var responseMessage;

    before ('setUp', function(done) {
        server = net.createServer().listen(1337);
        server.on('connection', function(socket) {
            socket.setNoDelay();
            socket.on('data', function(chunk) {
                serverChunk = chunk;
                if (chunk.toString().indexOf(' /jsonError HTTP') > 0) {
                    socket.write(
                        "HTTP/1.1 404 NOT FOUND\r\n" +
                        "Content-Length: " + responseMessage.length + "\r\n" +
                        "\r\n" +
                        responseMessage
                    );
                    socket.end();
                }
                else {
                    socket.write(
                        "HTTP/1.1 200 OK\r\n" +
                        "Content-Type: " + "text/plain" + "\r\n" +
                        "Content-Length: " + responseMessage.length + "\r\n" +
                        "\r\n" +
                        responseMessage
                    );
                    socket.end();
                }
            })
        })
        done();
    })

    after ('tearDown', function(done) {
        server.close();
        done();
    });

    beforeEach (function(done) {
        unique = Math.floor(Math.random() * 0x100000000).toString(16);
        responseMessage = unique;
        serverChunk = null;
        done();
    })

    it ('should parse package.json', function(done) {
        require('./package.json');
        done();
    })

    it ('should create server before', function(done) {
        assert.ok(server);
        done();
    });

    it ('should talk to server', function(done) {
        var uri = url.parse(baseUrl);
        uri.method = 'GET';
        var req = http.request(uri, function(res) {
            res.on('data', function(chunk) {
                assert.equal(chunk.toString(), unique);
                done();
            });
            res.on('error', function(err) { done(err); });
        });
        req.end();
    })

    it ('has createJsonClient method', function(done) {
        assert.equal(typeof krequest.createJsonClient, 'function');
        done();
    })

    it ('makes post request and returns body', function(done) {
        krequest.post(baseUrl, function(err, res, body) {
            if (err) return done(err);
            assert.ok(serverChunk.toString().indexOf('POST / HTTP') == 0);
            assert.equal(body.toString(), unique);
            done();
        })
    })

    it ('makes get request and returns body', function(done) {
        krequest.get(baseUrl, function(err, res, body) {
            if (err) return done(err);
            assert.ok(serverChunk.toString().indexOf('GET / HTTP') == 0);
            assert.equal(body.toString(), unique);
            done();
        })
    })

    it ('makes put request and returns body', function(done) {
        krequest.put(baseUrl, function(err, res, body) {
            if (err) return done(err);
            assert.ok(serverChunk.toString().indexOf('PUT / HTTP') == 0);
            assert.equal(body.toString(), unique);
            done();
        })
    })

    it ('accepts body as call parameter', function(done) {
        var id = Math.floor(Math.random() * 0x100000000).toString(16);
        var expect = JSON.stringify({ a: id });
        krequest.post(baseUrl, expect, function(err, res, body) {
            if (err) return done(err);
            assert.ok(serverChunk.toString().indexOf(expect) > 0);
            assert.equal(serverChunk.toString().indexOf(expect), serverChunk.toString().length - expect.length);
            done();
        })
    })

    it ('makes request to absolute url', function(done) {
        var client = krequest.defaults({ url: "http://google.com" });
        client.post(baseUrl, function(err, res, body) {
            assert.ok(body.toString().indexOf(unique) >= 0);
            done();
        })
    })

    it ('makes request to relative url', function(done) {
        var client = krequest.defaults({ url: baseUrl });
        client.post("/path", function(err, res, body) {
            assert.ok(body.toString().indexOf(unique) >= 0);
            done();
        })
    })

    it ('returns an EventEmitter that delivers the response like request', function(done) {
        var res = krequest.post(baseUrl);
        assert.ok(res instanceof events.EventEmitter);
        var chunks = [];
        res.on('data', function(chunk) {
            chunks.push(chunk);
        })
        res.on('end', function() {
            assert.ok(Buffer.concat(chunks).toString().indexOf(unique) >= 0);
            done();
        })
        res.on('error', function(err) {
            done(err);
        })
    })

    it ('returns Buffer by default', function(done) {
        var client = krequest.defaults({ });
        client.post(baseUrl, {}, {}, function(err, res, body) {
            assert(Buffer.isBuffer(body));
            done();
        })
    })

    it ('returns string if encoding is specified', function(done) {
        var client = krequest.defaults({ });
        client.post(baseUrl, {}, {encoding: 'utf8'}, function(err, res, body) {
            assert(typeof body === 'string');
            done();
        })
    })

    it ('acts on request options', function(done) {
        krequest.post(baseUrl + "/path", "body", { gzip: true }, function(err, res, body) {
            assert.ok(serverChunk.toString().indexOf('accept-encoding: gzip') > 0);
            done();
        })
    })

    describe ('createJsonClient', function() {
        var client;

        beforeEach (function(done) {
            client = krequest.createJsonClient({
                url: baseUrl
            });
            done();
        })

        it ('basicAuth should set auth', function(done) {
            client.basicAuth('test', unique);
            client.post("/", {}, function(err, res, body) {
                var auth = new Buffer('test:' + unique).toString('base64');
                assert.ok(serverChunk.toString().indexOf('authorization: Basic ' + auth + '\r\n') > 0);
                done();
            })
        })

        it ('post returns err/req/res/obj params', function(done) {
            client.post("/jsonError", {body: unique}, function(err, req, res, obj) {
                assert.ok(serverChunk.toString().indexOf(unique) > 0);
                assert.ok(err instanceof Error);
                assert.ok(req);
                assert.ok(req instanceof http.ClientRequest);
                assert.ok(res instanceof http.IncomingMessage);
                assert.ok(res.body.toString().indexOf(unique) >= 0);
                assert.ok(obj);
                done();
            })
        })

        it ('hoists http errors into the err object', function(done) {
            client.post("/jsonError", {}, function(err, req, res, obj) {
                assert.ok(err);
                assert.equal(err.statusCode, 404);
                done();
            })
        })
    })
})
