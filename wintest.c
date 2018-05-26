/* Copyright 2018 Cameron Kaiser.
   All rights reserved.

   Test harness for Onyx on Win32. This launches it as a subprocess
   and sends it a request as the browser would. The subprocess is needed
   to make sure the pipe stays open long enough (or else Onyx will self
   terminate).

   For non-Windows with Perl, see client.pl. */

#include <windows.h> 
#include <tchar.h>
#include <stdio.h> 
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <unistd.h>
#include <assert.h>

int main(int argc, char **argv) {
	PROCESS_INFORMATION pi;
	SECURITY_ATTRIBUTES sa;
	STARTUPINFO si;
	HANDLE hsir, hsiw;
	BOOL rv;
	DWORD dw, dr;
	char strig[1024];
	uint32_t *phony, l;
	int c, i, j, k, p;

	phony = (uint32_t *)strig;
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
	assert(sizeof(uint32_t) == 4);
	// Leave room at the beginning for the 32-bit length.
	sprintf((char *)(strig + 4), "{\"a\":\"%04x%02x%04x%04x",
		p, // port
		(unsigned char)argv[3][0], // item type
		(unsigned int)strlen(argv[1])); // host length
	// Start inserting after this header.
	l = 20;
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

	phony[0] = l - 4; // evil way to set length. Don't include length word!

	sa.nLength = sizeof(SECURITY_ATTRIBUTES);
	sa.bInheritHandle = TRUE;
	sa.lpSecurityDescriptor = NULL;

	// Create child stdin pipe.
	if (!CreatePipe(&hsir, &hsiw, &sa, 0)) {
		DWORD er = GetLastError();
		fprintf(stderr, "error (CreatePipe 2) %i\n", er);
		exit(255);
	}
	// Ensure it is not inherited.
	if (!SetHandleInformation(hsiw, HANDLE_FLAG_INHERIT, 0)) {
		DWORD er = GetLastError();
		fprintf(stderr, "error (SetHandleInformation 2) %i\n", er);
		exit(255);
	}

	// Since we are not trying to capture stdout/stderr, we don't
	// need to do the same steps for that (hsor/hsow, hsor). Instead,
	// just create the child process now.
	ZeroMemory(&pi, sizeof(PROCESS_INFORMATION));
	ZeroMemory(&si, sizeof(STARTUPINFO));
	si.cb = sizeof(STARTUPINFO);
	si.hStdError = GetStdHandle(STD_OUTPUT_HANDLE); // "hsow"
	si.hStdOutput = GetStdHandle(STD_OUTPUT_HANDLE); // "hsow"
	si.hStdInput = hsir;
	si.dwFlags |= STARTF_USESTDHANDLES;

	rv = CreateProcess(TEXT("onyx.exe"), TEXT("onyx.exe"),
		NULL, // security attributes
		NULL, // primary thread SA
		TRUE, // inherit handles
		0,    // flags
		NULL, // use parent env
		NULL, // use parent cwd
		&si,
		&pi);

	if (!rv) {
		DWORD er = GetLastError();
		fprintf(stderr, "error (CreateProcess) %i\n", er);
		exit(255);
	}

	CloseHandle(pi.hProcess);
	CloseHandle(pi.hThread);

	WriteFile(hsiw, strig, (DWORD)l, NULL, NULL);

	// Onyx self-terminates when it determines there is no more data
	// on stdin and/or the stdin pipe has terminated. Thus, we don't need
	// to set JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE. Just wait around to
	// make sure all data is received.

	Sleep(11000);
	return 0;
}

