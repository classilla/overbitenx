/* Copyright 2017-8 Cameron Kaiser.
   All rights reserved.
   Released under the Floodgap Free Software License.

   The Onyx native component is the heart of OverbiteNX. It accepts hex-encoded
   JSON requests over standard input in compliance with the WebExtensions
   Native Messaging protocol and emits hex-encoded responses.
   It supports POSIX and Win32.

*/

#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>
#include <sys/types.h>
#include <unistd.h>
#include <assert.h>
#include <fcntl.h>

#ifdef _WIN32
#include "winsock2.h"
#define SHUT_WR SD_SEND
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <netdb.h>
#endif

#define VERSION "1"

// Size per network read (max). This seems pretty good.
#define BUFFER_SIZE 4096

void json_out(char *msg, char type) {
	// Emit a formatted JSON message to stdout.
	uint32_t olength;

	olength = 9 + strlen(msg);
	fwrite(&olength, sizeof(uint32_t), 1, stdout);
 	fprintf(stdout, "{\"%c\":\"%s\"}\n", type, msg);

	// Firefox expects this data promptly, so we must flush.
	fflush(stdout);
}

void json_init(char *msg)  { json_out(msg, 'i'); }
void json_error(char *msg) { json_out(msg, 'e'); }
void json_state(char *msg) { json_out(msg, 's'); }
void json_fin(char *msg)   { json_out(msg, 'f'); }

char *unhex(char *msg, uint32_t *out, size_t max) {
	// Convert big-endian hex to an integer.
	// Only max of 2, 4 and 8 hex characters are accepted.
	// Return pointer to the character that follows.
	size_t c;
	unsigned char w;

	*out = 0;
	assert(max == 2 || max == 4 || max == 8);

	for(c=0; c<max; c++) {
		w = (unsigned char)msg[c];
		assert(
			(w >= '0' && w <= '9') ||
			(w >= 'a' && w <= 'f') ||
			(w >= 'A' && w <= 'F')
		);

		*out <<= 4;
		if (w > 96) w = w - 87;
			else
				if (w > 64) w = w - 55;
				else
					w = w - 48;
		*out |= w;
	}
	return (msg + max);
}

