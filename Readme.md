krequest
========

This is a wrapper around [`request`](https://npmjs.org/package/request) to make the
api more convenient to use (give it a nicer "hand-feel") and to ease transition away
from `restify.createJsonClient`.

The modified api is a blend of request and jsonClient, combining the good features
of each; specifically

- web requests can specify the body directly as a call parameter like jsonClient
- calls return the un-decoded binary response by default (`encoding:null`), like qhttp
- both absolute and relative urls work without surprises, like jsonClient
- a `url` specified as a `defaults()` option is a baseUrl, like jsonClient.  Note that request
  prevents a baseUrl from being overridden by another fully qualified url; use the `url`
  jsonClient syntax for that.
- request bodies are json-encoded if not already a string or Buffer, like jsonClient
- fixes `encoding:null` handling
- if not specified, request content-type is auto-detected as `text/plain`, `application/octet-stream` or `application/json`
- callback is optional, like request
- body and options are optional
- only the `post`, `get`, `put` etc convenience methods are wrappered; `request()` is unchanged
- sending an empty "" request body with jsonClient calls with an empty request body

The jsonClient support is in the form of a `createJsonClient` method that returns
a request object with jsonClient-like call and response semantics, namely

- web request bodies are auto-encoded before being sent
- if not specified, request content-type is auto-detected as `application/json` (strings or objects) or `application/bson` (Buffers)
- response bodies are audo-decoded into objects
- the callback gets `(err, req, res, obj)` with req.headers populated

Some of the drawbacks of `request` are harder be work around; among these are that
it doesn't follow the "do one thing and do it well" principle, and even simple
use-cases end up paying for the overhead of all the unused features, cutting call
speed to half the other http wrappers.


### krequest.post, get, put

The web request methods (get, post, put, etc) call signatures have recognized forms of

        post(uri, [callback])
        post(uri, body, [callback])
        post(uri, body, options, [callback])

- uri - fully qualified url, relative path, or request options object
- body - string, Buffer, or object to be json-encoded
- options - request options to be merged with uri
- callback - function taking `(err, res, body)` Error object if any, http response,
  and a Buffer containing the entire response.  If no callback is specified, the
  call returns an event emitter that delivers the response with on('data') events.


### krequest.call( method, url, body, options, callback(err, res, returnedBody) )

A unified entry point to the web request methods `get`, `post`, `del`, etc.
The parameters following the method can be in any of the formats shown above.


### krequest.createJsonClient( options )

Convenience wrapper for porting unit tests written for `restify` to use `request`.

        var krequest = require('krequest');
        var jsonClient = krequest.createJsonClient(options);

Options:

- `url` - fully qualified base url to prepend to /-relative request paths
- other options as for `request.defaults()`

`jsonClient.post` etc. requests are similar to `request.post` etc, with some
encoding and response differences mentioned above

#### jsonClient.post(uri, body, callback(err, req, res, obj))

Makes a POST request to the uri (fully qulified url string, relative path, or
request object) with body.  The callback is invoked with any error, the http
request, the http response, and the decoded response object.  Note that jsonClient
hoists http errors into the error object, setting fields `statusCode` (http status
code) and `body` (decoded response).  `obj` is the decoded response, `res.body` is
the response as received.

Related work
------------

- [`request`](https://npmjs.org/package/request) - full-featured slow http client
- [`qhttp`](https://npmjs.org/package/qhttp) - lean, fast http client
- [`restify`](https://npmjs.org/package/restify) - framework with built-in http client
