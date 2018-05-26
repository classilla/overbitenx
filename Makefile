.PHONY: default clean

# This Makefile is intended for Macs which can build everything.
# If you just want to build a subset, use the individual Makefile.

default:
	$(MAKE) -f Makefile.generic
	$(MAKE) -f Makefile.macos
	$(MAKE) -f Makefile.mxe
	( cd ext && $(MAKE) )

clean:
	$(MAKE) -f Makefile.generic clean
	$(MAKE) -f Makefile.macos clean
	$(MAKE) -f Makefile.mxe clean
	( cd ext && $(MAKE) clean )