int main(int argc, char **argv) {
	char emsg[256];
	char buf[BUFFER_SIZE];
	char ebuf[BUFFER_SIZE + BUFFER_SIZE + 1];
	char *in, *val, *host, *sel;
	uint32_t plength, bread, port, seq, itype, hlength, i, j, k, ln, hn;
	int sockfd, sent, sent_b;
	struct sockaddr_in addr;
	struct hostent *server;
	fd_set fdset, fdrset;
	struct timeval tv;
#ifdef _WIN32
	unsigned char so_error = 0, timeouts = 0;
	size_t so_error_len = sizeof(so_error);
	unsigned long socket_mode = 1;
	WSADATA wsaData;
	DWORD length = 0;

	// Ask for Winsock2 v2.2 (Win98+).
	assert(WSAStartup(MAKEWORD(2,2), &wsaData) != SOCKET_ERROR);

	setmode(fileno(stdin), O_BINARY);
	setmode(fileno(stdout), O_BINARY);
#else
	int so_error = 0;
	socklen_t so_error_len = sizeof(so_error);
#endif	

	json_init("ready v" VERSION);
	for(;;) {

		// Wait for data on stdin.
#ifdef _WIN32
		// select() in Windows only works on sockets, so use Win32 API.
		if (WaitForSingleObject(GetStdHandle(STD_INPUT_HANDLE),
				INFINITE))
			continue;
#else
		FD_ZERO(&fdset);
		FD_SET(STDIN_FILENO, &fdset);

		if (select(STDIN_FILENO + 1, &fdset, NULL, NULL, NULL) < 1)
			continue;
#endif

		// The Native Messaging protocol emits a 32-bit message length
		// in native byte order.
		if (!fread(&plength, sizeof(uint32_t), 1, stdin)) {
			// EOF won't be triggered until we actually read.
			if (feof(stdin)) exit(0);

			// Not EOF, just a malformed packet.
			json_error("no_length_header");
			continue;
		}

#if DEBUG
		fprintf(stderr, "%i bytes to follow\n", plength);
#endif
		in = malloc(plength + 1);
		bread = fread(in, sizeof(char), plength, stdin);
		if (bread != plength) {
			if (sprintf(emsg, "bad_length_header:%i:%i",
				plength, bread))
					json_error(emsg);
			free(in);
			continue;
		}
		in[plength] = '\0';
#if DEBUG
		fprintf(stderr, "received packet >>%s<<\n", in);
#endif

	// Process trivial JSON of this format:
	// {
	// "a" : "hex bytes"
	// }
	//
	// Length and offset below are based on the original bytes, so *2
	// for the hex-encoded bytes. Values are big-endian.
	//
	// Offset  Length  Description
	// ------  ------  -----------
	//   00      02    uint16 Port # or (if 0) cancel transmission.
	// If port is non-zero, then
	//   02      01    uint8 item type
	//   03      02    uint16 length of host name, unencoded
	//   05      --    host name followed by selector
	// End of bytes.

		// Read until we get a colon, then a quotation mark. This is
		// the start of the encoded packet within the JSON wrapper.
		val = in;
		for(;;) {
			if (val[0] == ':') {
				val++;
				break;
			}
			val++;
			assert(val < (in+plength));
		}
		for(;;) {
			if (val[0] == '"') {
				val++;
				break;
			}
			val++;
			assert(val < (in+plength));
		}

		val = (char *)unhex(val, &port, 4);
		if (!port) {
#if DEBUG
			fprintf(stderr, "port = 0, treated as cancel\n");
#endif
			free(in);
			continue;
		}
		assert(port);

		// Port whitelist.
		// These were observationally derived from prior and
		// current extracts of Veronica-2.
		if (!(0 ||
			port == 13 ||
			port == 43 || /* whois */
			port == 70 || /* main port and variant ports */
			port == 71 ||
			port == 72 ||
			port == 79 || /* finger */
			port == 80 || /* some servers speak both */
			port == 105 || /* CSO */
			port == 1070 ||
			port == 2347 || /* Veronica default */
			port == 3000 ||
			port == 3070 ||
			port == 3099 ||
			port == 4323 ||
			port == 7055 ||
			port == 7070 ||
			port == 7071 ||
			port == 7072 ||
			port == 7077 ||
			port == 7080 ||
			port == 7777 ||
			port == 27070 ||
		0)) {
			if (sprintf(emsg, "port_not_allowed:%i", port))
				json_error(emsg);
			free(in);
			continue;
		}

		val = (char *)unhex(val, &itype, 2);
		val = (char *)unhex(val, &hlength, 4);
		assert((hlength + hlength) <= plength);

		host = malloc(hlength + 1);
		for(i=0; i<hlength; i++) {
			assert(val < (in+plength));
			val = (char *)unhex(val, &j, 2);
			host[i] = (char)j;
		}
		host[hlength] = '\0';
		if (val >= (in+plength)) {
			json_error("syntax_error");
			free(host);
			free(in);
			continue;
		}

		sel = malloc(plength - hlength); // XXX: overly cautious
		for(i=0; val<(in + plength); i++) {
			if (val[0] == 34) {
				sel[i] = '\0';
				break;
			}
			val = (char *)unhex(val, &j, 2);
			sel[i] = (char)j;
		}
		if (val == (in + plength)) {
			json_error("syntax_error");
			free(sel);
			free(host);
			free(in);
			continue;
		}

#if DEBUG
		fprintf(stderr, "\"%s\" %i %c \"%s\"\n", host, port, itype, sel);
#endif
		// We now have the host and selector, so we can jettison
		// the input buffer.
		free(in);

		// Attempt to connect.
		json_state("connecting");

		sockfd = socket(AF_INET, SOCK_STREAM, 0);
		server = gethostbyname(host);
		if (sockfd < 0 || server == NULL) {
			json_error("resolve");
			free(sel);
			free(host);
			continue;
		}

		// Use a 10-second connect timeout.
#ifdef _WIN32
		ioctlsocket(sockfd, FIONBIO, &socket_mode);
#else
		fcntl(sockfd, F_SETFL, O_NONBLOCK);
#endif
		memset((char *)&addr, 0, sizeof(addr));
		addr.sin_family = AF_INET;
		memcpy(
			(char *)&addr.sin_addr.s_addr,
			(char *)server->h_addr,
			server->h_length
		);
		addr.sin_port = htons(port);
		(void)connect(sockfd, (const struct sockaddr *)&addr,
			sizeof(addr));

		// The connect is interruptable by activity on stdin.
#ifdef _WIN32
		// This convoluted mess is required because Win32's
		// WaitForMultipleObjects etc. family will always return
		// true on our standard input pipe. We ping-pong between
		// half-second waits on the socket and checking stdin
		// because Winsock select() won't work on input pipes either.
		// Once we get to 10 seconds, or there is stdin, abort.
		// Another such loop is in the data phase later on.

		timeouts = 0;
		for(;;) {
			HANDLE sockh;

			length = 0;

			// Check if there is actually any data on stdin.
			// We don't really care if this fails.
			(void)PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE),
					NULL, 0, NULL, &length, NULL);
			if (length > 0)
				break;

			// No. Check the socket.
			sockh = WSACreateEvent();
			WSAEventSelect(sockfd, sockh, FD_WRITE);
			if(WaitForSingleObject(sockh, 500)) {
				// Not ready, or we timed out.
				timeouts++;
#if DEBUG
				fprintf(stderr, "timeout, %i counted\n",
					timeouts);
#endif
				if (timeouts == 20)
					break;
				continue;
			}

			break;
		}

		if (length > 0) {
			// Data on stdin; abort. The main loop will get it.
			free(sel);
			free(host);
			close(sockfd);
			continue;
		}
		if (timeouts == 20) {
			json_error("timeout");
			free(sel);
			free(host);
			close(sockfd);
			continue;
		}

		timeouts = 0;
