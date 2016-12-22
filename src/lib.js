'use strict';

var BrowserWebSocket = global.MozWebSocket || global.WebSocket;
var WebSocket =  BrowserWebSocket || require('ws');
var EventEmitter = require('events');
var util = require('util');
var utils = require('./util');

// this is an ugly hack to prevent browseryfied `ws` module to throw errors at runtime
// because the EventEmitter API used in Node.js is not available with the WebSocket browser API
if (BrowserWebSocket) {
  WebSocket.prototype.on = function(event, callback) {
    this['on' + event] = callback;
  };
}

function Client(sonicAddress) {
  this.url = sonicAddress;
}

function SonicEmitter() {
  EventEmitter.call(this);
}

util.inherits(SonicEmitter, EventEmitter);

Client.prototype.send = function(doneCb, outputCb, progressCb, metadataCb, startedCb) {
  var output = outputCb || (function() {});
  var progress = progressCb || (function() {});
  var metadata = metadataCb || (function() {});
  var isDone = false;
  var isError = false;

  return function(message, ws) {

    ws.send(message);

    function done(err, id) {
      ws.close();
      doneCb(err, id);
    }

    function closedUnexp() {
      done(new Error('connection closed unexpectedly'));
    }

    ws.on('close', function(ev) {
      // browser
      if (BrowserWebSocket) {
        if (isError) {
          done(new Error('WebSocket close code: ' + ev.code + '; reason: ' + ev.reason));
        } else if (ev.code !== 1000 && !isDone) {
          closedUnexp();
        }

        // ws
      } else if (!isDone && ev !== 1000) {
        closedUnexp();
      }
    });

    ws.on('error', function(ev) {
      // ev is defined with `ws`, but not with the
      // browser's WebSocket API
      if (BrowserWebSocket) {
        isError = true;
      } else {
        isDone = true;
        done(ev);
      }
    });

    ws.on('message', function(message) {
      var msg = BrowserWebSocket ? JSON.parse(message.data) : JSON.parse(message.toString('utf-8'));
      function checkMsg() {
        if (msg.v) {
          done(new Error('Query with trace_id `' + msg.p.trace_id + '` failed: ' + msg.v));
        } else {
          done(null);
        }
      }

      switch (msg.e) {
        case 'P':
          progress(utils.toProgress(msg.p));
          break;

        case 'D':
          isDone = true;
          if (BrowserWebSocket) {
            ws.send(JSON.stringify({ e: 'A' }));
            checkMsg();
          } else {
            ws.send(JSON.stringify({ e: 'A' }), checkMsg);
          }
          break;

        case 'T':
          metadata(msg.p.map(function(elem) {
            return [elem[0], typeof elem[1]];
          }));
          break;

        case 'S':
          if (typeof startedCb !== 'undefined') {
            startedCb(msg.v);
          }
          break;

        case 'O':
          output(msg.p);
          break;

        default:
          // ignore to improve forwards compatibility
          break;
      }
    });
  };
};

Client.prototype.exec = function(message, doneCb, outputCb, progressCb, metadataCb, startedCb) {

  var ws = new WebSocket(this.url);
  var doExec = this.send(doneCb, outputCb, progressCb, metadataCb, startedCb);

  ws.on('open', function() {
    doExec(JSON.stringify(message), ws);
  });
};

Client.prototype.stream = function(query) {
  var emitter = new SonicEmitter();
  var queryMsg = utils.toMsg(query);

  function done(err) {
    if (err) {
      emitter.emit('error', err);
      return;
    }

    emitter.emit('done');
  }

  function output(elems) {
    emitter.emit('data', elems);
  }

  function metadata(meta) {
    emitter.emit('metadata', meta);
  }

  function progress(prog) {
    emitter.emit('progress', prog);
  }

  function started(traceId) {
    emitter.emit('started', traceId);
  }

  this.exec(queryMsg, done, output, progress, metadata, started);

  return emitter;
};

Client.prototype.run = function(query, doneCb) {

  var data = [];
  var queryMsg = utils.toMsg(query);

  function done(err) {
    if (err) {
      doneCb(err, null);
    } else {
      doneCb(null, data);
    }
  }

  function output(elems) {
    data.push(elems);
  }

  this.exec(queryMsg, done, output);
};

Client.prototype.authenticate = function(user, apiKey, doneCb, traceId) {
  var token;
  var authMsg = {
    e: 'H',
    p: {
      user: user,
      trace_id: traceId
    },
    v: apiKey
  };

  function done(err) {
    if (err) {
      doneCb(err, null);
    } else {
      doneCb(null, token);
    }
  }

  function output(elems) {
    token = elems[0];
  }

  this.exec(authMsg, done, output);
};

Client.prototype.close = function() {
  if (this.ws) {
    this.ws.close();
  }
};

module.exports.Client = Client;
