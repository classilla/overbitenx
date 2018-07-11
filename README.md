# OverbiteNX

OverbiteNX is a Gopher client add-on for Firefox that allows Firefox to access sites over [the historical Gopher protocol](https://en.wikipedia.org/wiki/Gopher_(protocol)). It is the successor to OverbiteFF, which no longer functions under WebExtensions.

OverbiteNX comes in two pieces: OverbiteNX itself, which is a standard WebExtensions-compatible Firefox addon; and Onyx, a native component that OverbiteNX drives through Firefox to perform network access. Onyx is supported on macOS (10.12+ and probably earlier versions), Windows (7 and up, 32- or 64-bit) and Linux, and may work on other tier-3 platforms that can run Firefox. OverbiteNX is supported on Firefox 60 and up on the same platforms. Both OverbiteNX and Onyx must be installed for proper functionality.

OverbiteNX and Onyx are provided to you under the [Floodgap Free Software License](https://www.floodgap.com/software/ffsl/). You use this software package at your own risk. It is otherwise unsupported, and no warranty is expressed or implied regarding merchantability or fitness for a particular purpose.

OverbiteNX and Onyx are copyright (C) 2017-8 Cameron Kaiser.
All rights reserved.

## OverbiteNX is currently in beta testing

OverbiteNX currently functions and runs, but has known bugs. If you want to help test or develop it, you will need to get your hands a little dirty.

## How to install the beta test

1. If you wish to have the source code for reference, clone or download this repo and put it somewhere convenient. If you don't have `git` on your computer, just [download this repo as a .zip file](https://github.com/classilla/overbitenx/archive/master.zip). However, as of the beta this is no longer required.

2. Install Onyx. You can get a pre-built binary from the [releases tab](https://github.com/classilla/overbitenx/releases) for Windows 7+ or macOS 10.12+, or see below on how to build from source (required for Linux/*BSD/etc.). The Windows version is distributed as an installer which can be run directly, and it can be uninstalled from the regular Add/Remove Programs control panel. The macOS version is distributed as a DMG; read the instructions inside the disk image for how to install and uninstall.

3. *You have a choice:* if you would like to use an officially signed extension, you can [download it from AMO](https://addons.mozilla.org/en-US/firefox/addon/overbitenx/). As the extension is updated, it will be automatically pushed to you. Alternatively, you can load the extension directly from the source code. In Firefox, go to `about:debugging` and add a "Temporary Add-on." Browse to where you put the repo, enter the `ext` directory, and select `manifest.json`. The disadvantage of loading it directly, however, is that you will need to repeat this step every time Firefox starts up.

4. Type or navigate to any URL starting with `gopher://`. Firefox will ask if you want to use OverbiteNX; you do (check the box if you want to remember that choice, which is strongly advised or you will see that requester box a lot). Assuming everything is correctly installed, the browser will download and display the requested resource.

If you notice any untoward behaviour, the current beta test generates copious debugging output to the Browser Console. Please include a transcript of this output in any issue you file.

## How to build from source

1. Onyx is written in portable C that should compile on nearly any POSIX-compliant system. There are some Win32-specific sections due to irregularities with Winsock. `gcc` and `clang` are both supported compilers.

2. If you have a Mac, and both Xcode and [MXE with NSIS](http://mxe.cc/) are installed, then you can just type `make` and the macOS DMG and Windows installer (and .xpi for Firefox, eventually) will be automatically built. If the Windows build blows up, make sure the path in `Makefile.mxe` is correctly pointing to your MXE binaries, and that you installed NSIS (which includes `makensis`). Note that the Mac application is unsigned. If you just want to build the Mac version by itself, do `make -f Makefile.macos` instead.

3. If you are building on Linux/*BSD/etc. or a Mozilla tier-3 system, make sure you have both `make` and a C compiler installed (either `gcc` or `clang` is acceptable, though you may need to symlink your `clang` to `gcc` depending on your system's configuration), and build Onyx with `make -f Makefile.generic`. Once this is done, copy the resulting `onyx` binary to your desired location. Copy `EXAMPLE_onyx.json` to `onyx.json` and change the path in that file to the location of your new `onyx` binary, then copy `onyx.json` to [where the native manifest should be on your system](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Native_manifests#Manifest_location). If you have MXE installed, you should also be able to build the Windows version (again, verify the path to your MXE binaries is correct) with `make -f Makefile.mxe`.

4. Building on Windows itself is not yet supported, but should work with [MinGW](http://www.mingw.org/). If you devise a working `Makefile` for this environment, please file a pull request.

5. To build the `.xpi` for Firefox, enter the `ext` directory and type `make`. The `.xpi` thus generated is unsigned. However, making and installing the `.xpi` is not necessary to test OverbiteNX (see step 3 above).

## Theory of operation

OverbiteNX is intended to be highly modular, both for purposes of maintenance and as an educational example of using native messaging to get around WebExtensions' sometimes ridiculous limitations. The basic notion is shown graphically: 

````
                  +------+
                  | Onyx |-----> Gopherspace
                  +------+
                      ^
native code           |
----------------------|-------------------------
add-on background     |
                      |       +---------+
                      |       |  Agate  |
                 +---------+  +---------+
     +---------->|  Topaz  |<----------+
     |           +---------+           |
     |                ^                |
     |                |                |
-----|----------------|----------------|--------
tabs |                |                |
 +--------+       +--------+      +--------+
 | Jasper |       | Jasper |      | Jasper | etc.
 +--------+       +--------+      +--------+
````

Onyx runs as a native application separately, though as a subprocess connected by pipes, of the browser. Within the browser, the OverbiteNX add-on has two background scripts, Topaz and Agate. Agate handles rewriting history and bookmarks to match the canonical URL (avoiding the user's bookmarks being polluted by `moz-extension:` URLs that may no longer be valid). Topaz acts as the gateway to Onyx, accepting and queueing requests from the Jasper client in each browser tab with a Gopher URL, and then passing the requests to Onyx and proxying the response back to the tab that made it. (This also includes some basic tab management, since knowing when a tab is closed or navigating away from a Gopher URL is necessary to properly maintain the work queue.)

The Jasper front-end functions essentially as a local AJAX web application. Once OverbiteNX's dispatch scaffold page is loaded into a tab by the browser's protocol handler, as far as the browser is concerned, the page is considered "loaded." However, the page then loads Jasper. The new instance of Jasper takes the encoded URL and makes it into a request to Topaz. Topaz queues the request, and when Onyx is idle, sends it to Onyx. Onyx makes the connection and returns data to the requesting instance of Jasper via Topaz, which is then used to asynchronously display the resource. This is very different than OverbiteFF, which implemented a low-level network channel, enabling it to be a "first-class protocol" in the browser. Because of this difference, Jasper implements its own progress bar and other UI elements (though Topaz provides the stop button as a page action because this also manipulates the work queue), since the browser is otherwise unaware of what is actually occurring. This difference also explains the basis of some particular limitations with OverbiteNX.

## Implementation notes

Onyx is written in C. Although C is not a safe language (please, Rusties, don't send me E-mail, I don't want to hear it), it is the most portable option right now and allows Onyx to be built with a minimal toolchain. Onyx also has no dependencies on any external libraries, and to further reduce its attack surface is written to do only the bare minimum amount of work necessary to connect to and pass data from a remote gopher site, shunting the remainder off to Topaz, Agate and Jasper.

Onyx transactions use a small subset of JSON, just objects with one single-letter key and a string value (which, for network requests and data, is a hex-encoded payload). The protocol is documented within Onyx's source code. Using this very small subset means Onyx doesn't need to be built with an entire JSON library which could have its own bugs, and also means malicious servers can't fuzz Onyx (or, for that matter, Topaz and Jasper) by causing malformed JSON to be generated.

Jasper uses a minimal UI so that the display "just works" on any configuration, and little localization work is required. Menu icons are actually emoji, and the font is always monospace.

Onyx only accepts requests to port numbers on its internal whitelist, which was observationally based off an extract of past and present servers in Veronica-2. Other port numbers are rejected.

## Irregularities and current limitations

Onyx is interruptable, but not currently multi-threaded. Topaz queues requests as they arrive from Jasper instances and sends the next request to Onyx when the prior request terminates. If the request is cancelled (such as the user navigating away, closing the tab, clicking the stop page action, etc.), Topaz will interrupt Onyx and then send the next request in queue. Until their request is serviced, however, Jasper instances with requests in the work queue must wait their turn. In practice this is only of interest if you have multiple Gopher tabs running, or if you have a particularly long and slow download. Making Onyx (and, thus, Topaz) multi-threaded is a future goal, but wasn't necessary for the MVP.

To stop the current transaction, you must either click the "stop sign" page action that appears during data transfer, or close the tab or navigate away. The browser does not know that an Onyx network transfer is in progress, so it does not enable the regular browser stop button. There is no known API to enable this in WebExtensions currently.

There is also no support in WebExtensions' `downloads` component for streaming data to a download session. Images and downloads must instead be pulled into browser RAM as a JavaScript `Blob` and then a blob URL generated to display the image or download the file. For this reason Topaz will cut off a transaction at 16MB to prevent a large file or a malicious server from causing you to run out of memory (especially on a 32-bit system), so if you intend to download your DVD .isos over Gopher, you probably want a dedicated client. However, it also requires Jasper to leak the blob URL so that you can continue to interact with the image and/or download when completed; if the blob URL is revoked immediately after the request finishes, then the browser acts as it does not exist, which is fairly inconvenient and causes unexpected behaviour.

HTML and XML files are currently displayed as plain text. Because Jasper looks like an AJAX web app to Firefox, there are security concerns about loading and displaying arbitary HTML inside the page scaffold. There may be a way to sanitize this in a future version, but because Jasper isn't a low-level channel, links to Gopher-hosted inline content (images, style sheets, JavaScript) within an HTML document will probably not work even then without implementing some sort of HTML renderer (yo dawg).

The address bar shows the address of the scaffold page within OverbiteNX, not the actual canonical URL. There appears to be no way to change this from the add-on itself. As a result, when you bookmark a Gopher URL, the star doesn't actually show up in the address bar (even though the Gopher URL is truly bookmarked) because Agate immediately rewrites it and thus it no longer matches the current address.

Related to this phenomenon is that both the OverbiteNX `moz-extension://` URL and the canonical `gopher://` URL appear in your history for any given Gopher site. Transparently deleting the `moz-extension://` URL wrecks the history of the current tab and there is no provision in WebExtensions for rewriting individual history entries, so Agate simply adds an entry instead.

Proxies are not yet supported by Onyx.

The inline view feature of OverbiteFF is not yet implemented in OverbiteNX.

CAPS support (for features such as path breadcrumbs, etc.) is not yet implemented in OverbiteNX.

If you have an idea how to fix or improve these issues, please file a pull request or issue.
