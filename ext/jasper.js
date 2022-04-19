/*
 * Jasper module: front end
 *
 * Copyright 2017-2022 Cameron Kaiser.
 * All rights reserved.
 */

var itype = null;
var sel = null;
var host = null;
var port = -1;

var prog = 0;
var buf = [];
var mbuf = "";
var fnum = 0;

var url = null;
var url_s = "";
var url_p = "";
var hopo_s = "";

/*
 * Translate hex-encoded data from Topaz into ready-to-use formats.
 */

function hex2a(hexx) {
	// Hex to string, including any necessary UTF-8 conversion.
	let ta = hex2ta(hexx);

	// Do this in pieces to avoid overflowing Function.prototype.apply
	// if we ever get big chunks.
	let str = "";
	let i = 0;
	let len = ta.length;
	for (i=0; i<len; i += 32768) {
		str += String.fromCharCode.apply(null,
			ta.slice(i, Math.min(i+32768, len)));
	}

	return str;
}

function hex2ta(hexx) {
	// Hex to array of Uint8Arrays.

	let hex = hexx.toString();
	if ((hex.length & 0x01)) {
		throw "illegal hex length "+hex.length+" received from onyx";
		return null;
	}
	return new Uint8Array(hex.match(/[\dA-F]{2}/gi).map(function(s) {
		return parseInt(s, 16);
	}));
}

/*
 * Basic library functions
 */

function di(x)    { return document.getElementById(x); }
function out(x)   { di("data").insertAdjacentHTML('beforeend', x); }
function eout(x)  { di("data").insertAdjacentHTML('beforeend', 
			"<!-- " + x + " -->\n"); }
function clean(x) {
	// Clean an arbitrary string for display in an HTML page.
	x = x.replace(/\&/g, "&amp;");
	x = x.replace(/\</g, "&lt;");
	x = x.replace(/\>/g, "&gt;");

	// whitespace is a beyotch!
	x = x.replace(/  /g,              "&nbsp;&nbsp;");
	x = x.replace(/ \&nbsp;/g,        "&nbsp;&nbsp;");
	x = x.replace(/\&nbsp; /g,        "&nbsp;&nbsp;");
	x = x.replace(/^ /,               "&nbsp;");

	return x;
}

/*
 * UI
 */

function progress(i) {
	// Control the front-end client bar.

	if ((prog + i) > 99) {
		prog = 100;
		di("prog_b").value = 100;
		setTimeout(function() {
			di("prog").style.display = "none";
		}, 100);
		return;
	}

	if ((prog + i) > 80) {
		prog = 80;
		di("prog").removeAttribute("value");
		return;
	}
	prog += i;
	di("prog_b").value = prog;
}

function clicker(e) {
	// Global document click handler (but just for local URLs). This
	// serves two purposes: first, it speeds up navigation considerably,
	// and second, it avoids a glitch with history munging when we put
	// protocol-handler-handled URLs back-to-back-to-back. This is
	// (expectantly) installed when a menu type is loaded.

	// Uh.
	if (!e.target || !e.target.tagName)
		return true;

	// Ignore clicks on things that aren't links or form buttons.
	if (e.target.tagName != "BUTTON" && e.target.tagName != "A")
		return true;

	// Ignore anything but left clicks.
	if (!e.which || e.which != 1)
		return true;

	// Button clicks handled here. These are for anything with an
	// embedded form, such as itype 7.
	if (e.target.tagName == "BUTTON") {
		e.preventDefault();

		// Recover the ID number.
		let i = e.target.id.substr(3);
		// Redirect to the search server encoded in the page.
		let k = "?" +
			di("_fl" + i).value + // already encoded
			"%09" +
			encodeURIComponent(di("_ft" + i).value);
		console.log(k);
		location.href = k;
		return false;
	}

	// Ignore clicks on links that are likely to be handled directly
	// by the browser. Right now this is HTTP(S) and FTP.
	if (!e.target.href || e.target.href.indexOf("http") == 0 ||
			e.target.href.indexOf("ftp://") == 0)
		return true;

	// The link is either ours, or likely to be run by a protocol
	// handler. Don't ignore it to avoid the tab munging glitch.
	e.preventDefault();

	if (e.target.href.indexOf(url_p) == 0)
		// Ours. This is faster, and doesn't munge the tab history.
		// The URL is already sanitized; the browser will encode it.
		location.href = "?" + e.target.href;
	else
		// Not ours. Open a new tab with the new protocol handler.
		browser.tabs.create({ url : e.target.href });
	return false;
}

