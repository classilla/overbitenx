/*
 * Topaz module: back end and native component interface (background)
 *
 * All requests from Jasper instances in browser tabs must go through the
 * single Topaz browser back end to the single Onyx native component back end.
 * Topaz also includes tab management to facilitate directly manipulating the
 * queue of tasks for Onyx.
 *
 * Copyright 2017-8 Cameron Kaiser.
 * All rights reserved.
 */

var requestQueue = [];
var currentTab = null;
var port = null;
var backendIdle = false;
var filtering = false;
var totalData = 0;

/*
 * Convert to Onyx hex-encoding for forming requests.
 */

function a2hex(str) {
	let hexx = '';
	let hex = '';
	for (var i = 0, l = str.length; i < l; i ++) {
		hex = Number(str.charCodeAt(i)).toString(16);
		if (hex.length < 2) hexx += "0";
		hexx += hex;
	}
	return hexx;
}
function shorttohex(short) {
	let hexx = "0000" + short.toString(16);
	return hexx.substring(hexx.length - 4);
}

/*
 * Read and process the next Jasper client request in the queue.
 */

function nextInOnyxQueue() {
	console.log("popqueue ("+requestQueue.length+")");

	// This shouldn't ever happen, but busy-wait if we hit this when
	// a tab was just closed.
	while(filtering) { /* */ }

	if (!requestQueue || requestQueue.length < 1) {
		currentTab = null;
		return;
	}

	backendIdle = false;

	// This is atomic, so we don't need to use the filtering mutex.
	let next = requestQueue.shift();
	currentTab = next.tab;
	console.log("popqueue now serving "+currentTab);

	let str = '';
	str += shorttohex(next.request.port);
	str += a2hex(next.request.itype);
	str += shorttohex(next.request.host.length);
	str += a2hex(next.request.host);
	str += a2hex(next.request.sel);
	str += "0d0a"; // \r\n

	console.log(str);

	try { 
		port.postMessage({ "a" : str });
	} catch(e) { console.log("postMessage: "+e); }
}

/*
 * Cancel the current transaction (if any).
 */

function cancelTransaction() {
	console.log("explicit cancel");
	// Don't set backendIdle to false here: wait for Onyx to
	// acknowledge and our message handler below will set it
	// when it does.

	port.postMessage({ "a" : "000000" });
	// NB: anything after port 0 is ignored; I'm just paranoid.
	currentTab = null;
}

/*
 * Cancel any arbitrary tab's transaction.
 */

function cancelByTab(id) {
	while(filtering) { /* */ }

	// Lock the queue and remove all entries matching that tab (if
	// there are entries in the queue).
	if (requestQueue && requestQueue.length) {
		filtering = true;
		requestQueue = requestQueue.filter((value) => {
			return value.tab != id;
		});
		filtering = false;
	}

	// If we cancelled the transaction for the tab currently being
	// serviced, explicitly cancel so that the next one can be handled.
	// Always check this since we could be handling a request with an
	// empty queue.
	if (currentTab == id)
		cancelTransaction();
}

/*
 * Page action for cancellation. This is set and handled in the background,
 * so it's better to do it here since we have access to the queue.
 */

browser.pageAction.onClicked.addListener((tab) => {
	browser.pageAction.hide(tab.id);
	cancelByTab(tab.id);
	browser.tabs.sendMessage(tab.id, { "f" : "1:terminated" });
});

/*
 * Handlers for message events from instances of Jasper and from Onyx.
 */

