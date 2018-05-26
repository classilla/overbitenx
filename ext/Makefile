RM=/bin/rm

# This builds the XPI for Firefox.

.PHONY: default clean

default: clean
	zip -r ../overbitenx.xpi *.js manifest.json d r

clean:
	$(RM) -f ../overbitenx.xpi