function uierror(w, x) {
	// Display a UI error message.
	progress(100);

	di("pre").style.display = "none";
	di("title").insertAdjacentHTML('afterbegin', w);
	di("data").insertAdjacentHTML('afterbegin',
		'<div class="itype"></div>' +
		'<div class="ds">' + x + '</div>');
	di("title").style.display = "";
	di("data").style.display = "";
}

const _EMOJI_UNSUPPORTED = "&#x26D4;"; // not supported
function icontype(i) {
	// Returns an emoji icon for a supported item type, or the
	// universal unsupported item type icon.
	return (
		(i == "i") ? "&nbsp;" :    // exception

		(i == "0") ? "&#x1F4C4;" : // document
		(i == "1") ? "&#x1F4C1;" : // menu
		// XXX: itype 2 not yet supported
		(i == "3") ? "&#x26A0;"  : // error icon
		(i == "4") ? "&#x1F4BE;" : // BinHex
		(i == "5") ? "&#x1F4BE;" : // zip
		(i == "6") ? "&#x1F4BE;" : // uucode
		(i == "7") ? "&#x1F50D;" : // search
		(i == "8") ? "&#x1F4DE;" : // tel-net (get it?)
		(i == "9") ? "&#x1F4BE;" : // generic binary
		(i == "d") ? "&#x1F4D1;" : // PDF document
		(i == "g") ? "&#x1F4F7;" : // GIF
		(i == "h") ? "&#x1F4C4;" : // HTML document
		(i == "p") ? "&#x1F4F7;" : // PNG
		(i == "s") ? "&#x1F50A;" : // audio file
		(i == "x") ? "&#x1F4C4;" : // XML document
		(i == "I") ? "&#x1F4F7;" : // JPEG or other images
		(i == "T") ? "&#x1F4DE;" : // tel-net 3270 (get it?)
		(i == ";") ? "&#x1F3A5;" : // movie file
	_EMOJI_UNSUPPORTED);
}

/*
 * Process menu items
 */

function next(x, p) {
	// Process a tab-delimited line into a head and tail.
	let y = x.indexOf("\t");
	if (y < 0) { eout(p); return [ null, null, p ]; }

	let k = x.substr(0,y);
	let l = x.substr(y+1);
	// k (the head) can be 0-length, but not l (the tail).
	if (!l || !l.length) { eout(p); return [ null, null, p ]; }

	return [ k, l, null ];
}

