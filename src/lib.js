const BrowserWebSocket = global.MozWebSocket || global.WebSocket;
const WebSocket = BrowserWebSocket || require('ws'); // eslint-disable-line global-require
const EventEmitter = require('events');

const WsFactory = require('./WsFactory');
const utils = require('./util');
const Pool = require('generic-pool').Pool;

const SonicMessage = utils.SonicMessage;
const noop = () => {};

// this is an ugly hack to prevent browseryfied `ws` module to throw errors at runtime
// because the EventEmitter API used in Node.js is not available with the WebSocket browser API
if (BrowserWebSocket) {
	WebSocket.prototype.on = function on(event, callback) {
		this.addEventListener(event, callback);
	};

	WebSocket.prototype.removeListener = function removeListener(event, callback) {
		this.removeEventListener(event, callback);
	};
}

const states = {
	INITIALIZED: 1,
	CLOSING: 2,
	CLOSED: 3,
};

class Client {
	constructor(sonicAddress, { maxPoolSize, minPoolSize, debug, acquireTimeout } = {}) {
		this.url = sonicAddress;
		this.running = {};
		this.nextId = 1;
		this.state = states.INITIALIZED;
		this.debug = debug;
		this.maxPoolSize = maxPoolSize || 5;
		this.minPoolSize = minPoolSize || 1;
		this.acquireTimeout = acquireTimeout || 3000;
		this._initializePool();
	}

	_log(log) {
		if (typeof this.debug === 'function') {
			this.debug(log);
		} else if (this.debug) {
			console.log(log); // eslint-disable-line no-console
		}
	}

	_initializePool() {
		const factory = new WsFactory(WebSocket, this.url);
		const poolOpts = {
			name: 'sonic',
			create: factory.create.bind(factory),
			validate: factory.validate.bind(factory),
			destroy: factory.destroy.bind(factory),
			max: this.maxPoolSize, // maximum size of the pool
			min: this.minPoolSize, // minimum size of the pool
			log: this.debug,
		};


		this.pool = new Pool(poolOpts);
	}

	_cancel(id, _cb) {
		const ws = this.running[id];
		const cb = typeof _cb === 'function' ? _cb : noop;

		this._log(`cancelling: WebSocket(${id})`);

		/* a 'D' message is expected when a cancel is send,
		 * therefore resource cleanup should be handled by done handler */
		if (!ws) {
			this._log(new Error(`cancel: WebSocket(${id}) is not running any queries`));
			cb();
			return;
		}

		const doSend = () => {
			if (!BrowserWebSocket) {
				ws.send(SonicMessage.CANCEL, () => {
					this._log(`cancelled: WebSocket(${id})`);
					cb();
				});
				return;
			}

			try {
				ws.send(SonicMessage.CANCEL);
				this._log(`cancelled: WebSocket(${id})`);
				cb();
			} catch (e) {
				this._log(e);
				cb(e);
			}
		};

		if (ws.readyState === WebSocket.CONNECTING) {
			ws.on('open', doSend);
		} if (ws.readyState === WebSocket.OPEN) {
			doSend();
		} else {
			// connection is CLOSING/CLOSED
			cb();
		}
	}

  /* ws client agnostic send method */
	_wsSend(message, doneCb, outputCb, progressCb, metadataCb, startedCb, ws) {
		const output = outputCb || noop;
		const progress = progressCb || noop;
		const metadata = metadataCb || noop;
		let onError, onClose, onMessage;

		const done = (err) => {
			ws.removeListener('close', onClose);
			ws.removeListener('error', onError);
			ws.removeListener('message', onMessage);
			doneCb(err);
		};

		onClose = (ev) => {
			this._log(`WebSocket closed: code=${ev.code}; reason=${ev.reason};`);
			if (!ws.sonicError) {
				done(utils.getCloseError(ev));
			} else {
				done(ws.sonicError);
			}
		};

		onError = (err) => {
			this._log(err);
			// err is defined with `ws`, but not with the
			// browser's WebSocket API so we need to get the errors from the close event
			ws.sonicError = err; // eslint-disable-line no-param-reassign
		};

		onMessage = (_message) => {
			const msg = BrowserWebSocket ? JSON.parse(_message.data) : JSON.parse(_message.toString('utf-8'));
			const completeStream = () => {
				this._log(`completed complete/ack sequence: trace_id=${msg.p.trace_id}; error=${msg.v};`);
				if (msg.v) {
					done(new Error(`query with trace_id \`${msg.p.trace_id}\` failed: ${msg.v}`));
				} else {
					done(null);
				}
			};

			switch (msg.e) {
			case 'P':
				progress(utils.toProgress(msg.p));
				break;

			case 'D':
				if (BrowserWebSocket) {
					ws.send(SonicMessage.ACK);
					completeStream();
				} else {
					ws.send(SonicMessage.ACK, completeStream);
				}
				break;

			case 'T':
				metadata(msg.p.map(elem => [elem[0], typeof elem[1]]));
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
				this._log(`unsupported message received: ${JSON.stringify(msg)}`);
				break;
			}
		};

		ws.on('close', onClose);
		ws.on('error', onError);
		ws.on('message', onMessage);
		ws.send(message);
		this._log(`sending message: ${JSON.stringify(message)}`);
	}

