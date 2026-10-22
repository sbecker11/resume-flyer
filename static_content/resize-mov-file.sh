#!/bin/bash
ffmpeg -i input.mov -filter_complex "fps=12,scale=iw*0.25:ih*0.25:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output.gif