function pushMenuData(s) {
	// Receive and process menu data as it comes.
	mbuf += s;

	for(;;) {
		if (mbuf.indexOf("\n") < 0) {
			// We don't have a full item to process.
			return;
		}
		let ds = null;
		let p  = -1;
		let h  = null;
		let s  = null;
		let e  = 0;
		let i  = null;
		let l  = null;

		let m    = mbuf.substr(0, mbuf.indexOf("\n"));
		    mbuf = mbuf.substr(mbuf.indexOf("\n") + 1);

		[ ds, m, e ] = next(m, "no selector"); if (e) continue;
		if (ds.length < 2) {
			// It is possible, and the RFC does not forbid,
			// to have a null display string. As a practical
			// matter, however, this is only viable for i
			// itemtype. Note that doing it this way may cause
			// us to accept otherwise non-RFC-adherent lines.
			if (ds == "i") {
				out(
					'<div class="itype">&nbsp;</div>' +
					'<div class="ds">&nbsp;</div>' + "\n"
				);
				continue;
			}
			eout("invalid display string");
			continue;
		}

		// Separate the itype and clean the display string to be
		// HTML-safe.
		i  = ds.substr(0, 1);
		ds = clean(ds.substr(1));

		[ s, m, e ] = next(m, "no host"); if (e) continue;
		[ h, m, e ] = next(m, "no port"); if (e) continue;

		// Don't allow hostnames with naughty characters.
		// Other characters won't resolve, but shouldn't result in
		// exploitable HTML, at least.
		if (h.indexOf("\\") > -1 || h.indexOf('"') > -1 ||
				h.indexOf(">") > -1 || h.indexOf("<") > -1) {
			eout("invalid character in hostname");
			continue;
		}

		// Validate the item type and assign an emoji icon.
		let ee = icontype(i);

		// We can stop and process hURLs plus itypes i and 3 now
		// since these do not need to be otherwise validated.
		// This code also handles item types we don't support.
		if (i == "i" || i == "3" || ee == _EMOJI_UNSUPPORTED) {
			out(
				'<div class="itype">' + ee + '</div>' +
				'<div class="ds">'    + ds + "</div>\n"
			);
			continue;
		}
		if (i == "h" &&
			// Other h's fall through.
				((s.indexOf("URL:") == 0 && s.length > 4)
					||
				 (s.indexOf("/URL:") == 0 && s.length > 5))
			) {
			if (s.charAt(0) == "/") s = s.substr(1);
			s = s.substr(4);

			if (s.indexOf("\\") > -1 || s.indexOf('"') > -1 ||
				s.indexOf(">") > -1 || s.indexOf("<") > -1) {
				eout("invalid character in hURL");
				continue;
			}

			// Only whitelisted schemes are allowed.
			if (
				s.indexOf("news:") != 0     &&
				s.indexOf("cso://") != 0    && // Lynx, not RFC
				s.indexOf("ftp://") != 0    &&
				s.indexOf("git://") != 0    &&
				s.indexOf("ssh://") != 0    &&
				s.indexOf("http://") != 0   &&
				s.indexOf("nntp://") != 0   &&
				s.indexOf("wais://") != 0   &&
				s.indexOf("mailto:") != 0   &&
				s.indexOf("https://") != 0  &&
				s.indexOf("whois://") != 0  &&
				s.indexOf("gopher://") != 0 && // how meta
				s.indexOf("rlogin://") != 0 && // Lynx, not RFC
				s.indexOf("telnet://") != 0 && 
				s.indexOf("tn3270://") != 0 &&
			1) {
				eout("hURL scheme not on whitelist");
				continue;
			}

			out(
				'<div class="itype">' +
				'<a href="' + s + '">&#x1F517;</a></div>' +
				'<div class="ds">' + 
				'<a href="' + s + '">' + ds + "</a></div>\n"
			);
			continue;
		}

		// Interactable types.
		if (m.indexOf("\t") > 0) {
			// It is possible to have trailing fields after the
			// declared port number, and we should support that
			// (as much for eventual Gopher+ support as well as
			// future extensions to the protocol).
			[ p, m, e ] = next(m, "syntax error");
			if (e) continue;
		} else {
			p = m;
		}
		p = parseInt(p);
		if (p < 1 || p > 65535) {
			eout("preposterous port number "+p);
			continue;
		}

		// Process legacy GET links (we need the port number for
		// them). We only support port 80; the future is hURLs,
		// and people should be using those in new installations.
		// Intentionally allow malformed GETs to fallthru and
		// generate malformed menu entries to punish lazy admins.
		if (i == "h" && p == 80 && s.indexOf("GET /") == 0) {
			s = s.substr(4);
			if (s.indexOf("\\") > -1 || s.indexOf('"') > -1 ||
				s.indexOf(">") > -1 || s.indexOf("<") > -1) {
				eout("invalid character in GET URL");
				continue;
			}
			s = "http://" + h + s;
			out(
				'<div class="itype">' +
				'<a href="' + s + '">&#x1F517;</a></div>' +
				'<div class="ds">' + 
				'<a href="' + s + '">' + ds + "</a></div>\n"
			);
			continue;
		}
			
		// Process itype 8 and itype T.
		if (i == "T" || i == "8") {
			let sc = (i == "8") ? "telnet" : "tn3270";

			// The selector may or may not be relevant and is
			// mostly informational. We'll allow it under the
			// same rules as hURLs.
			if (s.indexOf("\\") > -1 || s.indexOf('"') > -1 ||
				s.indexOf(">") > -1 || s.indexOf("<") > -1) {
				eout("invalid character in telnet selector");
				continue;
			}

			s = sc + "://" + h + ((p == 23) ? "" : ":"+p) + "/" + s;
			out(
				'<div class="itype">' +
				'<a href="' + s + '">' + ee + '</a></div>' +
				'<div class="ds">' + 
				'<a href="' + s + '">' + ds + "</a></div>\n"
			);
			continue;
		}

		// All other types follow.
		// The selector needs to be URL-safe. However, we undo
		// slash conversion to maintain a reasonably visually
		// parseable path given that most hosts are now POSIX.
		s = encodeURIComponent(s);
		s = s.replace(/\%2[fF]/g, "/");

		// Compute the new URL.
		l = url_p + "://" + h + ((p == 70) ? "" : ":"+p) +
			"/" + i + s;

		// Process itype 7 (put up a form) -- eventually itype 2.
		// See clicker() for how this works.
		if (i == "7" /* || i == "2" */) {
			out(
				'<div class="itype">' + ee + '</div>' +
				'<div class="ds">' +
				'<div class="fds">' + ds + '<div>' +
		'<input id="_fl' + fnum + '" type="hidden" value="'
				+ encodeURIComponent(l) + '"/>' +
		'<input id="_ft' + fnum + '" type="text" size="40" maxlength="256"/>' +
		'<button id="_fb' + fnum + '">&gt;&gt;</button>' +
				"</div></div></div>\n"
			);

			fnum++;
			continue;
		}

		// The remainder are document types.
		// Emit the completed menu entry.
		out(
			'<div class="itype">' +
			'<a href="' + l + '">' + ee + '</a></div>' +
			'<div class="ds">' +
			'<a href="' + l + '">' + ds + "</a></div>\n"
		);
	}
}

