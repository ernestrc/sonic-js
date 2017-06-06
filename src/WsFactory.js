const util = require('./util');

class WsFactory {
	constructor(WebSocket, url) {
		this.url = url;
		this.WebSocket = WebSocket;
	}

	create(callback) {
		const ws = new this.WebSocket(this.url);
		let onOpen, onClose;

		const removeListeners = () => {
			ws.removeListener('open', onOpen);
			ws.removeListener('close', onClose);
			ws.removeListener('error', onError);
		};

		const onError = (err) => {
			removeListeners();
			callback(err);
		};

		onOpen = () => {
			removeListeners();
			callback(null, ws);
		};

		onClose = (ev) => {
			removeListeners();
			callback(util.getCloseError(ev));
		};

		ws.on('open', onOpen);
		ws.on('close', onClose);
		ws.on('error', onError);
	}

	validate(ws) {
		return ws.readyState === this.WebSocket.OPEN;
	}

	destroy(ws) {
		ws.close(1000, 'pool#destroy');
	}
}

module.exports = WsFactory;