#else
		FD_ZERO(&fdset);
		FD_ZERO(&fdrset);
		FD_SET(sockfd, &fdset);
		FD_SET(STDIN_FILENO, &fdrset);
		memset((char *)&tv, 0, sizeof(tv));
		tv.tv_sec = 10;
		tv.tv_usec = 0;

		if (select(sockfd + 1, &fdrset, &fdset, NULL, &tv) < 1) {
			// I guess an errant signal could trigger this,
			// but I really don't care to make it reentrant.
			json_error("timeout");
			free(sel);
			free(host);
			close(sockfd);
			continue;
		}
		if (FD_ISSET(STDIN_FILENO, &fdrset)) {
			// Data on stdin; abort. The main loop will get it.
			free(sel);
			free(host);
			close(sockfd);
			continue;
		}
#endif
		// We have shot our wad at the host, so release that.
		free(host);

		// No data on stdin; must be socket activity.
		// Check if we actually got a connection.
		getsockopt(sockfd, SOL_SOCKET, SO_ERROR, &so_error,
			&so_error_len);
		if (so_error) {
			if (sprintf(emsg, "socket:%i", (unsigned int)so_error))
					json_error(emsg);
#if DEBUG
			perror("socket error");
#endif
			free(sel);
			close(sockfd);
			continue;
		}

		// Connection was successful.
		json_state("connected");

		// Send the selector.
		// Because Winsock doesn't know how to read()/write() on
		// a socket, use send()/recv(), which work everywhere.
		//
		// Note that we are treating our non-blocking socket as if it
		// could atomically write, but we already know the socket is
		// writable, so this invariably "just works" as if it were a
		// blocking socket. It's still wrong, mind you, but it works.
		if (send(sockfd, sel, strlen(sel), 0) < 0) {
			// Failed to send.
			json_error("write_failed");
			free(sel);
			close(sockfd);
			continue;
		}
		json_state("data");

		// Receive data until the socket closes or times out.
		// Any activity on stdin cancels the transmission.
		// We can free everything now, we don't need it anymore.
		shutdown(sockfd, SHUT_WR);
		free(sel);

		for(;;) {
#ifdef _WIN32
			// Another convoluted mess. Here, we ping-pong with a
			// 10 timeout limit. Kludgey, but seems reliable.

			HANDLE sockh;
			DWORD state=0;

			length = 0;

			// Check if there is actually any data on stdin.
			// We don't really care if this fails.
			(void)PeekNamedPipe(GetStdHandle(STD_INPUT_HANDLE),
					NULL, 0, NULL, &length, NULL);
			if (length > 0) {
				// Yes. Terminate.
				json_fin("1:terminated");
				// The loop will pick up the packet shortly.
				break;
			}

			// No. Check the socket.
			sockh = WSACreateEvent();
			WSAEventSelect(sockfd, sockh,
				FD_READ | FD_CLOSE);
			if(WaitForSingleObject(sockh, 500)) {
				// No data, or timed out.
				timeouts++;
#if DEBUG
				fprintf(stderr, "timeout, %i counted\n",
					timeouts);
#endif
				if (timeouts == 10) {
					json_fin("1:timeout");
					break;
				}
				continue;
			}

			// Fall through to recv().
			timeouts = 0;
#else
			FD_ZERO(&fdset);
			FD_SET(sockfd, &fdset);
			FD_SET(STDIN_FILENO, &fdset);
			memset((char *)&tv, 0, sizeof(tv));
			tv.tv_sec = 5;
			tv.tv_usec = 0;

			// Much better!
			if (select(sockfd + 1, &fdset, NULL, NULL, &tv) < 1) {
				json_fin("1:timeout");
				break;
			}
			if (FD_ISSET(STDIN_FILENO, &fdset)) {
				json_fin("1:terminated");
				// The loop will pick up the packet shortly.
				break;
			}
			if (!FD_ISSET(sockfd, &fdset)) {
				// Huh.
				continue;
			}
#endif

			// Must have data on the socket, or EOF.
			k = recv(sockfd, buf, BUFFER_SIZE, 0);
			if (k < 1) {
				json_fin("0:ok");
				break;
			}

			// Emit the data packet.
			// { " d " : "  (6 bytes)
			// k * 2 bytes
			// " } \n (3 bytes)
#if DEBUG
			fprintf(stderr, "data, %i bytes received\n", k);
#endif

			j=0;
			for (i=0; i<k; i++) {
				ln = buf[i] & 0x0f;
				hn = (buf[i] >> 4) & 0x0f;
				ebuf[j++] = (hn > 9) ? hn + 87 : hn + 48;
				ebuf[j++] = (ln > 9) ? ln + 87 : ln + 48;
			}
			ebuf[j] = '\0';
			j += 9;
			fwrite(&j, sizeof(uint32_t), 1, stdout);
			fprintf(stdout, "{\"d\":\"%s\"}\n", ebuf);
			fflush(stdout);
		}

		close(sockfd);
#if DEBUG
		fprintf(stderr, "completed transaction\n");
#endif
		json_init("ready v" VERSION);
	}

	return 0;
}
