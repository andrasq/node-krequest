krequest
========

Decorates [`request`](https://npmjs.org/package/requeste) with an improved api
with features borrowed from `jsonClient` and `qhttp`.

The changed api allows the body to be passed as a call parameter, and a more
consistent use of relative paths.

The web request methods (get, post, put, etc) have recognized forms of

        post(uri, callback)
        post(uri, body, callback)
        post(uri, body, options, callback)


Added Functions
---------------

### krequest.call( method, url, body, callback(err, res, returnedBody) )

A unified entry point to the web request methods `get`, `post`, `del`, etc., using
the 3-argument form above.  Url may be a fully qualified uri string, a relative uri
path, or an options object.

### krequest.createJsonClient( options )

Convenience wrapper for porting unit tests written for `restify` to use `request`.

        var krequest = require('krequest');
        var jsonClient = krequest.createJsonClient(options);

Options:

- `url` - fully qualified base url to prepend to /-relative request paths


Todo
----

* should support the qhttp option `returnBody: false` to return immediately and not gather the response body
