/* Copyright 2018 Cameron Kaiser.
   All rights reserved.

   XXX: This isn't used right now. client.pl is better on Unix things.
   For Win32, see wintest.c. */

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
	char strig[1024];
	uint32_t l;
	int c, i, j, k, p;

	if (argc != 5) {
		fprintf(stderr, "usage: %s host port itype sel\n",
			argv[0]);
		exit(255);
	}
	p = atoi(argv[2]);
	if (p < 1 || p > 65535) {
		fprintf(stderr, "nonsense port: %d\n", p);
		exit(255);
	}
	sprintf(strig, "{\"a\":\"%04x%02x%04x",
		p,
		(unsigned char)argv[3][0], 
		(unsigned int)strlen(argv[1]));
	l = strlen(strig);
	c = 1; /* host */
	for(;;) {
		unsigned char ln, hn;

		for(i=0; i<strlen(argv[c]); i++) {
			ln = argv[c][i] & 0x0f;
			hn = argv[c][i] >> 4;
			strig[l++] = (hn > 9) ? hn + 87 : hn + 48;
			strig[l++] = (ln > 9) ? ln + 87 : ln + 48;
		}
		if (c == 4)
			break;
		c = 4; /* sel */
	}
	// add 0d0a
	strig[l++] = '0';
	strig[l++] = 'd';
	strig[l++] = '0';
	strig[l++] = 'a';
	strig[l++] = '"';
	strig[l++] = '}';
	strig[l] = '\0';

	fwrite(&l, sizeof(uint32_t), 1, stdout);
	fprintf(stdout, "%s", strig);
	fflush(stdout);
	sleep(3);
	return 0;
}