// Get URLs from Jasper content script instances so we can push data back.
// Since multiple Jaspers within multiple tabs could be asking, we queue the
// requests since Onyx v1 does not multiplex connections.
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// If the port to Onyx is not connected, connect the port.
	if (!port) {
		try {
			port = browser.runtime.connectNative("onyx");
			port.onDisconnect.addListener((p) => {
				// This is called if the connection fails,
				// such as improper installation or Onyx not
				// being present on this system. We don't
				// care about "orderly" disconnects since Onyx
				// does its own cleanup.
				if (!p.error) return;
				console.log("onDisconnect called: "+p.error);

				// If Onyx unexpectedly quits, we should tell
				// the current tab. If it never starts, there
				// won't be a current tab, so we should tell
				// the sender.
				let q = (currentTab) ? currentTab : 
					sender.tab.id;
				if (!q) return; // ?!
				browser.pageAction.hide(q);
				browser.tabs.sendMessage(q,
					{ "e" : "no_onyx" });
				port = null; // force a retry
			});
		} catch(e) {
			console.log("While connecting to Onyx: "+e);
			port = null;
		}
		if (!port) {
			console.log("Failed to initialize Onyx connection");
			browser.tabs.sendMessage(sender.tab.id,
				{ "e" : "no_onyx" });
			return;
		}

		// Master function for handling responses from Onyx.
		port.onMessage.addListener((response) => {
			// The init message is handled here.
			if (response.i) {
				console.log(browser.runtime.getManifest().version
					+ " Onyx init: "+response.i);
				backendIdle = true;
				nextInOnyxQueue();
				return;
			}

			// Other messages are forwarded to the current tab,
			// but ignore them if the current tab has gone away.
			if (!currentTab) return;

			console.log("message to "+currentTab);
			if (response.e) {
				console.log("Onyx error: "+response.e);
				browser.pageAction.hide(currentTab);
				browser.tabs.sendMessage(currentTab, response);
				backendIdle = true;
				nextInOnyxQueue();
			} else if (response.s) {
				console.log("Onyx status: "+response.s);
				browser.tabs.sendMessage(currentTab, response);
				totalData = 0;
			} else if (response.d) {
				console.log("Onyx data");

				// To avoid a malicious server sending us more
				// data than we can fit in memory, limit the
				// total response per request to 16MB. If you
				// need to download ISOs over Gopherspace, I
				// strongly advise a dedicated client (or
				// some way to avoid having to load binary
				// data into Blobs).
				totalData += response.d.length;
				if (totalData > 2 * 16 * 1024 * 1024) {

		console.log("Gopher transaction exceeds 16MB, terminated.");

					browser.tabs.sendMessage(currentTab,
						{ "f" : "1:data_limit" });
					cancelByTab(currentTab);
					return;
				}
				browser.tabs.sendMessage(currentTab, response);
			} else if (response.f) {
				console.log("Onyx fin: "+response.f);
				browser.pageAction.hide(currentTab);
				browser.tabs.sendMessage(currentTab, response);
			} else
				console.log("Onyx WTF "+JSON.stringify(response));
		});
	}

	// Client request.
	// Remove all other queued requests from this tab and cancel as
	// needed, since a tab can have only one request pending.
	// If this was the same tab being serviced, mark the backend idle.
	// We do it this way because cancelByTab can change what we think
	// is the tab currently being serviced.
	if (currentTab == sender.tab.id) {
		cancelByTab(sender.tab.id);
		backendIdle = true; // we know this must be the case!
	} else
		cancelByTab(sender.tab.id);

	// Validation occurs on the client side, since it has to know
	// what the itype is (so it would have to have parsed it).
	requestQueue.push({
		tab : sender.tab.id,
		request : request
	});

	// The user can cancel while the request is queued (in fact, we
	// encourage it, since it means less useless traffic through Onyx).
	browser.pageAction.show(sender.tab.id);

	if (backendIdle)
		nextInOnyxQueue();
});

// Filter tabs as we close so that leftover requests they may have made do not
// get uselessly sent to Onyx.
browser.tabs.onRemoved.addListener((id, info) => { cancelByTab(id); });

// If the user navigates to a different URL while the gopher resource is
// loading, and the tab they're using is the one being serviced, cancel it.
browser.tabs.onUpdated.addListener((id, info, tab) => {
	if (currentTab == id && info.url && info.url.length) {
		cancelByTab(id);
		backendIdle = true; // we know this must be the case!
	}
});