	/* pool-aware send method */
	_send(message, doneCb, outputCb, progressCb, metadataCb, startedCb) {
		switch (this.state) {
		case states.CLOSED:
			doneCb(new Error('client is closed and cannot accept more work'));
			return;
		case states.CLOSING:
			doneCb(new Error('client is closing and cannot accept more work'));
			return;
		default:
		}

		// identify send for cancel hooks
		const id = this.nextId++;
		let doned = false;

		const timer = setTimeout(() => {
			const err = new Error(`its taking more than (${this.acquireTimeout}) to acquire resource for ticket=${id}`);
			this._log(err);
			doneCb(err);
		}, this.acquireTimeout);

		// acquire connection
		this.pool.acquire((err, ws) => {
			clearTimeout(timer);

			if (err) {
				doneCb(err);
				return;
			}

			this.running[id] = ws;

			if (this.debug) {
				if (!ws.sonicId) {
					/* first ticket for this resource is the resource ID */
					ws.sonicId = id; // eslint-disable-line no-param-reassign
				}
				console.log(`acquired resource=${ws.sonicId} for ticket=${id}`); // eslint-disable-line no-console
			}

			// doneCb override to release connection back to pool
			const doDoneCb = (err) => {
				this._log(`done with ticket=${id}; resource=${ws.sonicId}`);
				if (!doned) {
					doned = true;
					delete this.running[id];

					if (err) {
						this._log(`destroying resource=${ws.sonicId}; ticket=${id}`);
						/* pool.destroy produces unexpected results; this forces resourced to be invalid */
						ws.close(1011, 'pool#destroy');
					} else {
						this._log(`releasing resource=${ws.sonicId}; ticket=${id}`);
					}
					this.pool.release(ws);
					doneCb(err);
				}
			};

			try {
				this._wsSend(JSON.stringify(message), doDoneCb, outputCb, progressCb, metadataCb, startedCb, ws);
			} catch (e) {
				this._log(e);
				doDoneCb(e);
			}
		});

		return id; // eslint-disable-line consistent-return
	}

	stream(query) {
		const emitter = new EventEmitter();
		const queryMsg = utils.toMsg(query);

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

		const id = this._send(queryMsg, done, output, progress, metadata, started);

		emitter.cancel = (cb) => {
			this._cancel(id, cb);
		};

		return emitter;
	}

	/* TODO: deprecate in favor of run2 */
	run(query, doneCb) {
		const data = [];
		const queryMsg = utils.toMsg(query);

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

		this._send(queryMsg, done, output);
	}

	run2(query) {
		return new Promise((resolve, reject) => {
			this.run(query, (err, data) => {
				if (err) {
					reject(err);
					return;
				}
				resolve(data);
			});
		});
	}

	authenticate(user, apiKey, doneCb, traceId) {
		let token;
		const authMsg = {
			e: 'H',
			p: {
				user,
				trace_id: traceId,
			},
			v: apiKey,
		};

		function done(err) {
			if (err) {
				doneCb(err);
			} else {
				doneCb(null, token);
			}
		}

		function output(elems) {
			token = elems[0];
		}

		this._send(authMsg, done, output);
	}

	_close() {
		if (this.state !== states.CLOSING) {
			return Promise.resolve();
		}
		return this.pool.drain(() => this.pool.destroyAllNow());
	}

	cancel() {
		const ids = Object.keys(this.running);

		return Promise.all(ids.map(id => new Promise((resolve, reject) => {
			this._cancel(id, (err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});
		})));
	}

	close() {
		this.state = states.CLOSING;
		return this.cancel()
			.then(() => this._close())
			.then(() => this.state = states.CLOSED);
	}
}

module.exports.Client = Client;
