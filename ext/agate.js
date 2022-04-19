/*
 * Agate module: URL rewrite support (background)
 *
 * Copyright 2018, 2022 Cameron Kaiser.
 * All rights reserved.
 */


// If we change the URL for the browser scaffold, it needs to change here too.
var me = browser.runtime.getURL("d");

function munge(url) {
	if (url.indexOf(me) != 0) return null;

	let nurl = decodeURIComponent(url.substring(url.indexOf("?")+1));
	return nurl;
}

function canonicalizeBookmark(id, item) {
	let nurl = munge(item.url);
	if (nurl) {
		// Change the URL to what the user "expects" as bookmarks
		// are created. We don't care if this succeeds or fails.
		browser.bookmarks.update(id, { url : nurl });
	}
}

function canonicalizeHistory(item) {
	let nurl = munge(item.url);
	if (nurl) {
		// Change the history entry to the URLs the user "expects."
		// Deleting the prior history items has a tendency to muck
		// up the tab's history, though it's more elegant, so we
		// leave the old history entries alone and just add new ones
		// so that the omnibar will suggest them (hopefully with
		// higher affinity). We don't care if this succeeds or fails.
		//
		// XXX: If Mozilla ever adds the ability to look at an
		// individual tab's history easily, then we could add a tab
		// closer handler here to filter the history when the tab is
		// closed and clean this up a little better.

		browser.history.addUrl({
			url : nurl,
			title : item.title,
			transition : item.transition,
			visitTime : item.visitTime
		});
	}
}

browser.bookmarks.onCreated.addListener(canonicalizeBookmark);
browser.history.onVisited.addListener(canonicalizeHistory);
