#!/bin/bash
# Local-only pipeline: capture .mov → output.gif → copy/rename to resume-flyer.gif for git/README/LinkedIn.
# *.mov and output.gif are gitignored; keep resume-flyer.gif committed.
ffmpeg -i input.mov -filter_complex "fps=12,scale=iw*0.33:ih*0.333:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output.gif
