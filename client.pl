#!/usr/bin/perl

# Copyright 2017-8 Cameron Kaiser.
# All rights reserved.
#
# This script emits a NativeMessaging request over stdout which can be
# piped to Onyx for testing.
#
# For Win32, see wintest.c.

sub post {
	$string = "{\"a\":\"" .
		sprintf("%04x", $port) .
		unpack("H2", $itype) .
		sprintf("%04x", length($host)) .
		unpack("H*", $host) .
		unpack("H*", $sel). "0d0a" .
	"\"}";

	print STDOUT pack("L", length($string)) . $string;
}

select(STDOUT); $|++;
($host, $port, $itype, $sel) = (@ARGV);
die("usage: $0 host port itype sel | onyx\n")
	if (!length($itype));
&post;

sleep 11;