/*
 * Handle messages from Topaz.
 *
 * Most Topaz messages originate in Onyx ultimately and are proxied to the
 * client being serviced. These messages fall into several types:
 *
 * E-response: error occurred prior to data, terminal
 * S-response: status message, non-terminal
 * D-response: data packet, non-terminal
 * F-response: fin(al) packet, terminal, success or failure
*/

function handleMessage(response, sender, sendResponse) {
	if (response.e) {

		/*
		 * E-responses are terminal and include an ASCII keyword
		 * explanation. All but one originate from Onyx.
		 *
		 * This is generated by Topaz when Onyx is not present:
		 * no_onyx
		 *
		 * These relate to me being incompetent:
		 * no_length_header: we screwed up. "Shouldn't happen"
		 * bad_length_header: we screwed up. "Shouldn't happen"
		 * syntax_error: we screwed up. "Shouldn't happen"
		 *
		 * These (probably) don't relate to me being incompetent:
		 * port_not_allowed: port not in Onyx whitelist. The port
		 *   number is appended in case I actually was incompetent.
		 * resolve: host not found
		 * timeout: timeout on connect (timeout on data is an
		 *   F-response)
		 * socket: connection failure. A system-dependent error
		 *   code is appended.
		 * write_failed: failure between connect and sending request
		 *
		 * For the purposes of the current request, these are
		 * unrecoverable, but the user may be able to try it again.
		*/

		let k = "";
		progress(100);

		if (response.e == "no_onyx") {
			uierror("Onyx is not installed",
"OverbiteNX requires the Onyx native component to access Gopher sites." +
'</div><div class="itype"></div><div class="ds"><ol>' +
"<li><b>Install</b> Onyx for your operating system from "+
'<a href="https://github.com/classilla/overbitenx/releases" target="_blank">Github</a>.' +
"<li><b>Reload</b> this page." +
"</ol></div>");
			return;
		} else if (response.e.substr(0,17) == "port_not_allowed:") {
			k = "&#x1F6AB; "; // prohibited
			document.title = "Port not allowed: "+hopo_s;
		} else if (response.e == "resolve") {
			k = "&#x274C; "; // red X
			document.title = "Host not found: "+host;
			di("title").insertAdjacentHTML('afterbegin', k+host);
			return;
		} else if (response.e == "timeout") {
			k = "&#x231B; "; // empty hourglass
			document.title = "Timeout on connect: "+hopo_s;
		} else if (response.e == "write_failed" ||
				response.e.substr(0,7) == "socket:") {
			k = "&#x1F6AB; "; // prohibited
			document.title = "Connection failure: "+hopo_s;
		} else {
			console.log("unexpected E-response "+response.e);
			return;
		}

		di("title").insertAdjacentHTML('afterbegin', k+hopo_s);
		return;

	} else if (response.s) {

		/*
		 * S-responses include an ASCII keyword explanation.
		 *
		 * connecting: host resolved
		 * connected: host connected
		 * data: request sent, data imminent
		*/

		if (response.s == "connecting") {
			// Just set the document title to the URL. This,
			// in turn, looks "correct" in the history dropdowns.
			document.title = url_s;

			if (itype == "0" || itype == "2" /* eventually */ ||
				itype == "x" || itype == "h" /* stopgap */) {
				// Text type
				// We don't need to clear the fields, just
				// disable the ones we don't want showing.
				// This only gets triggered once per load.
				di("data").style.display = "none";
				di("title").style.display = "none";
			} else if (itype == "1" || itype == "7") {
				// Menu type
				di("pre").style.display = "none";

				// Install the document click handler (but
				// see clicker() for why).
				document.addEventListener("click", clicker);
			} else {
				// Binary type
				di("pre").style.display = "none";
				di("title").style.display = "none";
			}
			buf = [];
			mbuf = "";
			prog = 0;
			fnum = 0;
		} else if (response.s == "connected") {
			progress(10);
		} else if (response.s == "data") {
			progress(20);
			if (itype == "1" || itype == "7") {
				let s = encodeURIComponent(sel);
				s = s.replace(/\%2[fF]/g, "/");
				s = itype + s;
				if (s == "1/" || s == "1" || s == "/1/") s = "";
					di("title").insertAdjacentHTML(
						'afterbegin', 
						url_p + "://" +
					'<a href="' + url_p + '://' + hopo_s
					+ '/1">' + hopo_s + '</a>/' + s);
			}
		} else {
			console.log("unexpected state from Onyx: "+response.s);
		}
		return;

	} else if (response.f) {

		/*
		 * F-responses are terminal.
		 * If the first character is 1, a failure has occurred.
		 * If the first character is 0, the transfer succeeded.
		*/

		progress(100);

		if (response.f.charAt(0) == "1") {
			// Failure. Stop. The data is not valid.
			// The F-response includes additional information
			// which we don't process in this version.
			return;
		}

		/* A successful transfer; the data is valid. However, we
		   may need to do additional translation at this point for
		   binary data.

		   For blob types, unfortunately we can't revoke the URL
		   because the user may interact with it after the load
		   (such as saving images, download manager, etc.). The
		   best solution right now is just to leak the URL and
		   hope for the best. */

		if (itype == "4" || itype == "5" || itype == "6"
				|| itype == "d" || itype == "s" || itype == ";"
				|| itype == "9") {
			let blob = new Blob(buf, { type: "octet/stream" });
			let url = window.URL.createObjectURL(blob);
			browser.downloads.download({
				url: url,
				filename: url_s.split('\\').pop().split('/').pop(),
				saveAs: true // stop drive-by downloads
			});
			// XXX: downloads.onErased could allow us to free the
			// blob. Have to think about how that would work.
		} else if (itype == "I" || itype == "g" || itype == "p") {
			let blob = new Blob(buf, { type : (
				(itype == "g") ? "image/gif" :
				(itype == "p") ? "image/png" :
				"image/jpeg"
			)});
			let img = document.createElement("img");
			img.src = window.URL.createObjectURL(blob);
			document.body.appendChild(img);
		}
		return;

	} else if (response.d) {

		/*
		 * D-response. A hex-encoded data packet is attached.
		 */

		progress(1);

		if (itype == "4" || itype == "5" || itype == "6" ||
					itype == "9" ||
				itype == "s" || itype == "d" || itype == ";" ||
				itype == "I" || itype == "g" || itype == "p") {
			// Binary type
			buf.push(hex2ta(response.d));
		} else if (itype == "0" || itype == "2" /* eventually */ ||
				itype == "x" || itype == "h" /* stopgap */) {
			// Text type
			let k = hex2a(response.d);
			k = k.replace(/\&/g, "&amp;");
			k = k.replace(/\</g, "&lt;");
			k = k.replace(/\>/g, "&gt;");

			di("pre").insertAdjacentHTML('beforeend', k);
		} else  // Menu type
			pushMenuData(hex2a(response.d));
		return;

	}
	console.log("Unexpected message type "+ JSON.stringify(response));
}

/*
 * Send the URL to the Topaz backend
 */

// The user might try to save the page to disk. If so, the URL should not
// be sent: it's no longer valid, and we're not in a WebExtensions context.
// Handle this situation immediately.
if (typeof browser !== "undefined") {
	// Now within WebExtension context in the browser. Send the message.

	browser.runtime.onMessage.addListener(handleMessage); try{ (function(){

	// Validate the URI, but the built-in URI object only allows HTTP, so
	// make it think it's got one. If this trick fails, we wouldn't have
	// properly parsed it anyway, so no harm done. However, if we got this
	// URI from a form submission, it will have an embedded tab we will
	// need to preserve or it will be swept away as meaningless whitespace.

	let fq = "";
	url_s = decodeURIComponent(document.location.search.substr(1));
	if (url_s.indexOf("\t") > 0) { // invalid otherwise
		fq = url_s.substr(url_s.indexOf("\t")); // include the tab
		url_s = url_s.substr(0, url_s.indexOf("\t"));
	}
	url_p = url_s.substr(0, url_s.indexOf("://"));

	url = new URL("https" + url_s.substr(url_s.indexOf("://")));
	if (url && url.hostname && url.pathname) {
		// If pathname is '' or '/' then itype == 1.
		// Otherwise, pathname must be at least two characters,
		// and itype is its second character.
		let pathn = decodeURIComponent(url.pathname);

		if (pathn == "" || pathn == "/") {
			itype = "1";
			sel = pathn;
		} else if (pathn.length > 1) {
			itype = pathn.substr(1, 1);
			sel = pathn.substr(2);
		} else {
			throw {
				w : "Couldn't understand URL", x :
"The URL you typed could not be processed into a valid Gopher request."
			}; 
			return;
		}

		// Reject bad itypes.
		let ee = icontype(itype);
		if (ee == "&nbsp;" || ee == _EMOJI_UNSUPPORTED ||
			// These are allowed in menus, but not directly.
				itype == "8" || itype == "T") {
			let ii = clean(itype); // don't be naughty
			throw {
				w : "Unsupported item type "+ii, x :
"OverbiteNX does not currently support accessing resources of this type."
			};
			return;
		}

		// Proceed to document load.
		// Add back any query parameters.
		if (url.search)
			sel += url.search;
		sel += fq;
		host = url.hostname;
		port = parseInt(url.port);
		port = (port > 0) ? port : 70;
		hopo_s = host + ((port != 70) ? (":"+port) : "");

		browser.runtime.sendMessage({
			host: host,
			itype: itype,
			port: port,
			sel: sel
		});
	} else {
		throw {
			w : "Couldn't understand URL", x :
"The URL you typed could not be processed into a valid Gopher request."
		}; 
	} }());
	} catch(e) {
		// Error. However, the page hasn't loaded yet, so we do
		// this instead:
		window.addEventListener("load", function() {
			if (e.w) {
				uierror(e.w, e.x);
			} else {
				uierror("Unexpected error", e);
			}
		});
	}
}
